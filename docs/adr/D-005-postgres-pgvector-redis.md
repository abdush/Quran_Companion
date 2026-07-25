# D-005 — PostgreSQL + pgvector single store; Redis for cache and streams

- **Status:** Accepted
- **Date:** 2026-07-25 (recorded; decision originates in handbook §5.2, §7, §9.2, §11)
- **Owner:** Architecture Agent

## Context

The server needs relational storage for bounded-context tables (§7), vector
search for RAG retrieval (§11), a cache in front of QDS reference tables
(p95 < 80 ms cached, §26), and an event bus (§9.2). Self-hosters must be able
to run the whole stack with `docker compose up`; every extra stateful system
multiplies their operational burden.

## Decision

**One PostgreSQL instance** is the system of record for all contexts —
schema-per-context (`usr.*`, `ann.*`, `hfz.*`, `qds.*`, `kb.*`, `sync.*`) with
ownership enforced by convention and boundary lint, migrations via Alembic
(expand → migrate → contract). **pgvector** provides embedding storage and
similarity search for the knowledge base — no separate vector database.
**Redis** serves two roles: read-through cache for QDS reference data (24 h
TTL) and **Redis Streams** as the event bus (one stream per event type,
consumer groups, dead-letter streams; D-012 covers the upgrade path behind the
`events` interface).

## Consequences

- Self-host footprint stays at Postgres + Redis + MinIO + app containers.
- Backups, migrations, and transactional integrity live in one system;
  cross-context consistency questions are explicit (events, not foreign keys
  across context schemas).
- pgvector ties RAG scale to Postgres; if corpus size outgrows it, extraction
  is localised behind the kb context's retrieval interface.
- Redis is a single point of coupling for cache + bus; stream retention and
  DLQ monitoring are operational requirements from Phase 1 (§25).

## Alternatives considered

- **Dedicated vector DB (Qdrant/Weaviate/Milvus)** — rejected for now: extra
  stateful service for self-hosters; corpus size (curated KB, §11.1) fits
  pgvector comfortably.
- **Kafka/NATS for events** — rejected at this scale: Redis is already in the
  stack and sufficient; the `events` package interface (D-012) preserves an
  upgrade path.
- **Database-per-service** — rejected with D-001: the modular monolith keeps
  one instance with per-context schemas until a context is extracted.
