# infra/

Owner: **DevOps Agent** (`agents/devops.md`).

- `compose/` — one-command self-host dev stack (`docker compose up`): api, speech, postgres+pgvector, redis, minio. See `docs/SELF_HOSTING.md`.
- `docker/` — Dockerfiles for first-party services (kept here so service directories stay owned by their agents).
- `k8s/` — staging/prod manifests (later phase).
