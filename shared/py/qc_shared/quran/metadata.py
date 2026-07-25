"""Structural metadata of the Ḥafṣ muṣḥaf — counts and bounds, never text.

This module is deliberately text-free (rule R2 / D-003): it holds only the
*shape* of the corpus, which every context needs in order to validate canonical
keys without a round-trip to the Quran Data Service.

Sources of truth for the constants below:

- ``SURAH_AYAH_COUNTS`` — the Ḥafṣ ʿan ʿĀṣim ayah division, identical across
  Tanzil ``quran-uthmani`` and the QPC Ḥafṣ texts used by QUL.
- ``MADANI_604_LINES_PER_PAGE`` — the King Fahd Glorious Qurʾān Printing
  Complex Madani muṣḥaf (604 pages): 15 typeset lines on every page except the
  two opening framed pages, which carry 8.

These are *independent expectations*: golden tests (§23, rule R8) assert that
imported data reproduces them. Never regenerate them from imported data — that
would make the gate tautological.
"""

from __future__ import annotations

from types import MappingProxyType

SURAH_COUNT = 114

#: Ayah count per surah, indexed 1..114 (index 0 is unused padding).
_AYAH_COUNTS: tuple[int, ...] = (
    0,
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
)

SURAH_AYAH_COUNTS: MappingProxyType[int, int] = MappingProxyType(
    {surah: count for surah, count in enumerate(_AYAH_COUNTS) if surah > 0}
)

#: Total ayat in the Ḥafṣ division.
TOTAL_AYAHS = sum(SURAH_AYAH_COUNTS.values())

#: Surahs whose first line is *not* preceded by a standalone basmallah line:
#: al-Fātiḥa (the basmallah is ayah 1:1 itself) and at-Tawba (none is written).
SURAHS_WITHOUT_STANDALONE_BASMALLAH = frozenset({1, 9})

#: Canonical id of the layout+script edition this phase ships (§6.1).
MADANI_604_MUSHAF_ID = "qpc-hafs-madani-604"

MADANI_604_PAGE_COUNT = 604

_MADANI_604_FRAMED_PAGE_LINES = 8
_MADANI_604_STANDARD_PAGE_LINES = 15


def ayah_count(surah: int) -> int:
    """Number of ayat in ``surah``; raises ``KeyError`` for an unknown surah."""
    return SURAH_AYAH_COUNTS[surah]


def madani_604_lines_on_page(page: int) -> int:
    """Expected typeset line count for ``page`` of the Madani 604 muṣḥaf."""
    if not 1 <= page <= MADANI_604_PAGE_COUNT:
        raise ValueError(f"page out of range 1..{MADANI_604_PAGE_COUNT}: {page}")
    if page <= 2:
        return _MADANI_604_FRAMED_PAGE_LINES
    return _MADANI_604_STANDARD_PAGE_LINES


MADANI_604_LINES_PER_PAGE: MappingProxyType[int, int] = MappingProxyType(
    {page: madani_604_lines_on_page(page) for page in range(1, MADANI_604_PAGE_COUNT + 1)}
)

#: Total typeset lines across the whole Madani 604 muṣḥaf.
MADANI_604_TOTAL_LINES = sum(MADANI_604_LINES_PER_PAGE.values())
