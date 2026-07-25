# D-004 — Signed, checksummed data packs for offline; Quran Foundation API as build source/online extra

- **Status:** Accepted
- **Date:** 2026-07-25 (recorded; decision originates in handbook §5.2, §6.3)
- **Owner:** Architecture Agent

## Context

Local-first clients (D-002) need Quran text, layout, word-by-word, and
morphology data available offline. An API-only design breaks the offline
pillar (FR-PL-2). Because this is the sacred text, integrity of distributed
content is non-negotiable (NFR-1): clients must be able to prove that what
they render is exactly the checksummed upstream dataset.

## Decision

Quran content ships as **data packs**: versioned, signed artifacts
(`.qpack` = zip + manifest) built by `tools/pack-builder` from Tanzil/QUL
sources. The manifest schema is `schemas/packs/manifest.schema.json`
(manifest_version 1): pack identity, CalVer version, contents item ids,
SHA-256 checksums per item, per-item license declarations, Ed25519 signature.

Rules:
- Clients **refuse unsigned or checksum-failing packs**.
- Packs are immutable; updates ship as new versions; clients keep at most
  current + previous.
- Audio is not packed by default — it streams from CDN with a per-reciter
  offline download manager.
- The Quran Foundation API and QUL remain **build-time sources** for the pack
  pipeline and an online source for extras; they are not a client runtime
  dependency for core reading.

## Consequences

- Offline reading is a first-class artifact problem: pack building, signing
  keys, and distribution become release infrastructure (DevOps).
- Every pack item must exist in `schemas/licenses.json` (§6.4) — CI enforces
  it, so licensing is auditable per release.
- Dataset upgrades are atomic and reversible (previous pack retained).
- Client storage cost: roughly two packs retained per edition; renderer must
  handle pack-version pinning per mushaf edition.

## Alternatives considered

- **API-only content delivery** — rejected: breaks offline (FR-PL-2), makes
  the client dependent on third-party uptime for its core function.
- **Unsigned bundled assets in the app binary** — rejected: no integrity
  proof, forces app releases for dataset updates, bloats store binaries.
