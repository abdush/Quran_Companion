# Schemas Changelog

All changes to the `schemas/` tree land here, schema-first (Rule R1). Interface
changes follow the Interface Change Protocol in `agents/README.md`; each entry
names the consumer-migration note.

## 0.1.1 — 2026-07-26 (Task 0.3, Backend Agent)

Registry data only — **no contract shape changed**, so no consumer migration is
required and no version bump applies to any schema file.

- `licenses.json` — registered the four datasets the `core-hafs` pack ships
  (§6.4, NFR-9): `text:tanzil-uthmani-1.1` (CC-BY-3.0),
  `text:qpc-hafs`, `layout:qpc-hafs-madani-604` and `wbw:en` (all
  `QUL-Community-Resource`, a registry-defined code documented in each entry's
  `usage_constraints`, since QUL publishes these community-curated resources
  without a single SPDX grant). Existing entry `timing:quran-align-1.0` is
  unchanged apart from its position.

  The gate is now executable rather than aspirational:
  `qc_shared.licensing` is the single implementation, used by
  `pack-builder check-licenses`, by the pack builder and loader before any
  write, and by the `services/api` test suite — so an unregistered dataset
  fails CI on the existing `api` path filter (`schemas/**`).

  Attribution strings are copied verbatim from this registry into every pack
  manifest, and a mismatch is a build failure; do not reword an `attribution`
  without rebuilding packs.

Consumers of `openapi/qds.yaml` gained their first implementation
(`get_verse`, `get_page` in `services/api/app/qds`); `get_word` and
`get_audio_index` remain spec-only and are asserted as such by the contract
tests.

## 0.1.0 — 2026-07-25 (Task 0.2, Architecture Agent)

Initial seed. No consumers exist yet, so no migration notes apply.

- `openapi/qds.yaml` **0.1.0** — QDS read endpoints per handbook §6.5 subset:
  `GET /v1/quran/verses/{verse_key}`, `GET /v1/quran/pages/{mushaf_id}/{page}`,
  `GET /v1/quran/words/{word_key}`, `GET /v1/quran/audio/{reciter_id}/{verse_key}`.
  Conventions per §8.1: `/v1` base, snake_case, RFC 9457 problem+json, ETag /
  If-None-Match / 304 on every route.
- `events/envelope.json` **v1** — event envelope per §9.2.
- `events/test.audio.uploaded.json` **v1** — hfz → speech worker.
- `events/speech.transcript.ready.json` **v1** — speech worker → hfz.
- `packs/manifest.schema.json` **manifest_version 1** — matches the §6.3 example.
- `licenses.json` + `licenses.schema.json` **registry_version 1** — licensing
  registry (§6.4) with one worked entry (`timing:quran-align-1.0`).

Consumers (future): Backend (qds, hfz), Speech, Renderer, Mobile/Frontend via
generated `packages/api-client`; DevOps pack-builder via `packs/`.
