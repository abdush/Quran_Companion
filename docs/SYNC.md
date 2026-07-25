# Offline & Sync Protocol

> **Scope:** handbook §19 — local-first storage, the CRDT sync model, conflict
> policy, and (eventually) the wire protocol with byte-level examples.
> **Status:** scoped stub (task 0.4). `packages/sync-client` is an empty
> scaffold and no sync endpoint exists. The byte-level protocol spec is a Phase 1
> deliverable. Owner: Documentation Agent; implementation: Sync Agent.

## Local-first storage

| Client | Store |
|---|---|
| Mobile (RN/Expo) | SQLite (expo-sqlite) + files for packs/audio |
| Web | wa-sqlite/OPFS + Cache Storage for packs/audio |

All user-owned entities exist locally; the app is fully functional with zero
connectivity (FR-PL-2, [D-002](adr/D-002-local-first-clients.md)). The local
database is the **source of truth on-device**; the server is a sync and compute
peer, not the origin.

## Sync model

- **CRDT documents** (Yjs, D-014) per data family: `annotations`, `categories`,
  `plans`, `vocab`. The sync service stores snapshots + version vectors; clients
  exchange incremental updates.
- **Append-only logs** (`review_log`, `test_error`, activity) sync by idempotent
  upload + server merge — conflict-free by construction.
- **Server-computed state** (FSRS memory state) is recomputed deterministically
  from merged logs; clients compute the same values locally with the same
  library. Divergence triggers re-derivation from logs — **logs are the source of
  truth**.
- Deletes use tombstones (`deleted_at`), compacted after 90 days.

## Conflict policy

CRDT merge for structured docs. For the rare semantic conflict (e.g. the same
plan edited divergently offline), last-writer-wins per field **with a surfaced
"changes merged" review sheet** — never silent data loss (NFR-12).

## Open items before this doc can be normative

- Wire format and framing of `POST /v1/sync/{doc_key}/changes` (byte-level
  examples required by handbook §22).
- Version-vector encoding and snapshot compaction cadence.
- Interaction with E2EE payloads ([SECURITY.md](SECURITY.md)) — ciphertext CRDT
  updates must remain mergeable server-side without decryption.

Until then, handbook §19 is the reference.
