# Decision Log (ADR Index)

Mirrors handbook §31. Each accepted decision gets one file in `docs/adr/`.
Amendments follow the ADR process: propose → Architecture Agent review →
update the relevant handbook section + this index in the same PR. A superseded
ADR keeps its file with status updated and a pointer to its successor.

| ADR | Decision | Status | File |
|---|---|---|---|
| D-001 | Modular monolith + separate speech worker over microservices | Accepted | [adr/D-001-modular-monolith-plus-speech-worker.md](adr/D-001-modular-monolith-plus-speech-worker.md) |
| D-002 | Local-first clients; server as sync/compute peer | Accepted | [adr/D-002-local-first-clients.md](adr/D-002-local-first-clients.md) |
| D-003 | Canonical addressing `(surah, ayah, word_position)`; no Quran text in user tables | Accepted (constitutional) | [adr/D-003-canonical-addressing.md](adr/D-003-canonical-addressing.md) |
| D-004 | Data packs (signed, checksummed) for offline; Quran Foundation API as build source/online extra | Accepted | [adr/D-004-signed-data-packs.md](adr/D-004-signed-data-packs.md) |
| D-005 | PostgreSQL + pgvector single store; Redis for cache/streams | Accepted | [adr/D-005-postgres-pgvector-redis.md](adr/D-005-postgres-pgvector-redis.md) |
| D-006 | FSRS + classical-cycle overlay for scheduling | Accepted — ADR file pending | — |
| D-007 | Whisper Quran fine-tunes via faster-whisper; deterministic diff layer owns error verdicts | Accepted — ADR file pending | — |
| D-008 | Two-layer tajweed feedback: deterministic text-lint authoritative; acoustic experimental | Accepted — ADR file pending | — |
| D-009 | RAG-only AI answers with verse verifier + citation checker; refusal over speculation | Accepted (constitutional) — ADR file pending | — |
| D-010 | Supabase Auth (MVP) behind OIDC abstraction; Keycloak self-host path | Accepted — ADR file pending | — |
| D-011 | OpenAPI/JSON-Schema-first; generated clients; contract tests | Accepted — ADR file pending | — |
| D-012 | Redis Streams events; upgrade path behind `events` interface | Accepted — ADR file pending | — |
| D-013 | pnpm+Turborepo / uv monorepo, boundary linting | Accepted — ADR file pending | — |
| D-014 | Yjs for CRDT docs; append-only logs for events; FSRS state derived from logs | Accepted — ADR file pending | — |
| D-015 | E2EE scope = private content bodies; structural data server-readable for opted-in sharing | Accepted — ADR file pending | — |
| D-016 | Grammar-constrained child voice commands, not open dictation | Accepted — ADR file pending | — |
| D-017 | Plugins: data plugins user-safe; code plugins operator-only; client drills declarative | Accepted — ADR file pending | — |

ADR files for D-006…D-017 are written when the first task touches the
decision's area (task 0.2 covered D-001…D-005).
