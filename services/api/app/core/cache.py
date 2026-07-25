"""Response cache in front of the QDS reference tables (§6.5 — 24 h TTL).

QDS answers are pure functions of an immutable dataset, so caching is a plain
read-through keyed by the request. Two backends: Redis in a deployed stack, and
an in-process dictionary used when `REDIS_URL` is unset (tests, single-process
dev) so no code path has to branch on cache availability.

Nothing user-linked is ever a cache key — QDS requests carry only canonical
Quran keys (rule R7).
"""

from __future__ import annotations

import logging
from typing import Protocol

from app.core.config import settings

log = logging.getLogger(__name__)


class Cache(Protocol):
    async def get(self, key: str) -> bytes | None: ...

    async def set(self, key: str, value: bytes, ttl_seconds: int) -> None: ...


class MemoryCache:
    """Unbounded process-local cache. The corpus is small and fixed."""

    def __init__(self) -> None:
        self._entries: dict[str, bytes] = {}
        self.hits = 0
        self.misses = 0

    async def get(self, key: str) -> bytes | None:
        value = self._entries.get(key)
        if value is None:
            self.misses += 1
        else:
            self.hits += 1
        return value

    async def set(self, key: str, value: bytes, ttl_seconds: int) -> None:
        self._entries[key] = value

    def clear(self) -> None:
        self._entries.clear()
        self.hits = self.misses = 0


class RedisCache:
    def __init__(self, client) -> None:
        self._client = client

    async def get(self, key: str) -> bytes | None:
        try:
            return await self._client.get(key)
        except Exception:
            log.warning("qds cache read failed; serving from postgres", exc_info=True)
            return None

    async def set(self, key: str, value: bytes, ttl_seconds: int) -> None:
        try:
            await self._client.set(key, value, ex=ttl_seconds)
        except Exception:
            log.warning("qds cache write failed", exc_info=True)


_cache: Cache | None = None


def cache() -> Cache:
    global _cache
    if _cache is None:
        url = settings().redis_url
        if url:
            from redis.asyncio import Redis

            _cache = RedisCache(Redis.from_url(url))
        else:
            log.info("REDIS_URL unset — using the in-process QDS cache")
            _cache = MemoryCache()
    return _cache


def set_cache(replacement: Cache | None) -> None:
    """Install a cache backend (tests, or a warmed client at startup)."""
    global _cache
    _cache = replacement


def key(*parts: object) -> str:
    return ":".join([settings().cache_namespace, *(str(part) for part in parts)])
