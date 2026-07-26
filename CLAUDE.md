# Quran Companion — Claude Code Instructions

You are working inside the Quran Companion monorepo. This repository is built by specialised agents, each with a binding playbook. **Do not write code before completing the Session Start Protocol below.**

## Session Start Protocol (mandatory, every session)

1. Identify which agent role this session is running as (stated in the session prompt, e.g. "You are the DevOps Agent").
2. Read `agents/README.md` (universal rules R1–R8 and the Interface Change Protocol).
3. Read your playbook `agents/<agent>.md`. Your **Owned directories** are the only places you may create or edit files. **Forbidden files** are absolute.
4. Read only the handbook sections and schemas listed as your **Consumed interfaces** — do not load the whole handbook into context.
5. Restate the task's Definition of Done as a checklist before writing any code, and verify it before declaring the task complete.

## Repository map

- `ENGINEERING_HANDBOOK.md` — single source of truth for architecture, requirements (FR/NFR ids), phases, and ADRs. When code and handbook disagree, the handbook wins; raise it, don't silently diverge.
- `agents/` — one playbook per agent role + README with universal rules.
- `schemas/` — OpenAPI, JSON Schemas (events, packs, templates), `licenses.json`. **Schemas change first, code second** (Rule R1).

## Non-negotiable rules (summary — full text in agents/README.md)

- **Never store or generate Quran text in user tables or code.** Reference by canonical keys `(surah, ayah, word_position)`; resolve via QDS or data packs. (D-003)
- **Zero tolerance for fabricated religious content.** Any path emitting Quranic or scholarly text goes through the verse verifier / citation checker / reference validator. (D-009)
- Stay inside your agent's owned directories. Cross-boundary changes require an RFC issue per the Interface Change Protocol — do not "just fix it".
- Never weaken a golden test, suppress a boundary-lint rule, or bypass a CI gate to make something pass.
- No secrets in code; no note bodies, transcripts, or audio-user linkage in logs.
- Interface-affecting changes update the corresponding `docs/*.md` in the same commit.

## Conventions

- TypeScript: pnpm workspaces + Turborepo; Vitest; generated `api-client` only (no hand-written fetch in feature code).
- Python: uv; FastAPI + async SQLAlchemy; Alembic (expand → migrate → contract); pytest.
- Commits: conventional commits, one task per branch, reference the task id and FR ids (e.g. `feat(qds): import Tanzil text [0.3.2, FR-RD-1]`).
- Arabic is a first-class locale: RTL-first UI, Arabic strings reviewed for typography correctness.

## Current status

