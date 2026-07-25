# scripts/

Owner: **DevOps Agent** (`agents/devops.md`).

Cross-cutting helper scripts. Currently:

- `compose-smoke.sh` — boots the compose stack and waits until every service reports healthy; used by the `compose-smoke` CI job and runnable locally.
