"""Canonical addressing is the contract every context depends on (§6.1, D-003)."""

from __future__ import annotations

import pytest

from qc_shared.quran.keys import (
    InvalidKeyError,
    PageRef,
    VerseKey,
    WordKey,
    WordRange,
    iter_verse_keys,
)
from qc_shared.quran.metadata import (
    MADANI_604_TOTAL_LINES,
    SURAH_AYAH_COUNTS,
    SURAH_COUNT,
    TOTAL_AYAHS,
    madani_604_lines_on_page,
)


class TestVerseKey:
    @pytest.mark.parametrize(("raw", "surah", "ayah"), [("1:1", 1, 1), ("2:255", 2, 255), ("114:6", 114, 6)])
    def test_parses_canonical_form(self, raw: str, surah: int, ayah: int) -> None:
        key = VerseKey.parse(raw)
        assert (key.surah, key.ayah) == (surah, ayah)
        assert str(key) == raw

    @pytest.mark.parametrize("raw", ["", "1", "0:1", "115:1", "1:0", "2:255:3", "1:1 ", "a:b"])
    def test_rejects_malformed(self, raw: str) -> None:
        with pytest.raises(InvalidKeyError):
            VerseKey.parse(raw)

    def test_rejects_ayah_beyond_the_surah(self) -> None:
        # al-Fātiḥa has 7 ayat; 1:8 is syntactically fine but does not exist.
        with pytest.raises(InvalidKeyError, match="ayah out of range 1..7"):
            VerseKey.parse("1:8")

    def test_orders_by_recitation(self) -> None:
        assert VerseKey(2, 255) < VerseKey(3, 1)
        assert sorted([VerseKey(2, 10), VerseKey(1, 1)]) == [VerseKey(1, 1), VerseKey(2, 10)]


class TestWordKey:
    def test_round_trips(self) -> None:
        key = WordKey.parse("2:255:3")
        assert (key.surah, key.ayah, key.word_position) == (2, 255, 3)
        assert key.verse_key == VerseKey(2, 255)
        assert str(key) == "2:255:3"

    def test_rejects_zero_position(self) -> None:
        with pytest.raises(InvalidKeyError):
            WordKey.parse("2:255:0")


class TestWordRange:
    def test_accepts_ordered_span(self) -> None:
        span = WordRange(WordKey(2, 255, 1), WordKey(2, 255, 9))
        assert str(span) == "2:255:1..2:255:9"

    def test_rejects_reversed_span(self) -> None:
        with pytest.raises(InvalidKeyError, match="not ordered"):
            WordRange(WordKey(2, 255, 9), WordKey(2, 255, 1))


class TestPageRef:
    def test_accepts_a_layout_edition(self) -> None:
        assert str(PageRef("qpc-hafs-madani-604", 604)) == "qpc-hafs-madani-604/604"

    @pytest.mark.parametrize(("mushaf_id", "page"), [("qpc-hafs-madani-604", 605), ("QPC", 1), ("qpc_hafs", 1)])
    def test_rejects_bad_refs(self, mushaf_id: str, page: int) -> None:
        with pytest.raises(InvalidKeyError):
            PageRef(mushaf_id, page)


class TestCorpusMetadata:
    def test_matches_the_hafs_division(self) -> None:
        assert len(SURAH_AYAH_COUNTS) == SURAH_COUNT == 114
        assert TOTAL_AYAHS == 6236
        assert SURAH_AYAH_COUNTS[1] == 7
        assert SURAH_AYAH_COUNTS[2] == 286
        assert SURAH_AYAH_COUNTS[114] == 6

    def test_enumerates_every_ayah_once(self) -> None:
        keys = iter_verse_keys()
        assert len(keys) == TOTAL_AYAHS == len(set(keys))
        assert keys[0] == VerseKey(1, 1)
        assert keys[-1] == VerseKey(114, 6)

    def test_madani_604_line_counts(self) -> None:
        assert madani_604_lines_on_page(1) == 8
        assert madani_604_lines_on_page(2) == 8
        assert madani_604_lines_on_page(3) == 15
        assert madani_604_lines_on_page(604) == 15
        assert MADANI_604_TOTAL_LINES == 8 + 8 + 602 * 15

    @pytest.mark.parametrize("page", [0, 605])
    def test_rejects_pages_outside_the_mushaf(self, page: int) -> None:
        with pytest.raises(ValueError, match="page out of range"):
            madani_604_lines_on_page(page)
