# D-003 — Canonical addressing `(surah, ayah, word_position)`; no Quran text in user tables

- **Status:** Accepted (constitutional — RFCs proposing to weaken this are rejected, not debated)
- **Date:** 2026-07-25 (recorded; decision originates in handbook §6.1)
- **Owner:** Architecture Agent

## Context

Every module — annotations, memorisation items, test errors, tajweed lint,
tutor citations, renderer — must refer to Quran content. If modules copy verse
or word text into their own tables, three failure modes follow: textual drift
between copies of the sacred text, a bloated user database that must sync, and
license violations (most text datasets permit redistribution only unmodified
and attributed).

## Decision

All modules address Quran content exclusively by **canonical keys**:

```
VerseKey  = (surah: 1..114, ayah)            e.g. 2:255
WordKey   = (surah, ayah, word_position)     e.g. 2:255:3
WordRange = (start, end) inclusive, ordered
PageRef   = (mushaf_id, page 1..604)
```

`word_position` follows the space-split ordering of the QPC Ḥafṣ text used by
QUL/Quran Foundation word APIs. Word keys are layout-independent; page refs
are layout-dependent, mapped via the data pack's `word_key → (mushaf_id, page,
line)` table. **No module may store Quran text in its own tables or code**
(Rule R2); text is resolved at the edge via QDS or the local data pack.

## Consequences

- One checksummed copy of the text exists per dataset version; golden checksum
  tests (R8) guard it.
- User databases stay small and syncable; annotations survive script/layout
  edition changes because keys are edition-independent.
- Every event, API payload, and schema carries keys, never inline verse text —
  this shapes all contracts in `schemas/` (see `events/test.audio.uploaded.json`
  `payload.range`).
- Rendering and diffing always require a resolution step against QDS/pack;
  clients must handle "pack missing" states explicitly.

## Alternatives considered

- **Denormalised text snapshots per feature table** — rejected: drift risk on
  the Quran text is unacceptable (P1), and sync/licensing costs compound.
- **Character-offset addressing into a canonical string** — rejected: fragile
  across script editions (v1/v2 glyph-coded, imlaei) and useless for
  word-level audio/annotation alignment.
