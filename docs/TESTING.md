# Testing Strategy

> **Scope:** handbook §23 — test layers, gates, golden-set locations, and
> FR→test traceability.
> **Status:** scoped stub (task 0.4). Vitest and pytest are wired as CI stubs;
> **no golden sets exist yet** — the first (Quran text checksums) arrives with
> task 0.3. Owner: Documentation Agent; test infrastructure: Testing Agent.

## Layers and gates

| Layer | Tooling | Gate |
|---|---|---|
| Unit (TS) | Vitest | ≥80% on `packages/*` |
| Unit (Py) | pytest | ≥80% on domain logic |
| Contract | Schemathesis against OpenAPI; generated-client compile check | required |
| Golden data tests | Quran text checksums; word count per ayah; layout row counts; tajweed rule corpus; FSRS py↔ts cross-parity; diff-classifier fixtures | required |
| E2E | Playwright (web), Maestro (mobile) on read→annotate→plan→revise→test | required on release branches |
| AI evals | `tools/ai-evals`: citation precision, fabricated-verse zero tolerance, refusal correctness | required when `prompts/` or AI code changes |
| Speech bench | WER on a held-out recitation set per model version | tracked, regression alert |
| Load | k6 on QDS + sync endpoints | pre-release |
| Security | dependency audit, container scan, ZAP baseline | required |

## Rules

- **Tests are the spec** (Rule R8). A red golden test means the code is wrong.
  Golden fixtures — Quran checksums, layout counts, FSRS parity, diff fixtures —
  are **never** edited to make a build pass; changing one requires an RFC that
  explains why the previously verified truth was wrong.
- Fixtures live beside the module in `__fixtures__/`; cross-module fixtures in
  `tools/fixtures/`.
- **Every FR id maps to at least one test id**; the traceability matrix is
  generated in CI against the registry in [PRODUCT.md](PRODUCT.md).
- Fixtures never contain pasted Quran text — they reference canonical keys and
  resolve through the pack fixture (Rule R2).

## Current state

| Gate | State |
|---|---|
| TS unit (Vitest) | Runner wired, no packages under test yet |
| Py unit (pytest) | Health-endpoint tests only |
| Boundary lint | dependency-cruiser + import-linter stubs active |
| Schemas codegen staleness | Active (`.github/workflows/schemas-codegen.yml`) |
| Docs freshness + terminology | Active (`.github/workflows/docs.yml`, this task) |
| Golden data tests | **None yet** — first set lands with task 0.3 |
| Contract, E2E, evals, bench, load | Not started |

Until this document is expanded, handbook §23 is the reference.
