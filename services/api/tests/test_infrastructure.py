"""Settings and cache backends — the pieces every context will inherit."""

from __future__ import annotations

import pytest

from app.core import cache as cache_module
from app.core.cache import MemoryCache, RedisCache
from app.core.config import QDS_CACHE_TTL_SECONDS, Settings


class TestSettings:
    def test_normalises_the_compose_database_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # The compose stack hands every service the same plain URL.
        monkeypatch.setenv("DATABASE_URL", "postgresql://qc:pw@postgres:5432/qc")
        assert Settings.from_env().database_url.startswith("postgresql+asyncpg://")

    def test_keeps_an_explicit_driver(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://qc@db/qc")
        assert Settings.from_env().database_url == "postgresql+asyncpg://qc@db/qc"

    def test_defaults_to_a_24_hour_qds_ttl(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("QDS_CACHE_TTL_SECONDS", raising=False)
        assert Settings.from_env().qds_cache_ttl_seconds == QDS_CACHE_TTL_SECONDS == 86_400

    def test_ttl_is_overridable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("QDS_CACHE_TTL_SECONDS", "60")
        assert Settings.from_env().qds_cache_ttl_seconds == 60


class TestCacheSelection:
    def test_falls_back_to_memory_without_redis(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("REDIS_URL", raising=False)
        from app.core.config import settings

        settings.cache_clear()
        cache_module.set_cache(None)
        try:
            assert isinstance(cache_module.cache(), MemoryCache)
        finally:
            cache_module.set_cache(None)
            settings.cache_clear()

    def test_uses_redis_when_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
        from app.core.config import settings

        settings.cache_clear()
        cache_module.set_cache(None)
        try:
            assert isinstance(cache_module.cache(), RedisCache)
        finally:
            cache_module.set_cache(None)
            settings.cache_clear()

    def test_keys_are_namespaced(self) -> None:
        assert cache_module.key("verse", "abc", "2:255") == "qds:v1:verse:abc:2:255"


class TestMemoryCache:
    async def test_round_trips_and_counts(self) -> None:
        cache = MemoryCache()
        assert await cache.get("k") is None
        await cache.set("k", b"v", 60)
        assert await cache.get("k") == b"v"
        assert (cache.hits, cache.misses) == (1, 1)
        cache.clear()
        assert await cache.get("k") is None


class TestUnhandledErrorsBecomeProblems:
    """§8.1: every error leaves the API as problem+json, handler or not.

    A dependency resolves before the route body, so a database outage would
    otherwise produce a bare `500 text/plain` — unparseable exactly when a
    client most needs a structured error.
    """

    def test_dependency_failure_returns_problem_json(self) -> None:
        from fastapi.testclient import TestClient

        from app.main import app
        from app.qds.router import connection as connection_dependency

        async def broken():
            raise ConnectionRefusedError(
                "password authentication failed for user 'qc' at postgres:5432"
            )
            yield  # pragma: no cover - never reached

        app.dependency_overrides[connection_dependency] = broken
        try:
            with TestClient(app, raise_server_exceptions=False) as client:
                response = client.get("/v1/quran/verses/1:1")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 500
        assert response.headers["content-type"].startswith("application/problem+json")
        body = response.json()
        assert body["status"] == 500
        assert body["instance"] == "/v1/quran/verses/1:1"
        # No connection strings, credentials or query fragments (rule R7).
        assert "password" not in response.text
        assert "postgres" not in response.text
        assert body["detail"] == "The request could not be completed."

    def test_health_survives_a_database_outage(self) -> None:
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as client:
            assert client.get("/health").json() == {"status": "ok"}


class TestRedisCacheDegradesGracefully:
    """A cache outage must never turn a readable verse into an error."""

    class _Broken:
        async def get(self, key: str):
            raise ConnectionError("redis is down")

        async def set(self, key: str, value: bytes, ex: int) -> None:
            raise ConnectionError("redis is down")

    async def test_read_failure_falls_through(self) -> None:
        assert await RedisCache(self._Broken()).get("k") is None

    async def test_write_failure_is_swallowed(self) -> None:
        await RedisCache(self._Broken()).set("k", b"v", 60)
