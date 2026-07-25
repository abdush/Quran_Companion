# docs/

Owner: **Documentation Agent** (`agents/documentation.md`), except `adr/` which
is owned by the Architecture Agent.

The documentation set is specified in handbook §22. `ENGINEERING_HANDBOOK.md`
remains the source of truth; these files are the working documentation and must
not contradict it. Docs are updated **in the same PR** as the change they
describe (Rule R5) — CI enforces doc-touch heuristics (see
[CONTRIBUTING.md §5](CONTRIBUTING.md#5-docs-freshness-check)).

## Index

| File | Purpose | State |
|---|---|---|
| [VISION.md](VISION.md) | Mission, principles, personas, non-goals (§1) | stub |
| [PRODUCT.md](PRODUCT.md) | Full FR/NFR registry, traceable ids (§2–4) | complete (verbatim) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, bounded contexts, events (§5, §9) | drafted |
| [DATA.md](DATA.md) | Canonical addressing, datasets, packs, licensing, QDS (§6) | drafted |
| [DATABASE.md](DATABASE.md) | Schema reference, migration policy (§7) | stub — Phase 1 |
| [API.md](API.md) | REST conventions, endpoint map, generated reference (§8) | stub — Phase 1 |
| [AI.md](AI.md) | Tutor, RAG, guardrails, eval gates (§10–12) | stub — Phase 1 |
| [SPEECH.md](SPEECH.md) | ASR, alignment, error taxonomy, tajweed pipeline (§13–14) | stub — Phase 1 |
| [SECURITY.md](SECURITY.md) | Threat model, controls, privacy, E2EE, disclosure (§18) | stub — Phase 1 |
| [SYNC.md](SYNC.md) | Offline storage and sync protocol (§19) | stub — Phase 1 |
| [PLUGINS.md](PLUGINS.md) | Plugin contracts + safety model (§20) | stub — Phase 3 |
| [STYLEGUIDE.md](STYLEGUIDE.md) | Code style, i18n/RTL, terminology, commits | drafted |
| [TESTING.md](TESTING.md) | Test layers, gates, golden sets (§23) | stub |
| [ROADMAP.md](ROADMAP.md) | Phases and current progress (§27) | current |
| [DECISIONS.md](DECISIONS.md) + [adr/](adr/) | ADR index (D-001…) | current |
| [PROMPTS.md](PROMPTS.md) | Prompt registry rules (§12) | rules binding |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Human + AI-agent workflow | drafted |
| [SELF_HOSTING.md](SELF_HOSTING.md) | Compose-based deployment guide | current |
| [ci/](ci/README.md) | Documentation CI checks (freshness, terminology) | active |

"Stub" means the file states its real current scope and status — it is not
filler. Each stub names the phase in which it is expected to be complete.

## Language policy

Engineering docs are English. User-facing guides (reading, hifz plans, tajweed
lint meanings, error-taxonomy explanations) are authored **Arabic first**, then
translated; they land under `docs/guides/` when Phase 1 surfaces exist.
