"""`app.qds.api` — the published facade other contexts resolve Quran data through.

`ann`, `hfz` and `tutor` will call these functions rather than touching `qds.*`
directly (§9.1), so the facade is covered independently of the HTTP layer.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.problems import ProblemError
from app.qds import api
from tests.qds.conftest import MUSHAF_ID


class TestResolveVerse:
    async def test_returns_text_by_default(self, db: AsyncConnection, memory_cache) -> None:
        verse = await api.resolve_verse(db, "114:1")
        assert verse["verse_key"] == "114:1"
        assert verse["text"]
        assert "words" not in verse

    async def test_can_include_words(self, db: AsyncConnection, memory_cache) -> None:
        verse = await api.resolve_verse(db, "114:1", with_words=True)
        assert [word["word_position"] for word in verse["words"]] == [1, 2, 3, 4]

    async def test_missing_verse_raises_a_problem(
        self, db: AsyncConnection, memory_cache
    ) -> None:
        with pytest.raises(ProblemError) as caught:
            await api.resolve_verse(db, "114:6")
        assert caught.value.status == 404

    async def test_malformed_key_raises_a_problem(
        self, db: AsyncConnection, memory_cache
    ) -> None:
        with pytest.raises(ProblemError) as caught:
            await api.resolve_verse(db, "0:0")
        assert caught.value.status == 400


class TestResolvePage:
    async def test_returns_the_line_inventory(self, db: AsyncConnection, memory_cache) -> None:
        page = await api.resolve_page(db, MUSHAF_ID, 604)
        assert page["page"] == 604
        assert [line["line_type"] for line in page["lines"]][:2] == ["surah_name", "basmallah"]

    async def test_unknown_mushaf_raises_a_problem(
        self, db: AsyncConnection, memory_cache
    ) -> None:
        with pytest.raises(ProblemError) as caught:
            await api.resolve_page(db, "indopak-15-lines", 604)
        assert caught.value.status == 404


class TestVerseExists:
    @pytest.mark.parametrize(
        ("surah", "ayah", "expected"), [(114, 1, True), (114, 6, False), (1, 1, True)]
    )
    async def test_reports_presence(
        self, db: AsyncConnection, surah: int, ayah: int, expected: bool
    ) -> None:
        assert await api.verse_exists(db, surah, ayah) is expected
