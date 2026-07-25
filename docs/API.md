# API Reference

> **Scope:** handbook §8 — REST conventions, endpoint map, and the generated
> OpenAPI reference.
> **Status:** scoped stub (task 0.4). Only the **QDS read subset** is specified
> so far ([`schemas/openapi/qds.yaml`](../schemas/openapi/qds.yaml), task 0.2);
> no endpoint is implemented yet. Rendered reference generation and usage guides
> are Phase 1 deliverables. Owner: Documentation Agent; the spec itself is owned
> by the Architecture Agent.

## Conventions (normative)

- **OpenAPI 3.1 is authored first** in `schemas/openapi/` and is the contract;
  FastAPI routes are validated against it in CI (Rule R1, D-011).
- Versioned base path `/v1`. JSON everywhere; `snake_case` fields; RFC 9457
  `problem+json` errors; cursor pagination (`?cursor=&limit=`).
- Auth: `Authorization: Bearer <JWT>`; profile scoping via `X-Profile-Id`,
  validated against the token.
- Idempotency: all mutating endpoints accept `Idempotency-Key`.
- Canonical keys travel as colon strings (`"2:255"`, `"2:255:3"`) — see
  [DATA.md §1](DATA.md#1-canonical-addressing--the-most-important-contract-in-the-system).

## Endpoint map (planned)

| Area | Endpoints (representative) | State |
|---|---|---|
| Quran data | `GET /v1/quran/...` — public, cacheable, ETag'd | spec'd (0.2), unimplemented |
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

## Clients

Consumers use the generated client only (`packages/api-client`, produced by
`tools/codegen` from `schemas/openapi/`). Generated files are never hand-edited;
a staleness gate fails CI if they lag the schemas.

## Changing the API

Schema first, version bump, docs in the same PR — see
[CONTRIBUTING.md §3](CONTRIBUTING.md#3-interface-change-protocol-icp). Touching
`schemas/openapi/**` without touching this file fails the docs-freshness check.