- **Phase:** 0 (Foundations) — see handbook §27 and §29.
- **Done:** handbook, agent playbooks; **0.1 monorepo scaffold + CI skeleton** (§21 tree, pnpm+Turborepo, uv services with health checks, compose stack verified healthy, path-filtered CI, boundary-lint stubs); **0.2 Schemas-first setup (Architecture, 2026-07-25)** — `schemas/` seed (QDS read OpenAPI 3.1, event envelope + `test.audio.uploaded`/`speech.transcript.ready`, pack manifest, licensing registry + schema), `tools/codegen` → `packages/api-client/src/generated` with CI staleness gate (`.github/workflows/schemas-codegen.yml`), ADRs D-001…D-005 in `docs/adr/` + `docs/DECISIONS.md`. Schema changes log to `schemas/CHANGELOG.md`. Resolves the 0.1 open item on `tools/codegen` ownership: Architecture Agent owns it as the schemas→types codegen tool.
- **Done (cont.):** **0.4 Documentation scaffold (Documentation, 2026-07-25)** — every handbook §22 file now exists under `docs/` (index in `docs/README.md`); `ARCHITECTURE.md` (§5+§9), `DATA.md` (§6), `STYLEGUIDE.md` (code style, RTL/i18n + Arabic typography, canonical terminology, commit/PR conventions) and `CONTRIBUTING.md` (human + AI-agent workflow, Session Start Protocol, ICP, boundary-exception rule) are drafted; `PRODUCT.md` carries handbook §2–4 verbatim as the traceable FR/NFR registry; remaining files are scoped stubs naming their target phase. Two CI gates added: `docs/ci/check-docs-freshness.mjs` (+`freshness.json`) and `docs/ci/check-terminology.mjs` (+`terminology.json`), wired via `.github/workflows/docs.yml`; both verified green on the repo and against synthetic diffs (worktree test: schema-without-doc fails, schema+doc passes, `packages/*/src/index.ts` without doc fails, `Docs-Exempt:` trailer downgrades to a warning).
- **Done (cont.):** **0.3 QDS import pipeline + core data pack v1 (Backend, 2026-07-26)** — `shared/py/qc_shared` (canonical keys + corpus metadata, the licensing gate, and the shared `qds` table definitions); `qds.*` reference tables with Alembic migration `0001_qds` (expand-only, reversible, `alembic check` clean); `tools/pack-builder` (`fetch → build → load → pack → verify`) importing Tanzil Uthmani 1.1 + QPC Ḥafṣ words + KFGQPC Madani 604 layout + QuranWBW English; signed `core-hafs-2026.07.0.qpack` (1.7 MiB, checksums reproduce byte-identically across rebuilds); `GET /v1/quran/verses/{verse_key}` and `GET /v1/quran/pages/{mushaf_id}/{page}` with Redis 24 h cache, strong ETag/304 and RFC 9457 problems. Corpus: 6236 verses, 77 429 words, 9046 layout lines; all 604 pages and all 6236 ayat verified resolvable end-to-end against a freshly migrated database. Tests: 87 api (98 % cov), 74 pack-builder (89 %), 35 shared (87 %); ruff + import-linter clean. `docs/API.md` extended with the live QDS surface; `schemas/licenses.json` gained the four shipped datasets (`schemas/CHANGELOG.md` 0.1.1 — registry data only, no contract shape changed).
  - **Two data decisions worth knowing**, both documented in `tools/pack-builder/README.md`: (1) the upstream layout misplaces 25 canonically contiguous word-runs by exactly one page — corrections live *only* in the checked-in `fixtures/layout_errata.json`, and the build aborts on any violation not listed there **and** on any listed shift that has become unnecessary, so the file cannot rot and nothing is silently repaired; after the shifts the 604 pages account for exactly 9046 lines = 8820 ayah + 114 surah-name + 112 basmallah. (2) The standalone basmallah is stripped from `qds.verse.text_uthmani` so ayah text describes the same span that `word_position` addresses, while the pack payload keeps Tanzil's bytes verbatim as its licence requires. Tanzil and QPC then agree on word splitting except for four ayat the muṣḥaf sets joined (2:181, 8:6, 13:37, 37:130), enumerated in the golden fixture — a fifth divergence fails the build.
- **Next waves:** W1 is complete (0.1–0.4). Still open from 0.1: owners for `content/`, `packages/tajweed-rules`, `packages/plugin-sdk`; §21/§28 say `OWNER.md` but task 0.1 specified `README.md` — owner lines live in the READMEs pending an ADR. `tools/pack-builder` ownership is now resolved (Backend Agent, per §6.5). DevOps should fold `schemas-codegen.yml` **and `docs.yml`** into the main `ci.yml` path-filtered pipeline. Boundary exception from 0.4: the docs workflow file sits in DevOps-owned `.github/workflows/` (logic stays in `docs/ci/`), same pattern as 0.2's `schemas-codegen.yml`. Still unimplemented from the Documentation playbook: the `prompts/*` frontmatter validator (lands with the first prompt files) — tracked in `docs/PROMPTS.md`.
- **Handoffs from 0.3:**
  - *DevOps:* add path-filtered CI jobs for `tools/pack-builder/**` and `shared/py/**` — neither has one today (the `api` job's filter covers `shared/py` sources but never runs its tests). The pack-builder golden job needs network and a warm `.cache/`, and must run `pack-builder fetch` first: the golden tests fail rather than skip without the corpus, deliberately (R8). Until that job exists, the §6.4 licensing gate is mirrored in `services/api/tests/test_licensing_gate.py` so it fires on the existing pipeline — do not delete it without replacing the enforcement.
  - *Database Agent:* review `services/api/migrations/versions/0001_qds_reference_tables.py` and apply the `db-approved` label. This is the one DoD item the session could not self-certify.
  - *Architecture:* `qc_shared.qds.tables` deliberately keeps the `qds` DDL in `shared/py` so the API reader, the pack-builder writer and Alembic share one definition rather than three that drift — worth an ADR if the pattern should generalise to other contexts. The layout-errata mechanism may also deserve a numbered decision.

> Update this Status section at the end of any session that completes a task.
