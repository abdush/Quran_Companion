# Roadmap

> **Scope:** handbook §27 — development phases, their goals, deliverables, and
> acceptance criteria, plus current progress.
> **Status:** condensed from the handbook and kept current. The phase tables in
> handbook §27 remain the detailed source; this file tracks **where we actually
> are**. Owner: Documentation Agent (updated at the end of every completed task).

## Phase 0 — Foundations *(in progress)*

Make the monorepo buildable, testable, and agent-navigable before feature work.
Acceptance: `docker compose up` serves QDS; the web app renders pages 1–604 from
a pack with correct fonts; checksum tests pass; boundary lint active.

| Task | Deliverable | State |
|---|---|---|
| 0.1 | Monorepo scaffold (handbook §21) + CI skeleton + compose stack | ✅ done |
| 0.2 | Schemas-first setup: QDS read OpenAPI, event envelope + 2 events, pack manifest, licensing registry, codegen + staleness gate, ADRs D-001…D-005 | ✅ done |
| 0.3 | QDS import pipeline (Tanzil/QUL text, layout, word-by-word) + core data pack v1 | ⬜ next (Backend) |
| 0.4 | Documentation scaffold: full §22 doc set; ARCHITECTURE/DATA/STYLEGUIDE/CONTRIBUTING drafted; docs-freshness + terminology CI | ✅ done |
| — | `quran-core` + `mushaf-renderer` static page render | ⬜ not started |
| — | Gateway service | ⬜ not started |

Open ownership questions carried from 0.1: `content/`, `tools/pack-builder`,
`packages/tajweed-rules`, `packages/plugin-sdk`; and `OWNER.md` vs `README.md`
for per-directory owner lines (pending an ADR).

## Phase 1 — MVP (core loop)

Ship the personal read → annotate → memorise → revise → test loop.
Goals: FR-RD-1..6, FR-AN-1..4, FR-HZ-1..5, FR-HZ-8, FR-RV-1..4, FR-TJ-1..3,
FR-AI-1..3, FR-PL-1..3, FR-PL-5.
Acceptance: E2E journeys green on both apps; airplane-mode loop works (minus
speech/tutor); **fabricated-verse eval = 0 incidents**; WER at or under the
agreed baseline; two-device sync chaos test with no loss.
Documentation due: API, AI, SPEECH, SYNC, DATABASE complete.

## Phase 2 — Together & Insight

Family and child voice mode, teacher review, heatmap + forgetting prediction,
confused-verse drills, retention dashboards, community templates, tajweed
text-lint, E2EE private content.
Goals: FR-FM-1..4, FR-TJ-4, FR-TJ-6, FR-HZ-6..7, FR-RV-5, FR-AI-4 (notes),
FR-CM-1..2, FR-AN-5..6, FR-RD-7.

## Phase 3 — Depth & Independence

On-device ASR, semantic search + root explorer, vocabulary builder, qira'at v1
(Warsh), plugin SDK + first content plugins, experimental acoustic tajweed.
Goals: FR-AI-4 (Quran scope), FR-AI-5..7, FR-TJ-5, FR-RD-8, FR-PL-4.

## Future (unscheduled)

Phoneme-level tajweed scoring with scholar-validated rubrics; live halaqah rooms;
OCR import of handwritten margin notes; multi-madhhab knowledge packs; ambient
revision prompts; federation between self-hosted instances.
