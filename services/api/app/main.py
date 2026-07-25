"""Quran Companion API — scaffold only (task 0.1).

No feature logic lives here yet. Bounded contexts (usr/ann/hfz/qds/kb/tutor/
sync/fam/cm) are empty packages; the Backend Agent implements them
schema-first (rule R1).
"""

from fastapi import FastAPI

app = FastAPI(title="Quran Companion API", version="0.0.1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
