# Architecture

> **Scope:** system architecture (handbook §5) and service boundaries + event
> architecture (handbook §9). This document is **authoritative** for the shapes
> below; when it and the handbook disagree, the handbook wins and this file is
> corrected in the same PR (Rule R5). Owner: Documentation Agent; architectural
> decisions themselves are owned by the Architecture Agent via
> [DECISIONS.md](DECISIONS.md).
>
> **Related:** [DATA.md](DATA.md) (Quran data + packs) · [API.md](API.md) ·
> [SYNC.md](SYNC.md) · [SECURITY.md](SECURITY.md) · [DATABASE.md](DATABASE.md)

---

## 1. High-level architecture

```mermaid
graph TB
    subgraph Clients
        MOB[Mobile App<br/>React Native + Expo]
        WEB[Web App<br/>React + Vite PWA]
    end

    subgraph Edge
        GW[API Gateway<br/>Auth, rate limit, routing]
        CDN[CDN / Object Storage<br/>audio, fonts, data packs]
    end

    subgraph Core Services
        USR[User Service<br/>profiles, families, classes]
        ANN[Annotation Service<br/>notes, highlights, categories]
        HFZ[Memorisation Service<br/>plans, FSRS state, tests]
        SYNC[Sync Service<br/>CRDT doc store]
        QDS[Quran Data Service<br/>text, layout, morphology, audio index]
    end

    subgraph AI Services
        TUT[AI Tutor Service<br/>orchestration]
        RAG[RAG Service<br/>retrieval + citation]
        EMB[Embedding Service]
        SPX[Speech Service<br/>ASR, alignment, diff]
        TJL[Tajweed Lint Service<br/>rule engine]
    end

    subgraph Data Stores
        PG[(PostgreSQL<br/>+ pgvector)]
        RD[(Redis<br/>cache + queues)]
        OBJ[(S3-compatible<br/>object storage)]
    end

    MOB --> GW
    WEB --> GW
    MOB --> CDN
    WEB --> CDN
    GW --> USR & ANN & HFZ & SYNC & QDS & TUT & SPX
    TUT --> RAG --> EMB
    RAG --> QDS
    SPX --> TJL
    SPX --> QDS
    USR & ANN & HFZ & SYNC & QDS & RAG --> PG
    QDS & RAG & SPX --> RD
    SPX --> OBJ
```

"Service" in the diagram is a **logical** boundary. Physically (D-001) the core
and AI services except Speech are packages inside one FastAPI application
(`services/api/app/<ctx>/`); the Speech worker is a separate process from day 1
because its runtime profile (CPU/GPU-heavy, long jobs) genuinely differs.

## 2. Architectural style & rationale

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Service granularity | **Modular monolith → extractable services** (single FastAPI app composed of bounded-context packages; Speech runs as a separate worker from day 1) | Full microservices; single flat monolith | AI agents build against clean package boundaries; ops stays simple for self-hosters; the only genuinely different runtime profile (GPU/CPU-heavy speech) is isolated early. |
| Client architecture | **Local-first**: clients own a local database; server is a sync + compute peer | Thin clients | FR-PL-2/3; offline is a pillar; hifz sessions happen without connectivity. |
| Data flow | **REST for request/response, event bus (Redis Streams) for async pipelines** | gRPC, Kafka | REST is friction-free for agents and self-hosters; Redis Streams is already in the stack, sufficient at this scale, upgradeable to NATS/Kafka behind the `events` package interface. |
| Quran content | **Bundled data packs built from Tanzil/QUL + optional live Quran Foundation API** | API-only | API-only breaks offline (FR-PL-2). Data packs are versioned, checksummed artifacts (see [DATA.md](DATA.md)); the API remains a source for pack building and online-only extras. |

Recorded as ADRs: [D-001](adr/D-001-modular-monolith-plus-speech-worker.md),
[D-002](adr/D-002-local-first-clients.md),
[D-004](adr/D-004-signed-data-packs.md),
[D-005](adr/D-005-postgres-pgvector-redis.md), and D-012 (Redis Streams events,
ADR file pending).

## 3. Client architecture (shared pattern, both platforms)

```mermaid
graph LR
    UI[UI Layer<br/>screens, mushaf renderer] --> ST[State<br/>Zustand + TanStack Query]
    ST --> DOM[Domain Layer<br/>plan engine, FSRS, diff view-models]
    DOM --> LDB[(Local DB<br/>SQLite / OPFS-sqlite-wasm)]
    DOM --> SY[Sync Client<br/>CRDT + outbox]
    SY --> API[API Client<br/>generated from OpenAPI]
    DOM --> PACKS[Data Pack Reader<br/>read-only Quran content]
```

Rules (enforced by dependency-cruiser, Rule R4):

- The **mushaf renderer**, **FSRS engine**, **diff view-model**, and **sync
  client** are shared TypeScript packages (`packages/*`) consumed by both apps —
  never duplicated.
- Local DB schema mirrors the server's logical model for user-owned entities
  (see [DATABASE.md](DATABASE.md)) and is the source of truth on-device.
- All server calls go through the generated API client
  (`packages/api-client/src/generated`, produced by `tools/codegen` from
  `schemas/openapi/`); **no hand-written fetch calls in feature code**.

