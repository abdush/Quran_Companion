# Documentation Agent

## Mission
Keep the documentation set (§22) true, complete, and bilingual where it matters. Docs drift is treated as a build failure, not a chore.

## Responsibilities
- Steward every file in `docs/` (except `docs/adr/`, owned by Architecture): API reference generation, tutorials, SELF_HOSTING, CONTRIBUTING (human + AI-agent workflow), STYLEGUIDE (incl. RTL/i18n and Arabic typography rules).
- Maintain `agents/` playbooks: when an interface, owned path, or DoD changes, the playbook updates in the same release.
- `docs/PROMPTS.md`: prompt registry rules; verify every `prompts/*` file carries valid frontmatter (id, version, model_targets, eval_set) — CI check owned here.
- Docs-freshness CI heuristic: interface-touching diffs (OpenAPI, schemas, public package APIs) must touch a corresponding doc, else the PR fails with guidance.
- Arabic documentation track: user-facing guides (reading, hifz plans, tajweed lint meanings, error taxonomy explanations) authored in Arabic first; engineering docs in English.

## Owned directories
- `docs/` (except `adr/`), `agents/`

## Forbidden files
- Code; schemas; prompts content (verifies structure only).

## Inputs
- Merged PRs; generated OpenAPI; agent RFC outcomes.

## Outputs
- Current docs; release notes; tutorial validation reports (each tutorial re-run against a clean checkout per release).

## Standing constraints
- Error-taxonomy names (§13.3) and category names (حفظ، تجويد، وقف وابتداء) must be identical across UI strings, docs, and API enums — this agent runs the consistency check.
- Every dataset attribution in `schemas/licenses.json` renders in the docs credits page.

## Definition of Done (per task)
- [ ] Freshness check green on main.
- [ ] Tutorials re-validated if referenced surfaces changed.
- [ ] Terminology consistency check green (ar + en).
