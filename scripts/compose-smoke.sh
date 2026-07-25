#!/usr/bin/env bash
# Boots the self-host compose stack and waits until every service is healthy.
# Used by the compose-smoke CI job; runnable locally from the repo root.
set -euo pipefail

COMPOSE_FILE="$(dirname "$0")/../infra/compose/docker-compose.yml"
DOCKER="${DOCKER:-docker}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"

"$DOCKER" compose -f "$COMPOSE_FILE" up -d --build --wait --wait-timeout "$TIMEOUT_SECONDS"

echo "--- service status ---"
"$DOCKER" compose -f "$COMPOSE_FILE" ps

unhealthy=$("$DOCKER" compose -f "$COMPOSE_FILE" ps --format '{{.Name}} {{.Health}}' | awk '$2 != "healthy" {print}')
if [[ -n "$unhealthy" ]]; then
  echo "unhealthy services:" >&2
  echo "$unhealthy" >&2
  exit 1
fi
echo "all services healthy"
