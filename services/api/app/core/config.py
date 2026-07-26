"""Runtime settings, from the environment only (rule R7 — no secrets in code)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

#: QDS reference data is immutable between imports; §6.5 mandates a 24 h TTL.
QDS_CACHE_TTL_SECONDS = 24 * 60 * 60


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    redis_url: str | None
    qds_cache_ttl_seconds: int = QDS_CACHE_TTL_SECONDS
    cache_namespace: str = "qds:v1"

    @classmethod
    def from_env(cls) -> Settings:
        database_url = os.environ.get(
            "DATABASE_URL", "postgresql+asyncpg://qc:qc-dev-password@localhost:5432/qc"
        )
        # The compose stack hands the same URL to every service; normalise the
        # driver rather than requiring a second variable.
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return cls(
            database_url=database_url,
            redis_url=os.environ.get("REDIS_URL"),
            qds_cache_ttl_seconds=int(
                os.environ.get("QDS_CACHE_TTL_SECONDS", QDS_CACHE_TTL_SECONDS)
            ),
        )


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings.from_env()
