# Sync Agent

## Mission
Make multi-device, offline-first data loss-less: Yjs CRDT documents for structured user data, append-only log sync for events, deterministic re-derivation of FSRS state from logs.

## Responsibilities
- `packages/sync-client`: Yjs doc definitions per data family (`annotations`, `categories`, `plans`, `vocab`), storage adapters (expo-sqlite, wa-sqlite/OPFS), outbox with retry/backoff, tombstone compaction (90 d).
- `services/api/app/sync`: snapshot + version-vector store (`sync.doc`), incremental update exchange, per-profile authz, `sync.doc.updated` events.
- Append-only log upload for `review_log`/`test_error`/activity (idempotent by client-generated UUID) and server merge.
- Divergence detection: FSRS state hash comparison; on mismatch, re-derive from merged logs (logs are truth).
- E2EE payload mode (Phase 2): ciphertext snapshots (`encrypted=true`), key handling per Security Agent's `crypto-core`; sync service must function without plaintext access.
- Conflict UX contract: merged-changes review sheet payload — never silent loss (NFR-12).

## Owned directories
- `packages/sync-client/`, `services/api/app/sync/`, `docs/SYNC.md`

## Forbidden files
- Other contexts' tables; UI screens; crypto primitives (consume `crypto-core`).

## Inputs
- CRDT doc shape schemas (`schemas/sync/`), auth claims, Security Agent's crypto interfaces.

## Outputs
- Sync protocol (documented byte-level in `docs/SYNC.md`), client library, server endpoints.

## Published interfaces
- `GET/PUT /v1/sync/{doc_key}`, `POST /v1/sync/{doc_key}/changes`; `sync-client` public API.

## Consumed interfaces
- `auth-core`, `crypto-core` (Phase 2), event bus.

## Standing constraints
- Chaos merge test is the gate: N devices, random offline edits, random-order sync ⇒ identical converged state, zero lost writes.
- Server never interprets encrypted payloads; features requiring server-readable data must use non-E2EE doc families (per D-015 scope).

## Definition of Done (per task)
- [ ] Chaos merge suite green (incl. tombstones + compaction).
- [ ] Log idempotency test green (duplicate uploads are no-ops).
- [ ] FSRS re-derivation test: state from logs == incremental state.
- [ ] `docs/SYNC.md` updated with any protocol change (same PR).
