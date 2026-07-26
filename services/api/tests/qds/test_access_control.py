"""Access control for the QDS surface.

QDS is the one context with no per-profile authorisation, and that is a design
decision rather than an omission: it serves public reference data addressed only
by canonical Quran keys (§6.1) and holds no user-linked rows to scope. The
playbook's "authz test for every new endpoint" therefore takes the form of
proving the properties that *do* apply:

* the endpoints expose nothing profile-scoped and leak no identity back;
* they are unauthenticated by design, and a bogus credential changes nothing;
* they are strictly read-only — no mutating verb is routed, and the connection
  the request handler gets cannot write.

The wrong-profile → 403/404 test arrives with the first profile-scoped context
(`usr`/`ann` in phase 1).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from qc_shared.qds import tables as qds
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import AsyncConnection

from tests.qds.conftest import MUSHAF_ID

VERSE_URL = "/v1/quran/verses/114:1"
PAGE_URL = f"/v1/quran/pages/{MUSHAF_ID}/604"


class TestPublicReadOnlySurface:
    @pytest.mark.parametrize("url", [VERSE_URL, PAGE_URL])
    def test_requires_no_credentials(self, client: TestClient, url: str) -> None:
        assert client.get(url).status_code == 200

    @pytest.mark.parametrize("url", [VERSE_URL, PAGE_URL])
    def test_ignores_a_supplied_credential(self, client: TestClient, url: str) -> None:
        anonymous = client.get(url)
        with_token = client.get(url, headers={"Authorization": "Bearer not-a-real-token"})
        assert with_token.status_code == 200
        assert with_token.json() == anonymous.json()

    @pytest.mark.parametrize("url", [VERSE_URL, PAGE_URL])
    @pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
    def test_no_mutating_verb_is_routed(self, client: TestClient, url: str, method: str) -> None:
        assert getattr(client, method)(url).status_code == 405

    @pytest.mark.parametrize("url", [VERSE_URL, PAGE_URL])
    def test_response_carries_no_user_linked_fields(self, client: TestClient, url: str) -> None:
        body = client.get(url).json()
        forbidden = {"profile_id", "user_id", "profile", "user", "auth_subject", "email"}
        assert not forbidden & set(body)

    def test_a_profile_id_query_parameter_is_ignored(self, client: TestClient) -> None:
        # Reference data must never vary by caller — that is what makes it
        # publicly cacheable (§8.1).
        plain = client.get(VERSE_URL)
        scoped = client.get(VERSE_URL, params={"profile_id": "11111111-1111-1111-1111-111111111111"})
        assert scoped.status_code == 200
        assert scoped.json() == plain.json()
        assert scoped.headers["ETag"] == plain.headers["ETag"]


class TestReadOnlyConnection:
    async def test_reads_succeed(self, db: AsyncConnection) -> None:
        result = await db.execute(text("SELECT count(*) FROM verse"))
        assert result.scalar_one() == 4

    async def test_postgres_connections_open_a_read_only_transaction(self) -> None:
        # SQLite has no read-only transaction mode, so the guard is asserted on
        # the dialect the deployed stack uses.
        from app.core import db as db_module

        source = await _fake_postgres_engine()
        async with db_module.qds_connection(source) as connection:
            assert connection.dialect.name == "postgresql"
        assert source.statements == ["SET TRANSACTION READ ONLY"]


class TestNoRuntimeWrites:
    def test_request_handlers_contain_no_write_statements(self) -> None:
        from pathlib import Path

        from app.qds import repository, service

        for module in (repository, service):
            body = Path(module.__file__).read_text(encoding="utf-8")
            for forbidden in ("insert(", "update(", "delete(", "DELETE FROM", "INSERT INTO"):
                assert forbidden not in body, (
                    f"{module.__name__} contains a write path: {forbidden}"
                )

    async def test_writes_are_possible_only_through_the_import_pipeline(
        self, engine
    ) -> None:
        # Sanity check on the fixture itself: the tables are writable by the
        # loader's engine, so the read-only guarantee comes from the request
        # path, not from a permanently locked database.
        async with engine.begin() as connection:
            await connection.execute(
                insert(qds.translation_resource),
                [
                    {
                        "id": "en-sahih",
                        "language": "en",
                        "name": "Sahih International",
                        "translator": None,
                        "direction": "ltr",
                        "is_word_by_word": False,
                        "dataset_item": "wbw:en",
                    }
                ],
            )


class _RecordingEngine:
    """Minimal stand-in that reports the postgresql dialect and records DDL."""

    def __init__(self) -> None:
        self.statements: list[str] = []

    def connect(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_) -> bool:
        return False

    @property
    def dialect(self):
        class _Dialect:
            name = "postgresql"

        return _Dialect()

    async def execute(self, statement) -> None:
        self.statements.append(str(statement))


async def _fake_postgres_engine() -> _RecordingEngine:
    return _RecordingEngine()
