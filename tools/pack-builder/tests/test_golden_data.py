"""Golden data gates (handbook §23, rule R8).

These are the non-negotiable ones for task 0.3: Quran text checksums, word count
per ayah, and layout row counts. **Never weaken an expectation to make one
pass** — a red gate means the data or the pipeline is wrong, and the fixture is
only regenerated (`pack-builder freeze-reference`) after the change has been
understood and reviewed.

Each test also asserts that the gate *detects* a corresponding corruption, so a
gate cannot quietly degrade into a no-op.
"""

from __future__ import annotations

import dataclasses

import pytest
from qc_shared.quran.metadata import (
    MADANI_604_PAGE_COUNT,
    SURAH_COUNT,
    SURAHS_WITHOUT_STANDALONE_BASMALLAH,
    TOTAL_AYAHS,
    madani_604_lines_on_page,
)

from pack_builder import golden
from pack_builder.corpus import Corpus
from pack_builder.golden import GoldenCheckError, Reference

pytestmark = pytest.mark.golden


class TestTextChecksums:
    """Gate 1 — the shipped text is the Tanzil reference, byte for byte."""

    def test_corpus_matches_the_pinned_checksums(
        self, corpus: Corpus, reference: Reference
    ) -> None:
        golden.check_reference_checksums(corpus, reference)

    def test_every_surah_has_a_pinned_digest(self, reference: Reference) -> None:
        assert sorted(reference.surah_sha256) == list(range(1, SURAH_COUNT + 1))

    def test_a_single_altered_character_is_caught(
        self, corpus: Corpus, reference: Reference
    ) -> None:
        tampered = dataclasses.replace(
            corpus, reference_payload=corpus.reference_payload.replace(b"1|1|", b"1|1| ", 1)
        )
        with pytest.raises(GoldenCheckError, match="does not match the pinned checksum"):
            golden.check_reference_checksums(tampered, reference)

    def test_a_surah_level_change_is_caught(self, corpus: Corpus, reference: Reference) -> None:
        verses = list(corpus.verses)
        verses[0] = dataclasses.replace(verses[0], text_uthmani=verses[0].text_uthmani + "ـ")
        with pytest.raises(GoldenCheckError, match="surah text digests differ"):
            golden.check_reference_checksums(dataclasses.replace(corpus, verses=verses), reference)


class TestWordCounts:
    """Gate 2 — word counts per ayah, cross-checked against a second source."""

    def test_counts_match_the_pinned_reference(self, corpus: Corpus, reference: Reference) -> None:
        golden.check_word_counts(corpus, reference)

    def test_corpus_has_the_canonical_totals(self, corpus: Corpus) -> None:
        assert len(corpus.verses) == TOTAL_AYAHS
        # 77,429 is the received word count of the QPC Ḥafṣ text.
        assert len(corpus.words) == 77_429

    def test_word_positions_are_contiguous_from_one(self, corpus: Corpus) -> None:
        seen: dict[tuple[int, int], int] = {}
        for word in corpus.words:
            key = (word.surah, word.ayah)
            assert word.word_position == seen.get(key, 0) + 1, f"gap at {key}"
            seen[key] = word.word_position

    def test_declared_word_count_matches_the_rows(self, corpus: Corpus) -> None:
        counts: dict[tuple[int, int], int] = {}
        for word in corpus.words:
            counts[(word.surah, word.ayah)] = counts.get((word.surah, word.ayah), 0) + 1
        for verse in corpus.verses:
            assert verse.word_count == counts[(verse.surah, verse.ayah)]

    def test_cross_source_divergence_is_fully_enumerated(self, reference: Reference) -> None:
        # Tanzil and QPC split the text identically except where the muṣḥaf sets
        # two words as one unit. Those are listed one by one; a new divergence
        # must be investigated, not absorbed.
        assert reference.joined_units == {"2:181": 1, "8:6": 1, "13:37": 1, "37:130": 1}
        assert len(reference.basmallah_surahs) == SURAH_COUNT - len(
            SURAHS_WITHOUT_STANDALONE_BASMALLAH
        )

    def test_a_dropped_word_is_caught(self, corpus: Corpus, reference: Reference) -> None:
        words = [w for w in corpus.words if (w.surah, w.ayah, w.word_position) != (2, 255, 50)]
        with pytest.raises(GoldenCheckError, match="unexpected word counts"):
            golden.check_word_counts(dataclasses.replace(corpus, words=words), reference)

    def test_a_lying_word_count_is_caught(self, corpus: Corpus, reference: Reference) -> None:
        verses = list(corpus.verses)
        verses[0] = dataclasses.replace(verses[0], word_count=verses[0].word_count + 1)
        with pytest.raises(GoldenCheckError, match="unexpected word counts|word_count"):
            golden.check_word_counts(dataclasses.replace(corpus, verses=verses), reference)


