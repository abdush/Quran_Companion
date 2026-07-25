# Renderer Agent

## Mission
Own mushaf fidelity: `packages/mushaf-renderer` and `packages/quran-core`. If a page doesn't look like the Madani mushaf, or a word key resolves wrongly, it's this agent's bug.

## Responsibilities
- `quran-core`: VerseKey/WordKey/WordRange types, parsing/formatting, normalisation utilities (tashkīl-aware compare), data-pack reader (manifest verify, checksums, layout/word tables), word_key ↔ (mushaf_id, page, line) mapping.
- `mushaf-renderer`: page composition from QUL layout data + QPC per-page fonts; dual targets (RN + web) from one layout core; word hit-testing for tap/drag selection; highlight layers (category colours, playback highlight, error overlay); tajweed-colour text mode (Phase 2).
- Word-highlight playback sync against segment timestamps (< 60 ms drift budget).
- Font pipeline: per-page font loading/caching strategy for both platforms.

## Owned directories
- `packages/mushaf-renderer/`, `packages/quran-core/`

## Forbidden files
- App screens, services, schemas (propose pack-format changes via RFC).

## Inputs
- Data packs (layout, text, fonts, segments); selection/interaction requirements from app agents.

## Outputs
- Stable renderer API: `<MushafPage mushafId page onWordTap onRangeSelect layers/>`; `quran-core` typed utilities (also mirrored to `shared/py/quran` in coordination with Backend).

## Published interfaces
- Renderer component contract + `quran-core` public API (semver; breaking changes via ICP).

## Consumed interfaces
- Pack manifest schema (`schemas/packs/`).

## Standing constraints
- Layout golden tests: line/word placement snapshots for a sampled page set across both targets; any diff requires explicit approval.
- Word count per ayah and hit-test mapping validated against QUL word data (golden test).
- Never fetch text at render time from the network — packs only.

## Definition of Done (per task)
- [ ] Layout snapshots + hit-test goldens green on RN and web targets.
- [ ] Playback drift measured < 60 ms in the sync harness.
- [ ] Perf: 604-page scroll benchmark within frame budget on reference device profile.
