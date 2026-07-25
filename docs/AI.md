# AI Architecture

> **Scope:** handbook §10–§12 — tutor orchestration, model backend abstraction,
> authenticity guardrails, RAG/knowledge base, and eval gates.
> **Status:** scoped stub (task 0.4). No AI code exists yet; `packages/ai-core`
> is an empty scaffold and `prompts/` holds only a README. Full draft is a Phase 1
> deliverable (handbook §27). Owner: Documentation Agent; implementation: AI and
> RAG Agents.

## Non-negotiables (already binding)

1. **Verses are never generated.** Every verse the AI shows is fetched verbatim
   from the canonical store by `VerseKey` (FR-AI-2, Rule R2/R3, D-009).
2. **Answers are retrieval-grounded.** The tutor answers only from retrieved,
   cited passages of the curated knowledge base, and refuses or defers when no
   source is found (FR-AI-1).
3. **Two validators sit on every output path**:
   - *Verse verifier* — any Arabic span resembling Quran must match the canonical
     text for a cited `VerseKey`, else it is replaced from QDS or the response is
     rejected and regenerated.
   - *Citation checker* — every factual paragraph references ≥1 retrieved chunk
     id; after two failures the tutor returns the honest "no source found"
     response.
4. **Scope fence.** Fiqh rulings, creed disputes, and medical/psychological
   topics route to a fixed deferral template.
5. **Child surface** is restricted to `explain_verse`-lite and quiz modes.

## Components (planned)

| Component | Home | Notes |
|---|---|---|
| Provider abstraction (`complete`, `stream`, `embed`) | `packages/ai-core` + server mirror | No feature calls a provider SDK directly (enables model plugins) |
| Tutor orchestrator (router → planner → executor → validators → assembler) | `services/api/app/tutor` | Deterministic mode scaffolds, not free chat |
| Tutor modes | — | `explain_verse`, `explain_rule`, `quiz_me`, `plan_week`, `free_qa` |
| RAG pipeline (normalise → chunk → reference-validate → embed → index) | `tools/kb-ingest` + `app/kb` | Reference validator rejects unmatched verse quotes at ingestion |
| Retrieval | pgvector + FTS, reciprocal-rank fusion | Returns chunk text, ref, and license tag |
| Prompt registry | `prompts/` | See [PROMPTS.md](PROMPTS.md) |
| Evals | `tools/ai-evals` | CI gate: citation precision ≥ 0.95, **zero** fabricated-verse incidents |

Default backend is the Anthropic API for hosted deployments, with local /
self-hosted OpenAI-compatible endpoints for self-hosters; embeddings run locally
by default (NFR-10 — no feature hard-requires a paid API).

## Citation contract

Every retrieved chunk carries `{collection, title, locator (bāb/page/ayah),
license}` and renders as a tappable citation chip. A paragraph without at least
one chip cannot be emitted.

Until this document is expanded, handbook §10–§12 is the reference.
