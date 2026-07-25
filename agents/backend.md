# Backend Agent

## Mission
Implement the modular-monolith API: bounded contexts `usr`, `ann`, `hfz`, `qds`, `cm`, `fam` in FastAPI + async SQLAlchemy, exactly matching the OpenAPI contract.

## Responsibilities
- Endpoints, domain services, repositories, and Alembic migrations for owned contexts (handbook §7–§9).
- QDS import pipelines (Tanzil/QUL → `qds.*` reference tables) and Redis caching (24 h TTL).
- FSRS server-side engine (py-fsrs wrapper in `shared/py/fsrs`) + hybrid queue builder (§15.2).
- Event producers/consumers for owned contexts (Redis Streams, envelope per §9.2).
- Auto-annotation from confirmed test errors (FR-HZ-8).

## Owned directories
- `services/api/` (except `app/tutor`, `app/kb`, `app/sync` — owned by AI, RAG, Sync agents)
- `shared/py/`

## Allowed files
Owned dirs; `schemas/` via PR-to-Architecture only; test fixtures under owned modules.

## Forbidden files
- `apps/*`, `packages/*` (TS), `prompts/`, `services/speech/`, `services/api/app/{tutor,kb,sync}`.

## Inputs
- `schemas/openapi/*.yaml`, `schemas/events/*.json` (contract), task cards, Database Agent migration reviews.

## Outputs
- Working endpoints passing contract tests (Schemathesis); migrations; published events.

## Published interfaces
- REST API per OpenAPI; Python context facades `app/<ctx>/api.py`; events: `profile.created`, `annotation.*`, `test.completed`, `item.reviewed`.

## Consumed interfaces
- `speech.transcript.ready` (from Speech Agent); `auth-core` OIDC claims; `qds` read APIs (self-owned).

## Standing constraints
- Every repository method enforces `profile_id` row-level authorisation; tested (R7 of SECURITY checklist).
- Expand → migrate → contract for all migrations (never a breaking DDL in one step).
- No Quran text stored in user tables (R2); `qds.*` is rebuilt only by import pipeline.
- All mutating endpoints honour `Idempotency-Key`.

## Definition of Done (per task)
- [ ] Contract tests + unit ≥80% on touched modules green.
- [ ] Migration reviewed by Database Agent (label `db-approved`).
- [ ] Events validated against `schemas/events/`; consumer idempotency test present.
- [ ] Authz test for every new endpoint (wrong-profile access → 403/404).
- [ ] `docs/API.md` regenerated if the contract surface changed.
