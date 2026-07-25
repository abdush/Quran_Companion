# tools/

Development & pipeline tooling (handbook §21).

| Tool | Owner |
|---|---|
| `speech-bench/` | Speech Agent (`agents/speech.md`) |
| `ai-evals/` | AI Agent (`agents/ai.md`) |
| `kb-ingest/` | RAG Agent (`agents/rag.md`) |
| `fixtures/` | Testing Agent (`agents/testing.md`) |
| `pack-builder/` | Backend Agent (`agents/backend.md`) — QDS import pipelines are a Backend responsibility (§6.5); claimed by task 0.3 |
| `codegen/` | Architecture Agent (`agents/architecture.md`) — schemas→types codegen; claimed by task 0.2 |

> Placeholder created by Task 0.1 (DevOps). Tool directories are created by their owning agents when first needed.

`pack-builder/` is Python (uv), not a pnpm workspace member — it has no
`package.json`, so the `tools/*` workspace glob skips it. It needs its own
path-filtered CI job; see the handoff note in `CLAUDE.md`.
