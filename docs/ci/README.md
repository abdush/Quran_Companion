# docs/ci/ — documentation CI checks

Owner: **Documentation Agent**. These are the checks the playbook assigns to this
agent (docs freshness, terminology consistency). They are plain Node scripts with
no dependencies, runnable locally and from CI
(`.github/workflows/docs.yml`).

> **Boundary note.** The logic lives here, inside the Documentation Agent's owned
> path. The workflow file that invokes it must live in `.github/workflows/`
> (DevOps-owned) because a check that is not wired into CI is not a check — same
> pattern as `schemas-codegen.yml`, which the Architecture Agent added in task
> 0.2. DevOps should fold both into the path-filtered `ci.yml` pipeline.

## check-docs-freshness.mjs

Fails a diff that touches an interface without touching the matching doc
(universal rule R5). Rules: [`freshness.json`](freshness.json); human-readable
summary: [../CONTRIBUTING.md §5](../CONTRIBUTING.md#5-docs-freshness-check).

```bash
node docs/ci/check-docs-freshness.mjs --base origin/main --head HEAD
node docs/ci/check-docs-freshness.mjs --files changed.txt   # one path per line
```

- Triggers: `schemas/openapi/**`, `schemas/events/**`, `schemas/packs/**` +
  `schemas/licenses*.json`, `prompts/**`, `packages/*/src/index.ts`,
  `packages/*/package.json`.
- Ignored: everything under `docs/**` (a docs-only PR can never fail it) and
  generated client output.
- Escape hatch: a `Docs-Exempt: <reason>` commit trailer (or `DOCS_EXEMPT` env
  var) turns a failure into a visible warning.
- Exit codes: `0` pass/exempt, `1` unmet rule, `2` bad refs (CI needs
  `fetch-depth: 0`).

Adding a doc or a package means adding it to `freshness.json` — the mapping is
data, not code.

## check-terminology.mjs

Verifies the error-taxonomy names (handbook §13.3) and the seeded annotation
category names (FR-AN-2) are spelled identically everywhere they appear.
Canonical list: [`terminology.json`](terminology.json); human-readable version:
[../STYLEGUIDE.md §4](../STYLEGUIDE.md#4-canonical-terminology).

```bash
node docs/ci/check-terminology.mjs --verbose
```

- Scans tracked + new non-ignored files with the extensions in
  `terminology.json`; skips generated output, download caches, and fixtures
  (upstream Quran text contains words sharing a root with a category name).
- In Markdown, Latin terms are only checked inside code spans and fenced blocks:
  prose may read "a similar-verse jump"; an identifier may not. Arabic terms are
  checked in prose too — the category name is the same string everywhere.
- Arabic comparison ignores diacritics and tatweel (حِفْظ is the same word) but
  not spacing, hyphenation, or hamza/alef choice.
- Counter-examples in docs can be wrapped in
  `<!-- terminology-ignore-start -->` / `<!-- terminology-ignore-end -->`, or a
  single line marked `terminology-ignore-line`.

Both checks are green on `main` as of task 0.4.
