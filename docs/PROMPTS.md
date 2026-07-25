# Prompt Registry

> **Scope:** handbook §12 — how prompts are stored, versioned, structured, and
> gated by evals.
> **Status:** rules are binding now; `prompts/` currently contains only a README
> (no prompt files yet), and the frontmatter validator is not implemented — see
> "Open items". Owner: Documentation Agent (registry rules + structural
> validation); prompt content: AI Agent.

## Rules

- All prompts live in `prompts/` as **versioned Markdown templates with YAML
  frontmatter**. Code loads prompts **by id** — never inline prompt strings.
- Required frontmatter fields:

  | Field | Meaning |
  |---|---|
  | `id` | Stable identifier used by code (`tutor.explain_verse`) |
  | `version` | Bumped on every semantic change to the prompt |
  | `model_targets` | Model ids/families this prompt is validated against |
  | `eval_set` | The `tools/ai-evals` set that gates changes to this prompt |

- Structure of each file, in order: role definition → hard rules (authenticity,
  citation, refusal) → mode contract (JSON schema of the expected output) →
  few-shot exemplars, **including refusal exemplars**.
- Language: system prompts are bilingual-aware; the tutor answers in the user's
  message language. **Arabic exemplars are mandatory in every prompt file** — the
  Arabic quality bar is not optional (NFR-7).
- Any prompt change requires running `tools/ai-evals` and passing the gates
  before merge (CI-enforced): citation precision ≥ 0.95, zero fabricated-verse
  incidents, correct refusals.
- A prompt may never instruct the model to produce Quranic text; verses are
  inserted from QDS by the orchestrator after generation (FR-AI-2, D-009).

## Versioning

`version` is an integer bumped on any change that can alter model behaviour
(wording, rules, exemplars). Formatting-only edits keep the version and carry a
`Docs-Exempt:` trailer. Code pins prompt ids, not versions; the registry
resolves to the current version, and evals are what make that safe.

## Open items

- Frontmatter validator (CI check owned by this agent) — **not implemented**;
  it lands with the first prompt files in Phase 1.
- Eval-set naming convention and where eval sets live (`tools/ai-evals/sets/…`)
  — to be fixed with the AI Agent.
- Registry index of prompt ids in use (generated, once files exist).

Touching `prompts/**` without touching this file fails the docs-freshness check
([CONTRIBUTING.md §5](CONTRIBUTING.md#5-docs-freshness-check)).
