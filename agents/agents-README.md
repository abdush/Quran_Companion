# Agent Playbooks

One file per specialised AI coding agent. Each playbook is the **binding contract** for that agent's Claude Code sessions.

## How to use with Claude Code

1. Start a session for one agent and one task only.
2. Load context in this order: `agents/<agent>.md` → the schemas/interfaces it lists under **Consumed interfaces** → the task card (§29 of the handbook).
3. The agent may create/edit files **only** under its Owned paths. Anything else requires an RFC issue (see Interface Change Protocol below).
4. A task is complete only when its **Definition of Done** checklist passes locally.

## Universal rules (apply to every agent)

- **R1 — Schemas first.** If the task changes any payload, event, or doc shape, update `schemas/` first, regenerate types, then implement.
- **R2 — No Quran text in owned tables/code.** Reference by canonical keys (`surah:ayah:word_position`); resolve via QDS or data pack. (Handbook §6.1, D-003)
- **R3 — Authenticity gates.** Any code path that can emit Quranic or scholarly text must route through the verse verifier / citation checker. Zero tolerance for generated verses. (§10.4)
- **R4 — Boundary lint must pass.** dependency-cruiser (TS) and import-linter (Python) encode the allowed graph; never suppress rules to make a PR pass.
- **R5 — Same-PR docs.** Interface-affecting changes update the relevant `docs/*.md` in the same PR.
- **R6 — Idempotent consumers.** Every event consumer keys on `event_id` and tolerates redelivery.
- **R7 — No secrets, no PII in logs.** IDs and codes only; never note bodies, transcripts, or audio paths with user linkage.
- **R8 — Tests are the spec.** Golden tests (Quran checksums, FSRS parity, tajweed corpus, diff fixtures) may never be weakened to pass; a red golden test means the code is wrong.

## Interface Change Protocol (ICP)

1. Open an issue titled `RFC: <interface> — <change>`; tag every agent listed as a consumer in the playbooks.
2. Architecture Agent approves/rejects with an ADR note.
3. Change lands schema-first with a version bump; consumers migrate behind compatibility until all are updated.

## Agent roster

| File | Agent | Primary scope |
|---|---|---|
| architecture.md | Architecture Agent | ADRs, schemas arbitration, boundaries |
| backend.md | Backend Agent | FastAPI contexts (usr/ann/hfz/qds/cm/fam) |
| speech.md | Speech Agent | ASR worker, alignment, diff classifier |
| ai.md | AI Agent | Tutor, guardrails, ai-core, evals |
| rag.md | RAG Agent | KB ingestion, retrieval, embeddings |
| database.md | Database Agent | Schema stewardship, migrations |
| mobile.md | Mobile Agent | Expo app |
| frontend.md | Frontend Agent | Web PWA + admin |
| renderer.md | Renderer Agent | mushaf-renderer, quran-core |
| sync.md | Sync Agent | CRDT protocol, sync-client, sync service |
| security.md | Auth/Security Agent | auth-core, gateway, E2EE, threat model |
| devops.md | DevOps Agent | CI, infra, releases, observability |
| testing.md | Testing Agent | Test infra, traceability, fixtures |
| documentation.md | Documentation Agent | Docs freshness, tutorials |
| integration.md | Integration Agent | Cross-agent PRs, upgrades, releases |
