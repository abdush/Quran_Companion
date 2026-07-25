# Self-Hosting Quran Companion

> Seeded by DevOps in task 0.1 because the compose stack landed there (rule R5).
> Owned by the Documentation Agent going forward; expanded as the stack grows.

## Status

Phase 0 scaffold: the stack boots `api` (FastAPI, `/health` only), `speech`
(idle worker), `postgres` (with pgvector), `redis`, and `minio`. The gateway
and the seeded core data pack arrive in later Phase 0/1 tasks.

## Requirements

- Docker Engine 24+ with the Compose plugin.

## One-command boot

```bash
docker compose -f infra/compose/docker-compose.yml up -d --build --wait
```

All five services must report **healthy**. Verify:

```bash
docker compose -f infra/compose/docker-compose.yml ps
curl http://localhost:8000/health
```

Or run the same smoke check CI uses:

```bash
bash scripts/compose-smoke.sh
```

## Endpoints (dev defaults)

| Service | Address | Credentials |
|---|---|---|
| API | http://localhost:8000 | — |
| Postgres (pgvector) | localhost:5432, db `qc` | `qc` / `qc-dev-password` |
| Redis | localhost:6379 | — |
| MinIO S3 / console | http://localhost:9000 / http://localhost:9001 | `qc-minio` / `qc-dev-password` |

Dev credentials are compose-file defaults for local use only — never reuse
them outside the local stack.

## Tear down

```bash
docker compose -f infra/compose/docker-compose.yml down -v
```
