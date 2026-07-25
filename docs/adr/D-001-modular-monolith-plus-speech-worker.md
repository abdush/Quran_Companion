# D-001 — Modular monolith + separate speech worker over microservices

- **Status:** Accepted
- **Date:** 2026-07-25 (recorded; decision originates in handbook §5.2, §9.1)
- **Owner:** Architecture Agent

## Context

The system spans many bounded contexts (identity, annotation, memorisation,
Quran data, knowledge/RAG, sync, tutor, speech). It is built largely by AI
agents working in parallel, must stay operable by self-hosters
(`docker compose up`), and has exactly one workload with a genuinely different
runtime profile: speech processing (CPU/GPU-heavy ASR + alignment, §13).

## Decision

Build a **modular monolith**: a single FastAPI application composed of
bounded-context packages (`services/api/app/{usr,ann,hfz,qds,kb,tutor,sync,fam,cm}`),
each owning its tables and exposing a public Python interface (`api.py`).
The **speech worker runs as a separate service from day 1**
(`services/speech`), communicating only via events and object storage (§9.1).
Contexts never import each other's internals; boundary lint (import-linter)
enforces the graph (R4). Contexts are extractable into services later because
the boundaries are already in place.

## Consequences

- Ops stays simple for self-hosters: one API container, one worker, Postgres,
  Redis, MinIO.
- AI agents get clean package boundaries to build against; cross-context
  changes are visible as boundary-lint failures rather than runtime surprises.
- The speech pipeline can scale and fail independently of the API from the
  start; its at-least-once event contract (§9.2) is exercised from Phase 1.
- Single deployable means one shared database instance and release cadence for
  all API contexts until a context is extracted.

## Alternatives considered

- **Full microservices** — rejected: operational burden on self-hosters and
  coordination overhead across agents outweigh benefits at this scale.
- **Single flat monolith (speech in-process)** — rejected: ASR workloads
  starve request-serving; deployment couples GPU/CPU-heavy dependencies into
  the API image.
