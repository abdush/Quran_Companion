# D-002 — Local-first clients; server as sync/compute peer

- **Status:** Accepted
- **Date:** 2026-07-25 (recorded; decision originates in handbook §5.2, §19)
- **Owner:** Architecture Agent

## Context

Offline operation is a product pillar (FR-PL-2/3): ḥifẓ revision sessions
routinely happen with no connectivity, and the app must be fully functional in
airplane mode with < 2 s to interactive (§26). Thin clients cannot satisfy
this; intermittent-sync designs bolted onto server-authoritative state produce
conflict bugs.

## Decision

Clients **own a local database** (SQLite on mobile via expo-sqlite;
wa-sqlite/OPFS on web) holding all user-owned entities; the local DB is the
source of truth on-device. The server is a **sync and compute peer**: CRDT
document sync (Yjs, D-014) for structured data, idempotent append-only log
upload for review/test logs, and server-side recompute of derived state (FSRS)
from merged logs. Quran content comes from local data packs (D-004), not from
per-request API calls.

## Consequences

- Full read/annotate/revise functionality offline; sync is background repair,
  not a prerequisite.
- Every user-owned entity needs a local schema mirror (§7) and a sync story
  (CRDT doc, append-only log, or derived state) — this is a per-feature design
  obligation, tracked in `docs/SYNC.md`.
- Derived state must be deterministically recomputable from logs; divergence
  triggers re-derivation (logs win).
- Server compute (speech, tutor, embeddings) remains online-only by nature;
  the UX must degrade explicitly for those features.

## Alternatives considered

- **Thin clients / server-authoritative REST** — rejected: breaks the offline
  pillar outright.
- **Cache-based offline (HTTP cache + request queue)** — rejected: cannot
  express merge semantics for annotations/plans; silent-loss conflict
  behaviour violates NFR-12.
