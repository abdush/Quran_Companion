"""Quran Companion speech worker — scaffold only (task 0.1).

The real worker (VAD -> ASR -> alignment -> diff, handbook §13) is built by
the Speech Agent and communicates only via events + object storage (§9.1).
This scaffold just boots, idles, and maintains a heartbeat file so container
health checks pass.
"""

import asyncio
import logging
import os
import time
from pathlib import Path

HEARTBEAT_FILE = Path(os.environ.get("HEARTBEAT_FILE", "/tmp/qc-speech-heartbeat"))
HEARTBEAT_INTERVAL_SECONDS = 10

logger = logging.getLogger("qc-speech")


def beat(heartbeat_file: Path = HEARTBEAT_FILE) -> None:
    heartbeat_file.write_text(str(time.time()))


async def run() -> None:
    logging.basicConfig(level=logging.INFO)
    logger.info("speech worker scaffold started (no consumers registered yet)")
    while True:
        beat()
        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
