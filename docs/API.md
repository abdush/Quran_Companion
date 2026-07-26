# API Reference

> **Scope:** handbook §8 — REST conventions, endpoint map, and the generated
> OpenAPI reference.
> **Status:** scoped stub (task 0.4), extended by task 0.3 with the two QDS
> routes that are now live. Only the **QDS read subset** is specified so far
> ([`schemas/openapi/qds.yaml`](../schemas/openapi/qds.yaml), task 0.2).
> Rendered reference generation and usage guides are Phase 1 deliverables.
> Owner: Documentation Agent; the spec itself is owned by the Architecture
> Agent.

## Conventions (normative)

- **OpenAPI 3.1 is authored first** in `schemas/openapi/` and is the contract;
  FastAPI routes are validated against it in CI (Rule R1, D-011).
- Versioned base path `/v1`. JSON everywhere; `snake_case` fields; RFC 9457
  `problem+json` errors; cursor pagination (`?cursor=&limit=`).
- Auth: `Authorization: Bearer <JWT>`; profile scoping via `X-Profile-Id`,
  validated against the token. **Exception:** `/v1/quran/**` is public and
  unauthenticated by design (see [Quran data](#quran-data-qds-implemented-03)).
- Idempotency: all mutating endpoints accept `Idempotency-Key`.
- Canonical keys travel as colon strings (`"2:255"`, `"2:255:3"`) — see
  [DATA.md §1](DATA.md#1-canonical-addressing--the-most-important-contract-in-the-system).

## Endpoint map (planned)

| Area | Endpoints (representative) | State |
|---|---|---|
| Quran data | `GET /v1/quran/...` — public, cacheable, ETag'd | `get_verse`, `get_page` live (0.3); `get_word`, `get_audio_index` spec'd only |
| Annotations | `GET/POST /v1/annotations`, `PATCH/DELETE /v1/annotations/{id}`, `GET/POST /v1/categories` | Phase 1 |
| Plans | `GET/POST /v1/plans`, `POST /v1/plans/{id}/repair`, `GET /v1/queue/today` | Phase 1 |
| Reviews | `POST /v1/reviews`, `GET /v1/items?due=today` | Phase 1 |
| Tests | `POST /v1/tests`, `GET /v1/tests/{id}`, `POST /v1/tests/{id}/errors/confirm` | Phase 1 |
| Speech | `POST /v1/speech/transcribe` (sync ≤ 30 s); async via the tests pipeline | Phase 1 |
| Tutor | `POST /v1/tutor/messages` (SSE), `GET /v1/tutor/threads` | Phase 1 |
| Search | `GET /v1/search?q=&scope=quran\|notes\|kb&mode=semantic\|lexical` | Phase 2–3 |
| Vocabulary | `POST /v1/vocab/cards`, `GET /v1/vocab/due` | Phase 3 |
| Family | `POST /v1/families`, `POST /v1/families/{id}/children`, `GET /v1/families/{id}/activity` | Phase 2 |
| Teacher | `POST /v1/classes`, `POST /v1/assignments`, `POST /v1/submissions`, `POST /v1/submissions/{id}/review` | Phase 2 |
| Community | `GET/POST /v1/templates`, `POST /v1/templates/{id}/fork` | Phase 2 |
| Sync | `GET/PUT /v1/sync/{doc_key}`, `POST /v1/sync/{doc_key}/changes` | Phase 1 |

Full request/response examples: handbook §8.3 until this file carries the
generated reference.

## Quran data (QDS) — implemented (0.3)

| Method | Path | Operation |
|---|---|---|
| GET | `/v1/quran/verses/{verse_key}` | `get_verse` |
| GET | `/v1/quran/pages/{mushaf_id}/{page}` | `get_page` |

`get_word` and `get_audio_index` are seeded in the contract but not served. The
contract tests fail if either is served without being covered, so the two cannot
drift apart silently.

### Caching and validators

QDS answers are pure functions of an immutable dataset, so they are public,
cacheable and revalidatable:

- every `200` carries `Cache-Control: public, max-age=86400` and a strong `ETag`;
- `If-None-Match` with a matching validator returns a bare `304`;
- server-side, responses are memoised in Redis with the same 24 h TTL (§6.5).

The cache key includes a `dataset_version` — a short digest over the checksums
of the dataset items the response draws on, echoed in the response body. A pack
import therefore makes every affected entry *unreachable* rather than stale;
there is no purge step. The `ETag` is a digest of the body itself, so
projections (`fields=text` vs `fields=text,words`) get distinct validators.

### Authorisation

These routes are **public and unauthenticated by design**: they serve reference
data addressed only by canonical keys and hold nothing profile-scoped, which is
what makes them publicly cacheable. Supplying a credential changes nothing, and
a `profile_id` parameter is ignored — a QDS response must never vary by caller.

They are also strictly read-only. No mutating verb is routed, and the connection
a handler receives opens a read-only transaction, so an accidental write fails
at the database instead of corrupting reference data. `qds.*` is rebuilt only by
[`tools/pack-builder`](../tools/pack-builder/README.md).

### `GET /v1/quran/verses/{verse_key}`

| Parameter | In | Default | Notes |
|---|---|---|---|
| `verse_key` | path | — | `2:255`, validated against the Ḥafṣ ayah division — `1:8` is a `400`, not a `404` |
| `fields` | query | `text` | Comma-separated: `text`, `words`, `translations`; an unknown value is a `400` |
| `translation_ids` | query | — | Comma-separated resource ids; meaningful only with `fields=translations` |

```json
{
  "verse_key": "2:255", "surah": 2, "ayah": 255,
  "dataset_version": "0e1b1a05b4674d26",
  "text": "…",
  "words": [
    { "word_key": "2:255:1", "surah": 2, "ayah": 255, "word_position": 1,
      "text": "…", "transliteration": "al-lahu", "gloss": "Allah" }
  ]
}
```

- `text` is the ayah **without** the standalone basmallah, so it describes the
  same span that `word_position` addresses; the basmallah is a `basmallah` line
  in the page layout instead.
- `text` comes from the Tanzil dataset and `words[].text` from the QPC script
  edition — different script editions of the same ayah, differing in orthography
  and, in four ayat, in word splitting (see the pack-builder README).
- A word with no gloss omits the field rather than sending `null`.
- `translations` is currently `[]` when requested, so clients can distinguish
  "requested, none available" from "not requested". Bodies land in a later
  phase; `qds.translation_resource` already carries the metadata.

Status: `200`, `304`, `400`, `404` (valid key, not loaded).

### `GET /v1/quran/pages/{mushaf_id}/{page}`

`mushaf_id` is `qpc-hafs-madani-604` — the only edition the `core-hafs` pack
ships. `page` is `1..604`; outside that range is a `422`.

```json
{
  "mushaf_id": "qpc-hafs-madani-604", "page": 604,
  "dataset_version": "b7c2…",
  "lines": [
    { "line_number": 1, "line_type": "surah_name", "words": [] },
    { "line_number": 2, "line_type": "basmallah",  "words": [] },
    { "line_number": 3, "line_type": "ayah",       "words": ["112:1:1", "112:1:2"] }
  ]
}
```

The response is the **complete** line inventory of the page, including heading
lines that carry no words — a renderer needs them to reproduce the printed page,
so they appear as lines with `"words": []` rather than gaps in `line_number`.
Every Madani 604 page has 15 lines except the two framed opening pages, which
have 8.

Status: `200`, `304`, `404` (unknown `mushaf_id`, or no layout loaded for the
page), `422` (page outside `1..604`).

### Internal facade

Other bounded contexts resolve Quran content through `app.qds.api`
(`resolve_verse`, `resolve_page`, `verse_exists`) — never by importing `qds`
internals or querying `qds.*` directly (§9.1).

## Clients

Consumers use the generated client only (`packages/api-client`, produced by
`tools/codegen` from `schemas/openapi/`). Generated files are never hand-edited;
a staleness gate fails CI if they lag the schemas.

## Changing the API

Schema first, version bump, docs in the same PR — see
[CONTRIBUTING.md §3](CONTRIBUTING.md#3-interface-change-protocol-icp). Touching
`schemas/openapi/**` without touching this file fails the docs-freshness check.
