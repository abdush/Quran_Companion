# AI Agent

## Mission
Build the tutor orchestration (router → planner → executor → validators → assembler) and the model-provider abstraction, with authenticity guardrails that make fabricated religious content mechanically impossible to ship.

## Responsibilities
- `services/api/app/tutor`: modes `explain_verse`, `explain_rule`, `quiz_me`, `plan_week`, `free_qa` (§10.3), SSE streaming endpoint.
- Guardrails (§10.4): verse verifier (exact-match against canonical text, auto-replace or reject), citation checker (≥1 chunk id per factual paragraph), scope fence (fiqh/creed/medical deferral template), child surface restrictions.
- `packages/ai-core` + Python mirror: provider interface (`complete`, `stream`, `embed`) with Anthropic + OpenAI-compatible-local implementations; provider selection by config only.
- `tools/ai-evals`: golden Q/A set (≥200 items), citation precision gate ≥0.95, fabricated-verse zero-tolerance gate, refusal-correctness suite, red-team suite.
- Quiz generation with machine-verified answer keys.

## Owned directories
- `services/api/app/tutor/`, `packages/ai-core/`, `tools/ai-evals/`
- `prompts/` (co-owned: this agent authors, Documentation Agent registers, evals gate)

## Forbidden files
- `services/api/app/kb` internals (call RAG's public facade only), `services/speech/`, `apps/*` screens.

## Inputs
- Prompt templates (`prompts/`), RAG retrieval facade, QDS verse lookup, user-context read APIs (hfz/ann), plan_tools write facade.

## Outputs
- Streaming tutor responses with citation chips payload; structured quiz JSON; plan diffs (applied only after user confirmation).

## Published interfaces
- `POST /v1/tutor/messages` (SSE), tutor thread endpoints; `ai-core` provider interface (plugin extension point, §20).

## Consumed interfaces
- `kb_search` facade (RAG), `GET /v1/quran/*` (QDS), hfz/ann read facades, `plan_tools`.

## Standing constraints
- No provider SDK call outside `ai-core`. No inline prompt strings — load by prompt id.
- Any Arabic span classified as Quran-like must resolve to a cited VerseKey and byte-match canonical text, or the response is regenerated; after 2 failures return the honest "no source found" response.
- `free_qa` is disabled for child profiles; enforced server-side by profile kind, not UI.
- Changing anything under `prompts/` or tutor code requires a full `tools/ai-evals` run in CI.

## Definition of Done (per task)
- [ ] ai-evals gates green: citation precision ≥0.95, fabricated verses = 0, refusal suite pass.
- [ ] Red-team suite pass (uncited rulings, verse fabrication, child-inappropriate probes all blocked).
- [ ] SSE contract test green; first-token latency budget met on staging profile.
- [ ] Prompt files carry version bump + eval-set linkage in frontmatter.
