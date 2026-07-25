"""A self-contained `qds` fixture database.

The suite runs against SQLite with the `qds` schema translated away, so the
tests exercise the real tables, the real queries and the real router without
needing Postgres. The fixture data is deliberately tiny but *shaped* like the
corpus: complete surahs at both ends of the muṣḥaf, a page with heading lines,
and a word-by-word gloss.

Fixture text is real Quran text and therefore lives only here, inside the `qds`
context that is allowed to hold it (rule R2).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from qc_shared.qds import tables as qds
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core import cache as cache_module
from app.core.cache import MemoryCache
from app.core.db import qds_connection
from app.main import app
from app.qds.router import connection as connection_dependency

MUSHAF_ID = "qpc-hafs-madani-604"
DATASET_TEXT = "text:tanzil-uthmani-1.1"
DATASET_QPC = "text:qpc-hafs"
DATASET_LAYOUT = f"layout:{MUSHAF_ID}"
DATASET_WBW = "wbw:en"

# 114:1-6 (an-Nās) and 1:1 — enough to exercise verses, words, glosses and a page.
_VERSES = [
    (1, 1, "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", 4),
    (114, 1, "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ", 4),
    (114, 2, "مَلِكِ ٱلنَّاسِ", 2),
    (114, 3, "إِلَٰهِ ٱلنَّاسِ", 2),
]
_WORDS = {
    (1, 1): ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"],
    (114, 1): ["قُلْ", "أَعُوذُ", "بِرَبِّ", "ٱلنَّاسِ"],
    (114, 2): ["مَلِكِ", "ٱلنَّاسِ"],
    (114, 3): ["إِلَـٰهِ", "ٱلنَّاسِ"],
}
_GLOSSES = {
    (1, 1, 1): "In (the) name",
    (114, 1, 1): "Say",
    (114, 1, 2): "I seek refuge",
}

#: Page 604 in miniature: heading lines that carry no words, then ayah lines.
_PAGE = 604
_PAGE_LINES = [
    (1, "surah_name", 114),
    (2, "basmallah", 114),
    (3, "ayah", None),
    (4, "ayah", None),
]
_PLACEMENTS = [
    (114, 1, 1, 3, 1),
    (114, 1, 2, 3, 2),
    (114, 1, 3, 3, 3),
    (114, 1, 4, 3, 4),
    (114, 2, 1, 4, 1),
    (114, 2, 2, 4, 2),
    (114, 3, 1, 4, 3),
    (114, 3, 2, 4, 4),
]


def _translate(engine: AsyncEngine) -> AsyncEngine:
    return engine.execution_options(schema_translate_map={qds.QDS_SCHEMA: None})


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    raw = create_async_engine("sqlite+aiosqlite:///:memory:")
    engine = _translate(raw)
    async with engine.begin() as connection:
        await connection.run_sync(qds.metadata.create_all)
        await _seed(connection)
    yield engine
    await raw.dispose()


async def _seed(connection) -> None:
    from sqlalchemy import insert

    await connection.execute(
        insert(qds.dataset),
        [
            {
                "item": item,
                "version": "test",
                "source_url": "https://example.test/",
                "checksum": f"sha256:{index:064d}",
                "pack_id": "core-hafs",
                "pack_version": "2026.07.0",
                "row_count": 1,
            }
            for index, item in enumerate(
                [DATASET_TEXT, DATASET_QPC, DATASET_LAYOUT, DATASET_WBW], start=1
            )
        ],
    )
    await connection.execute(
        insert(qds.mushaf),
        [
            {
                "id": MUSHAF_ID,
                "name": "KFGQPC V1 Madani",
                "script": "uthmani",
                "page_count": 604,
                "lines_per_page": 15,
                "dataset_item": DATASET_LAYOUT,
            }
        ],
    )
    await connection.execute(
        insert(qds.verse),
        [
            {
                "surah": surah,
                "ayah": ayah,
                "text_uthmani": text,
                "word_count": count,
                "dataset_item": DATASET_TEXT,
            }
            for surah, ayah, text, count in _VERSES
        ],
    )
    await connection.execute(
        insert(qds.word),
        [
            {
                "surah": surah,
                "ayah": ayah,
                "word_position": position,
                "text_uthmani": text,
                "transliteration": None,
                "morphology_ref": None,
                "dataset_item": DATASET_QPC,
            }
            for (surah, ayah), words in _WORDS.items()
            for position, text in enumerate(words, start=1)
        ],
    )
    await connection.execute(
        insert(qds.word_gloss),
        [
            {
                "surah": surah,
                "ayah": ayah,
                "word_position": position,
                "language": "en",
                "gloss": gloss,
                "dataset_item": DATASET_WBW,
            }
            for (surah, ayah, position), gloss in _GLOSSES.items()
        ],
    )
    await connection.execute(
        insert(qds.page_line),
        [
            {
                "mushaf_id": MUSHAF_ID,
                "page": _PAGE,
                "line_number": line_number,
                "line_type": line_type,
                "surah": surah,
                "word_count": 0
                if surah is not None
                else sum(1 for p in _PLACEMENTS if p[3] == line_number),
            }
            for line_number, line_type, surah in _PAGE_LINES
        ],
    )
    await connection.execute(
        insert(qds.word_placement),
        [
            {
                "mushaf_id": MUSHAF_ID,
                "surah": surah,
                "ayah": ayah,
                "word_position": position,
                "page": _PAGE,
                "line_number": line_number,
                "line_ordinal": ordinal,
            }
            for surah, ayah, position, line_number, ordinal in _PLACEMENTS
        ],
    )
    await connection.execute(
        insert(qds.translation_resource),
        [
            {
                "id": "wbw-en",
                "language": "en",
                "name": "Word-by-word English",
                "translator": "QuranWBW.com",
                "direction": "ltr",
                "is_word_by_word": True,
                "dataset_item": DATASET_WBW,
            }
        ],
    )


@pytest.fixture
def memory_cache() -> MemoryCache:
    cache = MemoryCache()
    cache_module.set_cache(cache)
    yield cache
    cache_module.set_cache(None)


@pytest.fixture
def client(engine: AsyncEngine, memory_cache: MemoryCache) -> TestClient:
    async def override():
        async with qds_connection(engine) as active:
            yield active

    app.dependency_overrides[connection_dependency] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def db(engine: AsyncEngine):
    async with qds_connection(engine) as connection:
        yield connection
