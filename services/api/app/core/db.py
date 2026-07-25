"""Async database access.

The QDS session is deliberately special: `qds.*` is import-generated and
read-only at runtime (§7.3), so its connections open a **read-only
transaction**. That turns the rule into something the database enforces rather
than something reviewers have to remember — an accidental write from a request
path fails loudly instead of corrupting reference data.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import settings


@lru_cache(maxsize=1)
def engine() -> AsyncEngine:
    return create_async_engine(settings().database_url, pool_pre_ping=True, future=True)


@asynccontextmanager
async def qds_connection(source: AsyncEngine | None = None) -> AsyncIterator[AsyncConnection]:
    """A read-only connection onto the `qds` reference schema."""
    async with (source or engine()).connect() as connection:
        if connection.dialect.name == "postgresql":
            await connection.execute(text("SET TRANSACTION READ ONLY"))
        yield connection


async def dispose() -> None:
    await engine().dispose()
    engine.cache_clear()
