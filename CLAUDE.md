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
- **Next waves:** W1 remaining = 0.3 QDS import (Backend, unblocked by 0.2 schemas). Still open from 0.1: owners for `content/`, `tools/pack-builder`, `packages/tajweed-rules`, `packages/plugin-sdk`; §21/§28 say `OWNER.md` but task 0.1 specified `README.md` — owner lines live in the READMEs pending an ADR. DevOps should fold `schemas-codegen.yml` **and `docs.yml`** into the main `ci.yml` path-filtered pipeline. Boundary exception from 0.4: the docs workflow file sits in DevOps-owned `.github/workflows/` (logic stays in `docs/ci/`), same pattern as 0.2's `schemas-codegen.yml`. Still unimplemented from the Documentation playbook: the `prompts/*` frontmatter validator (lands with the first prompt files) — tracked in `docs/PROMPTS.md`.

> Update this Status section at the end of any session that completes a task.
