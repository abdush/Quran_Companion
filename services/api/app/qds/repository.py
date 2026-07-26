"""Read-only queries over the `qds.*` reference tables.

Every method here takes an already-read-only connection (see
`app.core.db.qds_connection`) and returns plain rows; response shaping lives in
:mod:`app.qds.service`. There is no `profile_id` scoping in this context by
design — QDS serves public reference data addressed solely by canonical Quran
keys, and holds no user-linked rows to scope.
"""

from __future__ import annotations

from dataclasses import dataclass

from qc_shared.qds import tables as qds
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection


@dataclass(frozen=True, slots=True)
class VerseRow:
    surah: int
    ayah: int
    text_uthmani: str
    word_count: int


@dataclass(frozen=True, slots=True)
class WordRow:
    surah: int
    ayah: int
    word_position: int
    text_uthmani: str
    transliteration: str | None
    morphology_ref: str | None
    gloss: str | None


@dataclass(frozen=True, slots=True)
class PageLineRow:
    line_number: int
    line_type: str
    word_keys: tuple[str, ...]


async def dataset_checksums(connection: AsyncConnection) -> dict[str, str]:
    """Checksum per loaded dataset item — the input to every `dataset_version`."""
    result = await connection.execute(select(qds.dataset.c.item, qds.dataset.c.checksum))
    return {item: checksum for item, checksum in result.all()}


async def get_verse(connection: AsyncConnection, surah: int, ayah: int) -> VerseRow | None:
    statement = select(
        qds.verse.c.surah, qds.verse.c.ayah, qds.verse.c.text_uthmani, qds.verse.c.word_count
    ).where(qds.verse.c.surah == surah, qds.verse.c.ayah == ayah)
    row = (await connection.execute(statement)).first()
    return None if row is None else VerseRow(*row)


async def get_words(
    connection: AsyncConnection, surah: int, ayah: int, gloss_language: str | None = None
) -> list[WordRow]:
    gloss = qds.word_gloss
    statement = (
        select(
            qds.word.c.surah,
            qds.word.c.ayah,
            qds.word.c.word_position,
            qds.word.c.text_uthmani,
            qds.word.c.transliteration,
            qds.word.c.morphology_ref,
            gloss.c.gloss,
        )
        .select_from(
            qds.word.outerjoin(
                gloss,
                (gloss.c.surah == qds.word.c.surah)
                & (gloss.c.ayah == qds.word.c.ayah)
                & (gloss.c.word_position == qds.word.c.word_position)
                & (gloss.c.language == (gloss_language or "")),
            )
        )
        .where(qds.word.c.surah == surah, qds.word.c.ayah == ayah)
        .order_by(qds.word.c.word_position)
    )
    return [WordRow(*row) for row in (await connection.execute(statement)).all()]


async def mushaf_exists(connection: AsyncConnection, mushaf_id: str) -> bool:
    statement = select(qds.mushaf.c.id).where(qds.mushaf.c.id == mushaf_id)
    return (await connection.execute(statement)).first() is not None


async def get_page_lines(
    connection: AsyncConnection, mushaf_id: str, page: int
) -> list[PageLineRow]:
    lines = (
        await connection.execute(
            select(qds.page_line.c.line_number, qds.page_line.c.line_type)
            .where(qds.page_line.c.mushaf_id == mushaf_id, qds.page_line.c.page == page)
            .order_by(qds.page_line.c.line_number)
        )
    ).all()
    if not lines:
        return []

    placements = (
        await connection.execute(
            select(
                qds.word_placement.c.line_number,
                qds.word_placement.c.surah,
                qds.word_placement.c.ayah,
                qds.word_placement.c.word_position,
            )
            .where(
                qds.word_placement.c.mushaf_id == mushaf_id,
                qds.word_placement.c.page == page,
            )
            .order_by(qds.word_placement.c.line_number, qds.word_placement.c.line_ordinal)
        )
    ).all()

    by_line: dict[int, list[str]] = {}
    for line_number, surah, ayah, word_position in placements:
        by_line.setdefault(line_number, []).append(f"{surah}:{ayah}:{word_position}")

    return [
        PageLineRow(line_number, line_type, tuple(by_line.get(line_number, ())))
        for line_number, line_type in lines
    ]
