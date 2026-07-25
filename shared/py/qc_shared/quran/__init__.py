"""Canonical Quran addressing and corpus metadata (handbook §6.1)."""

from qc_shared.quran.keys import (
    InvalidKeyError,
    PageRef,
    VerseKey,
    WordKey,
    WordRange,
    iter_verse_keys,
)
from qc_shared.quran.metadata import (
    MADANI_604_LINES_PER_PAGE,
    MADANI_604_MUSHAF_ID,
    MADANI_604_PAGE_COUNT,
    SURAH_AYAH_COUNTS,
    SURAH_COUNT,
    TOTAL_AYAHS,
    ayah_count,
    madani_604_lines_on_page,
)

__all__ = [
    "MADANI_604_LINES_PER_PAGE",
    "MADANI_604_MUSHAF_ID",
    "MADANI_604_PAGE_COUNT",
    "SURAH_AYAH_COUNTS",
    "SURAH_COUNT",
    "TOTAL_AYAHS",
    "InvalidKeyError",
    "PageRef",
    "VerseKey",
    "WordKey",
    "WordRange",
    "ayah_count",
    "iter_verse_keys",
    "madani_604_lines_on_page",
]
