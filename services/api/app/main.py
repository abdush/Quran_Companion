"""Quran Companion API — FastAPI modular monolith (handbook §5, §7–§9).

Bounded contexts mount their own routers; nothing cross-context happens here.
`qds` is live as of task 0.3; the remaining contexts are still empty packages.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core import db
from app.qds.router import install_error_handler
from app.qds.router import router as qds_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await db.dispose()


app = FastAPI(title="Quran Companion API", version="0.1.0", lifespan=lifespan)

install_error_handler(app)
app.include_router(qds_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
