# Style Guide

> **Scope:** code style, internationalisation and RTL rules, Arabic typography,
> canonical terminology, and commit/PR conventions. Binding for every agent and
> human contributor. Owner: Documentation Agent.
>
> **Related:** [CONTRIBUTING.md](CONTRIBUTING.md) (workflow) ·
> `agents/README.md` (universal rules R1–R8) · [TESTING.md](TESTING.md)

---

## 1. TypeScript

**Tooling.** pnpm workspaces + Turborepo; Vitest for tests; ESLint + Prettier
defaults per package; `dependency-cruiser` for boundaries.

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run boundaries
```

Rules:

- `strict: true`. No `any` in exported signatures; `unknown` + a narrowing
  function instead. No `@ts-ignore` without an adjacent comment naming the
  upstream issue.
- **Public API of a package is its `src/index.ts`.** Deep imports
  (`@qc/quran-core/src/internal/x`) are boundary violations. Changing a package's
  `index.ts` is an interface change: it needs a doc touch in the same PR (the
  docs-freshness check enforces this).
- No hand-written `fetch` in feature code — use the generated client in
  `packages/api-client` ([D-011], handbook §5.3). Regenerate with
  `pnpm --filter @qc/codegen run build`; never hand-edit files under
  `src/generated/`.
- Naming: `camelCase` values, `PascalCase` types/components, `SCREAMING_SNAKE`
  only for module-level constants. Files `kebab-case.ts`; React components
  `PascalCase.tsx`.
- Domain values that cross the wire keep their **wire spelling** — API and event
  fields are `snake_case` (handbook §8.1), so do not "fix" `word_position` to
  `wordPosition` at the boundary type; map explicitly if the client wants camel.
- Errors: throw typed errors, never bare strings. User-facing messages are i18n
  keys, not literals (§3).
- Never suppress a `dependency-cruiser` rule to make a PR pass (Rule R4).

## 2. Python

**Tooling.** uv; FastAPI + async SQLAlchemy; Alembic; ruff (line length 100);
pytest; `import-linter` for boundaries.

```bash
uv run ruff check . && uv run lint-imports && uv run pytest
```

Rules:

- Fully type-annotated public functions; `from __future__ import annotations` at
  the top of modules that need forward refs. mypy-clean where configured.
- **Async all the way down** in request paths: async SQLAlchemy sessions, async
  clients. Blocking CPU work (ASR, alignment) belongs in the Speech worker, not
  in an API request.
- A bounded context exposes exactly one public module: `app/<ctx>/api.py`.
  Cross-context imports of anything else fail `import-linter` — the fix is a new
  public method or an event, never a suppression.
- Migrations are **expand → migrate → contract**: never a destructive column
  change in one release. One context owns each migration; cross-schema FKs point
  only at `usr.profile`.
- Repository methods take an explicit `profile_id` and filter on it; row-level
  authorisation is tested, not assumed (handbook §18.2).
- Structured logging only: ids and codes, never note bodies, transcripts, or
  user-linked audio paths (Rule R7).

## 3. Internationalisation & RTL

Arabic is a **first-class locale, and the default design target** — English is
the mirror, not the baseline (NFR-7, FR-PL-5).

- **All UI strings are externalised.** No literal user-facing text in components.
  Key naming: `<area>.<screen>.<element>` (e.g. `hifz.session.start_button`).
  Every key ships with an Arabic value in the same PR as its English value; a
  missing Arabic string is a failing review, not a TODO.
- **RTL-first layout.** Use logical properties and direction-agnostic APIs:
  `margin-inline-start` not `margin-left`, `flex-start`/`flex-end` not
  `left`/`right`, `paddingStart` not `paddingLeft` in React Native. Icons that
  encode direction (back arrows, progress, chevrons) must flip; icons that do
  not (play, mushaf glyphs, logos) must not.
- **Never mirror the mushaf.** Quran page rendering has its own layout contract
  from the pack data; it is not subject to the app's RTL flipping logic.
- **Numbers and dates.** Locale-aware formatting via `Intl`. Arabic-Indic digits
  (٠١٢٣) are a *display* choice driven by locale settings; ayah/page numbers in
  code, APIs, keys, and logs are always ASCII integers.
- **Bidi safety.** When interpolating Latin text (model ids, filenames) into an
  Arabic string, use the i18n library's interpolation — do not concatenate; wrap
  with isolates (`⁨…⁩`) where the library does not.
- **Pluralisation** uses the i18n library's CLDR plural categories. Arabic has
  six — never fake it with `n === 1 ? a : b`.

### Arabic typography

- Quran text renders with the **QPC/KFGQPC glyph fonts** from the data pack, per
  page — never a system Arabic font, and never with letter-spacing, text
  transforms, or synthetic bold/italic applied. These break ligatures and change
  the shape of the revealed text.
- Do not normalise, strip tashkīl from, or re-order Quran text for display.
  Normalisation exists **only** in matching/search paths (ASR alignment, search),
  never in the rendering path.
- UI Arabic (not Quran text) uses the design-system Arabic face with adequate
  line-height for diacritics; avoid all-caps styling (meaningless in Arabic) and
  avoid tatweel for justification.
- Arabic strings in code and docs are written **without** presentation forms
  (U+FB50–U+FEFF) and without tatweel; use standard Arabic letters so text
  comparison and the terminology check work.

## 4. Canonical terminology

These names must be spelled **identically** in UI strings, API enums, event
schemas, database enums, analytics, and docs. `docs/ci/check-terminology.mjs`
enforces this; the machine-readable list is
[`docs/ci/terminology.json`](ci/terminology.json).

### Error taxonomy (handbook §13.3) — seven canonical kinds

| Value | Meaning |
|---|---|
| `stop` | Silence past threshold, no resume |
| `hesitation` | Silence past threshold mid-sequence, then resume |
| `substitution` | Token aligned to the expected slot but a different word (normalised) |
| `omission` | Expected word missing, next expected word matched |
| `insertion` | Extra token not in the expected sequence |
| `similar_jump` | Transcript suffix matches a different verse sharing the confusion prefix (carries the target VerseKey) |
| `context_note` | User- or teacher-added free note |

<!-- terminology-ignore-start -->
No variants: not `similarJump`, not `similar-jump`, not `similar_verse_jump`,
not `contextNote`.
<!-- terminology-ignore-end -->
The four-symbol detection-recitation system (FR-HZ-4) maps onto this taxonomy —
it does not introduce new names.

### Seeded annotation categories (FR-AN-2)

| Arabic (canonical) | English gloss (docs/UI English only) |
|---|---|
| حفظ | memorisation |
| تجويد | tajweed |
| وقف وابتداء | stopping/starting |

The Arabic strings are the identity; the English glosses are labels. Write
وقف وابتداء as one term with a single space and no tashkīl — never with an extra
space between the two words, never hyphenated, never with the definite article.

### Other spellings used consistently

`mushaf`, `hifz`, `tajweed`, `tafsīr`, `riwāyah`, `mutashābihāt`, `ayah` (plural
`ayāt`), `surah`, `juz`, `hizb`, `waqf`, `madd`, `ghunnah`, `idghām`,
`qalqalah`. Prefer these in English prose; inside identifiers use the ASCII
form (`tafsir`, `riwayah`).

## 5. Commits, branches, PRs

- **One task per branch.** Branch name: `feat/<task-id>-<slug>` (e.g.
  `feat/0.4-docs-scaffold`), or `fix/`, `chore/`, `docs/`.
- **Conventional commits**, with the task id and FR ids in brackets:

  ```
  feat(qds): import Tanzil text [0.3.2, FR-RD-1]
  fix(sync): keep tombstones through compaction [FR-PL-3, NFR-12]
  docs(architecture): record event envelope v2 [0.5.1]
  ```

  Scope = the owned area (`qds`, `hfz`, `speech`, `schemas`, `docs`, `ci`, …).
- Body explains **why**, links the RFC issue for interface changes, and lists
  affected FR/NFR ids. Breaking interface changes carry `BREAKING CHANGE:` with
  the migration note.
- **Same-PR docs** (Rule R5): an interface-affecting change updates the matching
  `docs/*.md` in the same PR. CI fails otherwise — see
  [CONTRIBUTING.md](CONTRIBUTING.md#docs-freshness-check).
- PR description states: task id, Definition of Done checklist with boxes
  actually ticked, and what was verified locally.
- Never merge with a red golden test, a suppressed boundary rule, or a skipped
  authenticity gate (Rules R3, R4, R8).

## 6. Documentation style

- Engineering docs in **English**; user-facing guides authored in **Arabic
  first**, then translated (handbook §22, `agents/documentation.md`).
- Every doc opens with a scope line stating what it covers and who owns it.
- Prefer tables and normative "must/never" phrasing over narrative.
- Link to schemas and ADRs rather than restating them; where a doc does restate
  a schema (e.g. an event envelope), mark the schema as normative.
- Placeholder docs must state their **actual current scope and status** — never
  filler text.
