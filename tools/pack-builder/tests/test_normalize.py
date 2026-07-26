"""Normalisation invariants, including the layout errata contract."""

from __future__ import annotations

import json

import pytest
from qc_shared.quran.metadata import SURAH_COUNT, SURAHS_WITHOUT_STANDALONE_BASMALLAH, TOTAL_AYAHS

from pack_builder import normalize
from pack_builder.config import MUSHAF_ID
from pack_builder.corpus import Corpus
from pack_builder.normalize import NormalisationError
from pack_builder.sources import qul, tanzil
from pack_builder.validate import validate_corpus_against_openapi

pytestmark = pytest.mark.golden


class TestErrata:
    def test_errata_file_is_well_formed(self) -> None:
        raw = json.loads(normalize.ERRATA_PATH.read_text(encoding="utf-8"))
        assert raw["errata_version"] == 1
        assert raw["mushaf_id"] == MUSHAF_ID
        assert raw["page_shifts"], "an empty errata list should be removed, not left in place"
        for shift in raw["page_shifts"]:
            assert shift["page_delta"] in (-1, 1)

    def test_upstream_still_needs_exactly_these_corrections(self) -> None:
        # Passing means: every placement violation is covered, and no listed
        # correction has become unnecessary. Both directions matter — see
        # apply_layout_errata.
        normalize.apply_layout_errata(qul.load_all_words())

    def test_an_uncovered_violation_aborts_the_build(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(normalize, "load_errata", lambda path=None: [])
        with pytest.raises(NormalisationError, match="contradict recitation order"):
            normalize.apply_layout_errata(qul.load_all_words())

    def test_corrected_placements_are_monotonic(self) -> None:
        placed = normalize.apply_layout_errata(qul.load_all_words())
        slots = [(page, line) for _, page, line in placed]
        assert slots == sorted(slots)


class TestBasmallahHandling:
    def test_stripped_from_opening_ayat_only(self) -> None:
        raw = tanzil.parse(tanzil.fetch())
        stripped = normalize.strip_leading_basmallah(raw)
        by_key = {(v.surah, v.ayah): v.text for v in raw}
        changed = {
            (v.surah, v.ayah) for v in stripped if v.text != by_key[(v.surah, v.ayah)]
        }
        expected = {
            (surah, 1)
            for surah in range(1, SURAH_COUNT + 1)
            if surah not in SURAHS_WITHOUT_STANDALONE_BASMALLAH
        }
        assert changed == expected

    def test_al_fatiha_and_at_tawba_are_untouched(self) -> None:
        raw = {(v.surah, v.ayah): v.text for v in tanzil.parse(tanzil.fetch())}
        stripped = {(v.surah, v.ayah): v.text for v in normalize.strip_leading_basmallah(list(
            tanzil.parse(tanzil.fetch())
        ))}
        assert stripped[(1, 1)] == raw[(1, 1)]
        assert stripped[(9, 1)] == raw[(9, 1)]

    def test_basmallah_appears_as_its_own_page_line(self, corpus: Corpus) -> None:
        basmallah_lines = [line for line in corpus.page_lines if line.line_type == "basmallah"]
        assert len(basmallah_lines) == 112
        assert all(line.word_count == 0 for line in basmallah_lines)


class TestCorpusShape:
    def test_covers_the_whole_mushaf(self, corpus: Corpus) -> None:
        assert len(corpus.verses) == TOTAL_AYAHS
        assert corpus.mushaf_id == MUSHAF_ID
        assert corpus.gloss_language == "en"
        assert corpus.reference_payload

    def test_every_word_has_a_gloss_or_is_explicitly_missing(self, corpus: Corpus) -> None:
        glossed = {(g.surah, g.ayah, g.word_position) for g in corpus.glosses}
        words = {(w.surah, w.ayah, w.word_position) for w in corpus.words}
        assert glossed <= words
        # The English word-by-word set is complete for this pack.
        assert glossed == words

    def test_no_ayah_end_markers_leak_into_the_word_set(self, corpus: Corpus) -> None:
        # End markers are typographic glyphs, not words of the text; keeping
        # them would shift every word_position after them (D-003).
        counts: dict[tuple[int, int], int] = {}
        for word in corpus.words:
            counts[(word.surah, word.ayah)] = counts.get((word.surah, word.ayah), 0) + 1
        assert counts[(1, 1)] == 4
        assert counts[(114, 6)] == 3

    def test_projections_satisfy_the_openapi_contract(self, corpus: Corpus) -> None:
        validate_corpus_against_openapi(corpus)


class TestSourceParsing:
    def test_tanzil_parse_rejects_a_truncated_corpus(self, tmp_path) -> None:
        path = tmp_path / "short.txt"
        path.write_text("1|1|text\n", encoding="utf-8")
        with pytest.raises(tanzil.TanzilParseError, match="expected 6236 ayat"):
            tanzil.parse(path)

    def test_tanzil_parse_rejects_a_malformed_line(self, tmp_path) -> None:
        path = tmp_path / "bad.txt"
        path.write_text("1|1\n", encoding="utf-8")
        with pytest.raises(tanzil.TanzilParseError, match="expected 'surah\\|ayah\\|text'"):
            tanzil.parse(path)

    def test_qul_words_are_deduplicated_across_page_responses(self) -> None:
        words = qul.load_all_words()
        keys = [(w.surah, w.ayah, w.word_position) for w in words]
        assert len(keys) == len(set(keys))
        assert keys == sorted(keys)
