"""Canonical addressing for Quran content (handbook §6.1, D-003).

Every module in the platform addresses Quran content through these value
objects — never through copied text::

    VerseKey  = (surah 1..114, ayah 1..n)          "2:255"
    WordKey   = (surah, ayah, word_position 1..n)  "2:255:3"
    WordRange = (start: WordKey, end: WordKey)     inclusive, ordered
    PageRef   = (mushaf_id, page 1..604)

``word_position`` follows the space-split ordering of the QPC Ḥafṣ text used by
QUL / Quran Foundation word APIs, so annotations stay compatible with
``surah:ayah:word_position`` integer addressing.

The string forms here are the ones the QDS OpenAPI contract
(``schemas/openapi/qds.yaml``) declares as ``verse_key`` / ``word_key``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import total_ordering

from qc_shared.quran.metadata import MADANI_604_PAGE_COUNT, SURAH_AYAH_COUNTS, SURAH_COUNT

VERSE_KEY_RE = re.compile(r"^(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4]):[1-9][0-9]{0,2}$")
WORD_KEY_RE = re.compile(r"^(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4]):[1-9][0-9]{0,2}:[1-9][0-9]{0,2}$")
MUSHAF_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class InvalidKeyError(ValueError):
    """A canonical key is malformed or addresses content that does not exist."""


def _check_verse(surah: int, ayah: int) -> None:
    if not 1 <= surah <= SURAH_COUNT:
        raise InvalidKeyError(f"surah out of range 1..{SURAH_COUNT}: {surah}")
    limit = SURAH_AYAH_COUNTS[surah]
    if not 1 <= ayah <= limit:
        raise InvalidKeyError(f"ayah out of range 1..{limit} for surah {surah}: {ayah}")


@total_ordering
@dataclass(frozen=True, slots=True)
class VerseKey:
    """An ayah address, validated against the Ḥafṣ ayah division."""

    surah: int
    ayah: int

    def __post_init__(self) -> None:
        _check_verse(self.surah, self.ayah)

    @classmethod
    def parse(cls, raw: str) -> VerseKey:
        if not VERSE_KEY_RE.match(raw):
            raise InvalidKeyError(f"not a verse key 'surah:ayah': {raw!r}")
        surah, ayah = raw.split(":")
        return cls(int(surah), int(ayah))

    def word(self, word_position: int) -> WordKey:
        return WordKey(self.surah, self.ayah, word_position)

    def __str__(self) -> str:
        return f"{self.surah}:{self.ayah}"

    def __lt__(self, other: VerseKey) -> bool:
        if not isinstance(other, VerseKey):
            return NotImplemented
        return (self.surah, self.ayah) < (other.surah, other.ayah)


@total_ordering
@dataclass(frozen=True, slots=True)
class WordKey:
    """A word address within an ayah (1-based, space-split QPC Ḥafṣ ordering)."""

    surah: int
    ayah: int
    word_position: int

    def __post_init__(self) -> None:
        _check_verse(self.surah, self.ayah)
        if self.word_position < 1:
            raise InvalidKeyError(f"word_position must be >= 1: {self.word_position}")

    @classmethod
    def parse(cls, raw: str) -> WordKey:
        if not WORD_KEY_RE.match(raw):
            raise InvalidKeyError(f"not a word key 'surah:ayah:word_position': {raw!r}")
        surah, ayah, position = raw.split(":")
        return cls(int(surah), int(ayah), int(position))

    @property
    def verse_key(self) -> VerseKey:
        return VerseKey(self.surah, self.ayah)

    def __str__(self) -> str:
        return f"{self.surah}:{self.ayah}:{self.word_position}"

    def __lt__(self, other: WordKey) -> bool:
        if not isinstance(other, WordKey):
            return NotImplemented
        return (self.surah, self.ayah, self.word_position) < (
            other.surah,
            other.ayah,
            other.word_position,
        )


@dataclass(frozen=True, slots=True)
class WordRange:
    """An inclusive, ordered span of words. Used by annotations and review items."""

    start: WordKey
    end: WordKey

    def __post_init__(self) -> None:
        if self.end < self.start:
            raise InvalidKeyError(f"word range is not ordered: {self.start} > {self.end}")

    def __str__(self) -> str:
        return f"{self.start}..{self.end}"


@dataclass(frozen=True, slots=True)
class PageRef:
    """A layout-dependent page address in a specific muṣḥaf edition."""

    mushaf_id: str
    page: int

    def __post_init__(self) -> None:
        if not MUSHAF_ID_RE.match(self.mushaf_id):
            raise InvalidKeyError(f"not a mushaf id: {self.mushaf_id!r}")
        if not 1 <= self.page <= MADANI_604_PAGE_COUNT:
            raise InvalidKeyError(f"page out of range 1..{MADANI_604_PAGE_COUNT}: {self.page}")

    def __str__(self) -> str:
        return f"{self.mushaf_id}/{self.page}"


def iter_verse_keys() -> list[VerseKey]:
    """Every ayah of the muṣḥaf in recitation order (6236 keys)."""
    return [
        VerseKey(surah, ayah)
        for surah in range(1, SURAH_COUNT + 1)
        for ayah in range(1, SURAH_AYAH_COUNTS[surah] + 1)
    ]