class TestLayoutRowCounts:
    """Gate 3 — the Madani 604 muṣḥaf has a fixed number of typeset lines."""

    def test_layout_is_complete_and_consistent(self, corpus: Corpus) -> None:
        golden.check_layout(corpus)

    def test_every_page_has_its_expected_line_count(self, corpus: Corpus) -> None:
        per_page: dict[int, int] = {}
        for line in corpus.page_lines:
            per_page[line.page] = per_page.get(line.page, 0) + 1
        assert len(per_page) == MADANI_604_PAGE_COUNT
        for page in range(1, MADANI_604_PAGE_COUNT + 1):
            assert per_page[page] == madani_604_lines_on_page(page), f"page {page}"

    def test_heading_lines_account_for_every_surah(self, corpus: Corpus) -> None:
        names = {line.surah for line in corpus.page_lines if line.line_type == "surah_name"}
        basmallahs = {line.surah for line in corpus.page_lines if line.line_type == "basmallah"}
        assert names == set(range(1, SURAH_COUNT + 1))
        assert basmallahs == set(range(1, SURAH_COUNT + 1)) - SURAHS_WITHOUT_STANDALONE_BASMALLAH

    def test_every_word_is_placed_exactly_once(self, corpus: Corpus) -> None:
        placed = [(p.surah, p.ayah, p.word_position) for p in corpus.placements]
        assert len(placed) == len(set(placed)) == len(corpus.words)

    def test_placements_follow_recitation_order(self, corpus: Corpus) -> None:
        ordered = sorted(corpus.placements, key=lambda p: (p.surah, p.ayah, p.word_position))
        slots = [(p.page, p.line_number, p.line_ordinal) for p in ordered]
        assert slots == sorted(slots), "words are not typeset in recitation order"

    def test_a_missing_line_is_caught(self, corpus: Corpus) -> None:
        lines = [line for line in corpus.page_lines if not (line.page == 3 and line.line_number == 5)]
        with pytest.raises(GoldenCheckError, match="wrong line count"):
            golden.check_layout(dataclasses.replace(corpus, page_lines=lines))

    def test_a_mistyped_heading_line_is_caught(self, corpus: Corpus) -> None:
        lines = list(corpus.page_lines)
        index = next(i for i, line in enumerate(lines) if line.line_type == "basmallah")
        lines[index] = dataclasses.replace(lines[index], line_type="surah_name")
        with pytest.raises(GoldenCheckError, match="lines, expected"):
            golden.check_layout(dataclasses.replace(corpus, page_lines=lines))

    def test_a_heading_line_carrying_words_is_caught(self, corpus: Corpus) -> None:
        lines = list(corpus.page_lines)
        index = next(i for i, line in enumerate(lines) if line.line_type == "surah_name")
        lines[index] = dataclasses.replace(lines[index], word_count=3)
        with pytest.raises(GoldenCheckError, match="carries words"):
            golden.check_layout(dataclasses.replace(corpus, page_lines=lines))


def test_run_all_passes_on_the_real_corpus(corpus: Corpus, reference: Reference) -> None:
    golden.run_all(corpus, reference)
