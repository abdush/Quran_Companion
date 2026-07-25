# Contributing

> **Scope:** how work enters this repository — for human contributors and for
> the specialised AI agents that build most of it. Owner: Documentation Agent.
>
> **Related:** `agents/README.md` (universal rules R1–R8, Interface Change
> Protocol) · [STYLEGUIDE.md](STYLEGUIDE.md) · [TESTING.md](TESTING.md) ·
> [SELF_HOSTING.md](SELF_HOSTING.md) · `CLAUDE.md` (Session Start Protocol)

---

## 1. Ground rules (apply to everyone)

1. **Never store or generate Quran text** in feature code or user tables.
   Reference by canonical keys `(surah, ayah, word_position)` and resolve via QDS
   or a data pack ([D-003](adr/D-003-canonical-addressing.md), Rule R2, see
   [DATA.md](DATA.md)).
2. **Zero tolerance for fabricated religious content.** Any path that can emit
   Quranic or scholarly text goes through the verse verifier / citation checker /
   reference validator (D-009, Rule R3).
3. **Schemas change first, code second** (Rule R1). Payload, event, or doc-shape
   changes land in `schemas/` and are regenerated before implementation.
4. **Never weaken a gate.** Golden tests, boundary lint, authenticity gates, and
   CI checks are the specification; a red golden test means the code is wrong
   (Rules R4, R8).
5. **No secrets, no PII in logs** — ids and codes only (Rule R7).
6. **Interface-affecting changes update the matching `docs/*.md` in the same
   PR** (Rule R5); CI enforces it (§5).

## 2. AI-agent workflow

Most work here is done by role-scoped agent sessions. Each session is bound by a
playbook in `agents/` and by the **Session Start Protocol** in `CLAUDE.md`:

1. Identify the agent role for the session (stated in the session prompt, e.g.
   "You are the DevOps Agent").
2. Read `agents/README.md` — universal rules R1–R8 and the Interface Change
   Protocol.
3. Read `agents/<agent>.md`. Its **Owned directories** are the only places the
   session may create or edit files; **Forbidden files** are absolute.
4. Read only the handbook sections and schemas listed under **Consumed
   interfaces** — do not load the whole handbook into context.
5. Restate the task's Definition of Done as a checklist before writing code, and
   verify it before declaring the task complete.

Additional expectations:

- **One agent, one task, one branch, one PR.** A session that discovers work
  belonging to another agent files an issue; it does not "just fix it".
- **Report honestly.** If a Definition-of-Done item is not met, say so in the PR
  description. Partially complete beats silently narrowed scope.
- **Update `CLAUDE.md`'s Status section** at the end of any session that
  completes a task, including open items handed to other agents.
- Playbooks are living documents: when an interface, owned path, or DoD changes,
  the playbook is updated in the same release (Documentation Agent owns
  `agents/`).

### Boundary exceptions

If a task genuinely cannot be completed inside the owned directories (for
example a check that must be wired into `.github/workflows/` to run at all), the
session may add the minimal file needed **and must**: state it explicitly in the
PR description and in `CLAUDE.md` Status, keep the logic itself inside owned
paths, and name the owning agent who should absorb it. Anything larger goes
through the Interface Change Protocol first.

## 3. Interface Change Protocol (ICP)

Any change to a shared interface — OpenAPI, event schemas, pack manifest, a
package's public `index.ts`, a bounded context's `api.py`, or a database
contract another context reads:

1. Open an issue titled `RFC: <interface> — <change>`; tag every agent listed as
   a consumer in the playbooks.
2. The Architecture Agent approves or rejects with an ADR note (index:
   [DECISIONS.md](DECISIONS.md)).
3. The change lands **schema-first with a version bump**; consumers migrate
   behind compatibility until all are updated.
4. Docs for the interface update in the same PR (Rule R5), and
   `schemas/CHANGELOG.md` records the schema change.

Do not skip step 1 because the change "is small". A one-field rename in an event
envelope is exactly the change that breaks another agent's consumer silently.

## 4. Human contributor workflow

```bash
# 1. Prerequisites: Node 22 + pnpm 10, uv (Python 3.12), Docker with Compose.
pnpm install

# 2. Bring up the stack (see docs/SELF_HOSTING.md for details)
docker compose -f infra/compose/docker-compose.yml up -d --build --wait

# 3. Work on a branch named for the task
git switch -c feat/0.4-docs-scaffold

# 4. Before pushing — the same gates CI runs
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run boundaries
node docs/ci/check-terminology.mjs
node docs/ci/check-docs-freshness.mjs --base origin/main --head HEAD
```

Python services:

```bash
cd services/api && uv sync && uv run ruff check . && uv run lint-imports && uv run pytest
```

Commit and PR conventions — conventional commits with task and FR ids, one task
per branch, DoD checklist in the PR body — are in
[STYLEGUIDE.md §5](STYLEGUIDE.md#5-commits-branches-prs).

Review expectations: a reviewer checks the Definition of Done, the same-PR docs
rule, and that no gate was weakened. Reviewers reject suppressions of boundary
rules and edited golden fixtures by default.

## 5. Docs freshness check

Interface-touching diffs must touch a corresponding doc, or CI fails with
guidance. Implemented by
[`docs/ci/check-docs-freshness.mjs`](ci/check-docs-freshness.mjs); rules live in
[`docs/ci/freshness.json`](ci/freshness.json).

| If your diff touches… | …it must also touch |
|---|---|
| `schemas/openapi/**` | `docs/API.md` |
| `schemas/events/**` | `docs/ARCHITECTURE.md` |
| `schemas/packs/**`, `schemas/licenses.json` | `docs/DATA.md` |
| `packages/<name>/src/index.ts` or its `package.json` | the doc mapped to that package (see `freshness.json`; default `docs/ARCHITECTURE.md`) |
| `prompts/**` | `docs/PROMPTS.md` |

Run it locally before pushing:

```bash
node docs/ci/check-docs-freshness.mjs --base origin/main --head HEAD
```

**Escape hatch.** If a change genuinely needs no doc update (a typo in a schema
description, a formatting-only diff), add a trailer to any commit in the branch:

```
Docs-Exempt: schema description typo, no contract change
```

The check reports the exemption instead of failing. Exemptions are visible in
review — abusing one is a review finding, not a shortcut.

## 6. Terminology check

Error-taxonomy names and the seeded Arabic category names must be spelled
identically everywhere (see
[STYLEGUIDE.md §4](STYLEGUIDE.md#4-canonical-terminology)). Enforced by
[`docs/ci/check-terminology.mjs`](ci/check-terminology.mjs) against
[`docs/ci/terminology.json`](ci/terminology.json), which also lists the variant
spellings that are explicitly forbidden.

```bash
node docs/ci/check-terminology.mjs
```

Adding a canonical term (a new error kind, a new seeded category) requires an
ICP RFC first — the term appears in an API enum, a UI string table, and the
analytics allowlist simultaneously.

## 7. Getting the context right

- `ENGINEERING_HANDBOOK.md` is the source of truth for architecture,
  requirements, phases, and decisions. When code and handbook disagree, the
  handbook wins — raise it, do not silently diverge.
- `docs/` is the working documentation set (index: [README.md](README.md)); it
  restates the handbook for day-to-day use and must not contradict it.
- Requirement ids live in [PRODUCT.md](PRODUCT.md); decisions in
  [DECISIONS.md](DECISIONS.md) and `docs/adr/`.
