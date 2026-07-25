"""Load a normalised corpus into the `qds.*` reference tables (§6.5, §7.3).

`qds` is import-generated: the loader replaces it wholesale inside a single
transaction, so a failed import leaves the previous data serving. Nothing else
in the platform writes here.

The licensing gate runs *before* the first insert — an unregistered dataset can
never reach the database (§6.4, NFR-9).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from qc_shared.qds import tables as qds
from qc_shared.quran.metadata import MADANI_604_PAGE_COUNT, madani_604_lines_on_page
from sqlalchemy import Engine, create_engine, delete, insert
from sqlalchemy.schema import CreateSchema

from pack_builder.config import (
    ITEM_LAYOUT,
    ITEM_QPC_TEXT,
    ITEM_SOURCES,
    ITEM_TANZIL_TEXT,
    ITEM_WBW,
    MUSHAF_ID,
    PACK_ID,
    PACK_VERSION,
    database_url,
)
from pack_builder.corpus import Corpus
from pack_builder.pack import Payload, build_payloads
from pack_builder.validate import corpus_items, registry, validate_licensing

log = logging.getLogger(__name__)

_CHUNK = 5_000


@dataclass(frozen=True, slots=True)
class LoadReport:
    rows: dict[str, int]

    def __str__(self) -> str:
        return ", ".join(f"{table}={count}" for table, count in sorted(self.rows.items()))


def make_engine(url: str | None = None) -> Engine:
    return create_engine(url or database_url(), future=True)


def _chunks(rows: Sequence[dict[str, Any]]) -> Iterable[Sequence[dict[str, Any]]]:
    for start in range(0, len(rows), _CHUNK):
        yield rows[start : start + _CHUNK]


def load_corpus(
    corpus: Corpus,
    engine: Engine | None = None,
    *,
    pack_id: str = PACK_ID,
    pack_version: str = PACK_VERSION,
    create_schema: bool = False,
) -> LoadReport:
    items = corpus_items(corpus)
    validate_licensing(items, registry().declarations_for(items))

    payloads = {payload.item: payload for payload in build_payloads(corpus)}
    engine = engine or make_engine()

    if create_schema:
        with engine.begin() as connection:
            # SQLite (used by tests) has no schemas; the caller translates the
            # `qds` schema away via execution options instead.
            if connection.dialect.name == "postgresql":
                connection.execute(CreateSchema(qds.QDS_SCHEMA, if_not_exists=True))
            qds.metadata.create_all(connection)

    dataset_rows = [_dataset_row(item, payloads[item], corpus, pack_id, pack_version) for item in items]
    verse_rows = [
        {
            "surah": v.surah,
            "ayah": v.ayah,
            "text_uthmani": v.text_uthmani,
            "word_count": v.word_count,
            "dataset_item": ITEM_TANZIL_TEXT,
        }
        for v in corpus.verses
    ]
    word_rows = [
        {
            "surah": w.surah,
            "ayah": w.ayah,
            "word_position": w.word_position,
            "text_uthmani": w.text_uthmani,
            "transliteration": w.transliteration,
            "morphology_ref": None,
            "dataset_item": ITEM_QPC_TEXT,
        }
        for w in corpus.words
    ]
    gloss_rows = [
        {
            "surah": g.surah,
            "ayah": g.ayah,
            "word_position": g.word_position,
            "language": g.language,
            "gloss": g.gloss,
            "dataset_item": ITEM_WBW,
        }
        for g in corpus.glosses
    ]
    line_rows = [
        {
            "mushaf_id": corpus.mushaf_id,
            "page": line.page,
            "line_number": line.line_number,
            "line_type": line.line_type,
            "surah": line.surah,
            "word_count": line.word_count,
        }
        for line in corpus.page_lines
    ]
    placement_rows = [
        {
            "mushaf_id": corpus.mushaf_id,
            "surah": p.surah,
            "ayah": p.ayah,
            "word_position": p.word_position,
            "page": p.page,
            "line_number": p.line_number,
            "line_ordinal": p.line_ordinal,
        }
        for p in corpus.placements
    ]
    mushaf_rows = [
        {
            "id": corpus.mushaf_id,
            "name": "KFGQPC V1 Madani muṣḥaf (1405H print), 604 pages",
            "script": "uthmani",
            "page_count": MADANI_604_PAGE_COUNT,
            "lines_per_page": madani_604_lines_on_page(MADANI_604_PAGE_COUNT),
            "dataset_item": ITEM_LAYOUT,
        }
    ]
    translation_rows = [
        {
            "id": f"wbw-{corpus.gloss_language}",
            "language": corpus.gloss_language,
            "name": "Word-by-word English gloss (QuranWBW via QUL)",
            "translator": "QuranWBW.com",
            "direction": "ltr",
            "is_word_by_word": True,
            "dataset_item": ITEM_WBW,
        }
    ]

    plan: list[tuple[Any, list[dict[str, Any]]]] = [
        (qds.dataset, dataset_rows),
        (qds.mushaf, mushaf_rows),
        (qds.verse, verse_rows),
        (qds.word, word_rows),
        (qds.word_gloss, gloss_rows),
        (qds.page_line, line_rows),
        (qds.word_placement, placement_rows),
        (qds.translation_resource, translation_rows),
    ]

    with engine.begin() as connection:
        for table in reversed(qds.LOAD_ORDER):
            connection.execute(delete(table))
        for table, rows in plan:
            for chunk in _chunks(rows):
                connection.execute(insert(table), list(chunk))
            log.info("loaded %s rows into %s", len(rows), table.fullname)

    return LoadReport({table.name: len(rows) for table, rows in plan})


def _dataset_row(
    item: str, payload: Payload, corpus: Corpus, pack_id: str, pack_version: str
) -> dict[str, Any]:
    source = ITEM_SOURCES[item]
    counts = {
        ITEM_TANZIL_TEXT: len(corpus.verses),
        ITEM_QPC_TEXT: len(corpus.words),
        ITEM_LAYOUT: len(corpus.page_lines),
        ITEM_WBW: len(corpus.glosses),
    }
    return {
        "item": item,
        "version": source.version,
        "source_url": source.source_url,
        "checksum": payload.checksum,
        "pack_id": pack_id,
        "pack_version": pack_version,
        "row_count": counts[item],
    }


__all__ = ["MUSHAF_ID", "LoadReport", "load_corpus", "make_engine"]
