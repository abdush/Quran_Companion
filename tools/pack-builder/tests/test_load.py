"""The loader: truncate-and-reload of `qds.*`, with the licensing gate in front.

Runs against SQLite with the `qds` schema translated away, so the real tables,
constraints and load order are exercised without a Postgres instance.
"""

from __future__ import annotations

import dataclasses

import pytest
from qc_shared.licensing import UnregisteredDatasetError
from qc_shared.qds import tables as qds
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import IntegrityError

from pack_builder.config import ITEM_LAYOUT, ITEM_QPC_TEXT, ITEM_TANZIL_TEXT, ITEM_WBW, MUSHAF_ID
from pack_builder.corpus import (
    Corpus,
    GlossRow,
    PageLineRow,
    PlacementRow,
    VerseRow,
    WordRow,
)
from pack_builder.load import load_corpus
from pack_builder.validate import SchemaValidationError


@pytest.fixture
def engine():
    raw = create_engine("sqlite://")
    translated = raw.execution_options(schema_translate_map={qds.QDS_SCHEMA: None})
    yield translated
    raw.dispose()


@pytest.fixture
def tiny_corpus() -> Corpus:
    """A structurally complete corpus of two ayat — enough for every table."""
    return Corpus(
        verses=[
            VerseRow(114, 1, "…", 4),
            VerseRow(114, 2, "…", 2),
        ],
        words=[
            WordRow(114, 1, 1, "a", None),
            WordRow(114, 1, 2, "b", "b"),
            WordRow(114, 1, 3, "c", None),
            WordRow(114, 1, 4, "d", None),
            WordRow(114, 2, 1, "e", None),
            WordRow(114, 2, 2, "f", None),
        ],
        glosses=[GlossRow(114, 1, 1, "en", "Say")],
        placements=[
            PlacementRow(114, 1, 1, 604, 3, 1),
            PlacementRow(114, 1, 2, 604, 3, 2),
            PlacementRow(114, 1, 3, 604, 3, 3),
            PlacementRow(114, 1, 4, 604, 3, 4),
            PlacementRow(114, 2, 1, 604, 4, 1),
            PlacementRow(114, 2, 2, 604, 4, 2),
        ],
        page_lines=[
            PageLineRow(604, 1, "surah_name", 114, 0),
            PageLineRow(604, 2, "basmallah", 114, 0),
            PageLineRow(604, 3, "ayah", None, 4),
            PageLineRow(604, 4, "ayah", None, 2),
        ],
        mushaf_id=MUSHAF_ID,
        gloss_language="en",
        reference_payload=b"114|1|\n114|2|\n",
    )


class TestLoad:
    def test_populates_every_table(self, tiny_corpus: Corpus, engine) -> None:
        report = load_corpus(tiny_corpus, engine, create_schema=True)
        assert report.rows == {
            "dataset": 4,
            "mushaf": 1,
            "verse": 2,
            "word": 6,
            "word_gloss": 1,
            "page_line": 4,
            "word_placement": 6,
            "translation_resource": 1,
        }

    def test_records_dataset_provenance(self, tiny_corpus: Corpus, engine) -> None:
        load_corpus(tiny_corpus, engine, create_schema=True)
        with engine.connect() as connection:
            rows = connection.execute(
                select(qds.dataset.c.item, qds.dataset.c.checksum, qds.dataset.c.pack_id)
            ).all()
        items = {item for item, _, _ in rows}
        assert items == {ITEM_TANZIL_TEXT, ITEM_QPC_TEXT, ITEM_LAYOUT, ITEM_WBW}
        assert all(checksum.startswith("sha256:") for _, checksum, _ in rows)
        assert {pack for _, _, pack in rows} == {"core-hafs"}

    def test_reload_replaces_rather_than_appends(self, tiny_corpus: Corpus, engine) -> None:
        load_corpus(tiny_corpus, engine, create_schema=True)
        load_corpus(tiny_corpus, engine)
        with engine.connect() as connection:
            assert connection.execute(select(func.count()).select_from(qds.word)).scalar() == 6

    def test_layout_heading_lines_survive_the_round_trip(
        self, tiny_corpus: Corpus, engine
    ) -> None:
        load_corpus(tiny_corpus, engine, create_schema=True)
        with engine.connect() as connection:
            types = connection.execute(
                select(qds.page_line.c.line_type).order_by(qds.page_line.c.line_number)
            ).scalars().all()
        assert types == ["surah_name", "basmallah", "ayah", "ayah"]

    def test_word_count_check_constraint_is_enforced(self, tiny_corpus: Corpus, engine) -> None:
        broken = dataclasses.replace(
            tiny_corpus, verses=[dataclasses.replace(tiny_corpus.verses[0], word_count=0)]
        )
        with pytest.raises(IntegrityError):
            load_corpus(broken, engine, create_schema=True)


class TestGatesRunBeforeAnyWrite:
    def test_a_foreign_mushaf_is_refused(self, tiny_corpus: Corpus, engine) -> None:
        with pytest.raises(SchemaValidationError, match="expected"):
            load_corpus(
                dataclasses.replace(tiny_corpus, mushaf_id="indopak-15-lines"),
                engine,
                create_schema=True,
            )

    def test_an_unregistered_gloss_language_is_refused(
        self, tiny_corpus: Corpus, engine, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from pack_builder import load

        monkeypatch.setattr(
            load, "corpus_items", lambda corpus: (ITEM_TANZIL_TEXT, "wbw:xx-unregistered")
        )
        with pytest.raises(UnregisteredDatasetError, match="wbw:xx-unregistered"):
            load_corpus(tiny_corpus, engine, create_schema=True)

    def test_nothing_is_written_when_a_gate_fails(self, tiny_corpus: Corpus, engine) -> None:
        with engine.begin() as connection:
            qds.metadata.create_all(connection)
        with pytest.raises(SchemaValidationError):
            load_corpus(dataclasses.replace(tiny_corpus, gloss_language="fr"), engine)
        with engine.connect() as connection:
            assert connection.execute(select(func.count()).select_from(qds.verse)).scalar() == 0
