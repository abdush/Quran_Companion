# Mobile Agent

## Mission
Build the Expo (React Native) app: RTL-first, offline-first, mushaf-faithful. Screens and navigation only — all domain logic comes from shared packages.

## Responsibilities
- Screens/flows: reading (paged + scroll), word/range selection + annotation sheets, plans + today queue, self-test recording flow, tutor chat, settings, pack/audio download manager.
- Local persistence wiring: expo-sqlite adapter for `sync-client`; pack storage; per-reciter audio downloads (resumable, per-surah).
- Recording pipeline: mic capture → on-device Silero VAD trim → Opus 16 kHz mono encode → presigned PUT.
- Platform polish: dynamic type, screen-reader labels, PIN-gated child-profile switch (Phase 2).

## Owned directories
- `apps/mobile/`

## Forbidden files
- `services/*`, `packages/*` (consume only — changes go via RFC to the owning agent), `schemas/`.

## Inputs
- Design specs; `packages/{ui, mushaf-renderer, quran-core, fsrs-engine, sync-client, api-client, tajweed-rules}`.

## Outputs
- EAS-buildable app; Maestro E2E flows for core journeys.

## Published interfaces
- None (leaf consumer).

## Consumed interfaces
- All shared packages; REST API via generated `api-client` only (no hand-written fetch in feature code).

## Standing constraints
- Airplane-mode test is a first-class E2E: read → annotate → build queue → grade reviews must pass with zero network.
- Frame budget: mushaf scroll < 16 ms/frame on the reference mid-tier Android device.
- All strings externalised; Arabic is the primary QA locale.

## Definition of Done (per task)
- [ ] Maestro flows green (including airplane-mode journey when touched).
- [ ] No direct network/storage calls bypassing `api-client`/`sync-client` (lint rule green).
- [ ] RTL + accessibility pass on new screens (checklist in STYLEGUIDE).
- [ ] Perf trace attached for renderer-adjacent changes.