## 4. Bounded contexts & ownership

| Context | Package | Owns tables | Publishes events | Consumes |
|---|---|---|---|---|
| Identity | `services/api/app/usr` | `usr.*`, `fam.*` | `profile.created` | — |
| Annotation | `.../ann` | `ann.*` | `annotation.created/updated` | `test.error.confirmed` |
| Memorisation | `.../hfz` | `hfz.*` | `test.completed`, `item.reviewed` | `speech.transcript.ready` |
| Quran Data | `.../qds` | `qds.*` | — | — |
| Knowledge/RAG | `.../kb` | `kb.*` | — | — |
| Sync | `.../sync` | `sync.*` | `sync.doc.updated` | — |
| Speech (worker) | `services/speech` | — (object storage only) | `speech.transcript.ready` | `test.audio.uploaded` |
| Tutor | `services/api/app/tutor` | thread tables | — | — |

**Hard rules.** Contexts never import each other's internals; interaction is via
the public Python interface `services/api/app/<ctx>/api.py` or via events. The
Speech worker communicates **only** through events and object storage. Violations
fail CI (import-linter for Python, dependency-cruiser for TypeScript) and are
never suppressed to make a PR pass (Rule R4).

Cross-context data access that "just needs one field" is the classic breach:
the fix is a public read method on the owning context's `api.py`, or an event —
never a direct table or module import. Changing such an interface follows the
**Interface Change Protocol** (`agents/README.md`): RFC issue → Architecture
Agent ADR → schema-first landing with a version bump.

## 5. Event bus

Redis Streams, one stream per event type, consumer groups per service. Envelope
(normative schema: [`schemas/events/envelope.json`](../schemas/events/envelope.json)):

```json
{ "event_id": "uuid", "type": "speech.transcript.ready", "occurred_at": "…",
  "profile_id": "…", "payload": { "test_id": "…", "transcript_ref": "s3://…" }, "schema_version": 1 }
```

- All event payload schemas live in `schemas/events/`; **producers validate
  before publishing** (Rule R1: schema first, then code).
- At-least-once delivery; **consumers are idempotent, keyed on `event_id`**
  (Rule R6) and tolerate redelivery and out-of-order arrival.
- Dead-letter stream per consumer group, with alerting on growth.
- Event bodies carry **references, not content**: object-storage refs for
  transcripts and audio, canonical keys for Quran content. No note bodies,
  transcripts, or user-linked audio paths in events or logs (Rule R7).

Events defined so far (task 0.2):

| Event | Schema | Producer → consumer |
|---|---|---|
| `test.audio.uploaded` | [`schemas/events/test.audio.uploaded.json`](../schemas/events/test.audio.uploaded.json) | api (hfz) → speech worker |
| `speech.transcript.ready` | [`schemas/events/speech.transcript.ready.json`](../schemas/events/speech.transcript.ready.json) | speech worker → api (hfz) |

Adding or changing an event is an interface change: update `schemas/events/`,
log it in `schemas/CHANGELOG.md`, and update this section in the same PR — the
docs-freshness check enforces the last part.

## 6. Core async flow: recitation test

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API (hfz)
    participant OS as Object Storage
    participant SP as Speech Worker
    participant TJ as Tajweed Lint

    C->>API: POST /v1/tests (range, mode)
    API-->>C: test_id + presigned upload URL
    C->>OS: PUT audio.opus
    OS-->>API: (client confirms upload) → publish test.audio.uploaded
    SP->>OS: fetch audio
    SP->>SP: VAD → ASR (whisper-ar-quran) → align → diff vs canonical
    SP-->>API: publish speech.transcript.ready (+ error list)
    API->>TJ: lint recited range (rule contexts)
    API->>API: classify errors, update FSRS grades, auto-create annotations
    C->>API: GET /v1/tests/{id} → full report
    Note over OS: audio deleted after processing unless user opted to keep
```

Two invariants worth restating because they are cross-cutting:

1. The **error taxonomy** produced by the diff step (`stop`, `hesitation`,
   `substitution`, `omission`, `insertion`, `similar_jump`, `context_note`) is
   the same enum in the worker, the API, the analytics, and the UI — see
   [SPEECH.md](SPEECH.md) and the terminology check in
   [`docs/ci/`](ci/README.md).
2. Recitation audio is **deleted after processing** unless the user explicitly
   saved or submitted it (NFR-4, FR-TJ-1).

## 7. Current implementation status (Phase 0)

What exists in the repo today, so this document is not read as a description of
running software:

| Element | State |
|---|---|
| Monorepo layout (handbook §21) | Scaffolded (task 0.1) |
| `services/api` (FastAPI) | Health endpoint only; bounded-context packages not yet created |
| `services/speech` | Idle worker skeleton; consumes nothing yet |
| Gateway | Not started (compose stack runs api, speech, postgres, redis, minio) |
| `packages/*` | Directory scaffolds + `api-client` generated types |
| Event bus | Schemas defined (`test.audio.uploaded`, `speech.transcript.ready`); no producer/consumer code yet |
| QDS | OpenAPI read subset specified (`schemas/openapi/qds.yaml`); import pipeline is task 0.3 |
| Boundary lint | dependency-cruiser + import-linter wired as CI stubs |

Update this table whenever a row's state changes.
