# Database Reference

> **Scope:** handbook §7 — PostgreSQL schema per bounded context, key DDL, and
> migration policy.
> **Status:** scoped stub (task 0.4). **No migrations exist yet** — the first
> tables land with QDS import (task 0.3). This file becomes a full reference,
> generated where possible from Alembic metadata, during Phase 1 (handbook §27
> lists DATABASE as a Phase 1 documentation deliverable). Owner: Documentation
> Agent; schema stewardship: Database Agent.

## Shape of the schema

PostgreSQL 16 + pgvector. Naming: `snake_case`; one **schema per bounded
context**: `usr`, `ann`, `hfz`, `sync`, `qds`, `kb`, `fam`, `cm`
(see [ARCHITECTURE.md §4](ARCHITECTURE.md#4-bounded-contexts--ownership)).

Constitutional constraints:

- **No Quran text in user tables** — annotations, tests, and plans reference
  `(surah, ayah, word_position)` only ([D-003](adr/D-003-canonical-addressing.md),
  Rule R2). `qds.*` reference tables hold imported canonical text; nothing else
  copies it.
- Every migration is owned by exactly **one** bounded context.
- Cross-schema foreign keys are allowed **only** toward `usr.profile`.
- Error-kind enums use the canonical taxonomy verbatim: `stop`, `hesitation`,
  `substitution`, `omission`, `insertion`, `similar_jump`, `context_note`
  ([STYLEGUIDE.md §4](STYLEGUIDE.md#4-canonical-terminology)).

## Migration policy

Alembic, **expand → migrate → contract**: add the new shape, backfill and switch
readers/writers, drop the old shape in a later release. Never a destructive
change in a single deployment (self-hosters upgrade on their own cadence, and
clients are local-first and may lag).

Migrations run as a gated CI job on promotion (handbook §24).

## Current state

| Element | State |
|---|---|
| Alembic setup | Not created |
| `qds.*` reference tables | Task 0.3 |
| User-owned schemas (`usr`, `ann`, `hfz`, `sync`) | Phase 1 |
| pgvector indexes (`kb`, semantic search) | Phase 1 / Phase 3 |

Until this document is filled in, handbook §7.1 (ER overview) and §7.2 (selected
DDL) are the reference.
