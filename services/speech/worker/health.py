"""Container health check: exit 0 if the heartbeat file is fresh, 1 otherwise.

Used by the compose/k8s health check: ``python -m worker.health``.
"""

import sys
import time

from worker.main import HEARTBEAT_FILE, HEARTBEAT_INTERVAL_SECONDS

MAX_AGE_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3


def is_healthy() -> bool:
    try:
        last_beat = float(HEARTBEAT_FILE.read_text())
    except (OSError, ValueError):
        return False
    return (time.time() - last_beat) < MAX_AGE_SECONDS


if __name__ == "__main__":
    sys.exit(0 if is_healthy() else 1)
