"""Public facade of the `qds` bounded context (§9.1).

Other contexts resolve Quran content only through these functions — never by
importing `qds` internals or reaching into `qds.*` tables. That keeps the
canonical-addressing contract (D-003) in one place and lets QDS change its
storage without touching `ann`, `hfz` or `tutor`.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncConnection

from app.qds import repository, service
from app.qds.schemas import VerseField

__all__ = ["VerseField", "resolve_page", "resolve_verse", "verse_exists"]


async def resolve_verse(
    connection: AsyncConnection, verse_key: str, *, with_words: bool = False
) -> dict:
    fields = {VerseField.TEXT}
    if with_words:
        fields.add(VerseField.WORDS)
    return (await service.get_verse(connection, verse_key, fields)).json()


async def resolve_page(connection: AsyncConnection, mushaf_id: str, page: int) -> dict:
    return (await service.get_page(connection, mushaf_id, page)).json()


async def verse_exists(connection: AsyncConnection, surah: int, ayah: int) -> bool:
    return await repository.get_verse(connection, surah, ayah) is not None
