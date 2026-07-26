"""Raw upstream data → the normalised, validated :class:`~pack_builder.corpus.Corpus`.

Three things happen here, in order, and each one can abort the build:

1. **Cross-source agreement.** Tanzil's ayah division and the QUL word data must
   describe the same corpus: same 6236 ayat, same 114 surahs, contiguous word
   positions. A disagreement means one of the two sources changed under us.

2. **Placement consistency.** Word placements must be non-decreasing in
   `(page, line)` as the canonical key increases — that is simply what "typeset
   in recitation order" means. Violations are located without reference to any
   correction (longest non-decreasing subsequence), then matched against
   `fixtures/layout_errata.json`. Anything not listed there aborts the build;
   the pipeline never invents a repair.

3. **Heading reconstruction.** Lines that hold no words are the muṣḥaf's
   surah-name and basmallah bands. Each is attributed to the surah that opens
   immediately below it, walking backwards across the page break where needed.
   Every empty line must be claimed by exactly one surah, and every surah must
   get its full complement (name, plus a basmallah for all but al-Fātiḥa and
   at-Tawba) — otherwise the layout is not understood and the build aborts.
"""

from __future__ import annotations

import bisect
import json
from dataclasses import dataclass

from qc_shared.quran.metadata import (
    MADANI_604_PAGE_COUNT,
    SURAH_AYAH_COUNTS,
    SURAH_COUNT,
    SURAHS_WITHOUT_STANDALONE_BASMALLAH,
    TOTAL_AYAHS,
    madani_604_lines_on_page,
)

from pack_builder.config import MUSHAF_ID, REFERENCE_FIXTURE_PATH, WBW_LANGUAGE
from pack_builder.corpus import (
    Corpus,
    GlossRow,
    PageLineRow,
    PlacementRow,
    VerseRow,
    WordRow,
)
from pack_builder.sources import qul, tanzil

LINE_TYPE_AYAH = "ayah"
LINE_TYPE_SURAH_NAME = "surah_name"
LINE_TYPE_BASMALLAH = "basmallah"

ERRATA_PATH = REFERENCE_FIXTURE_PATH.with_name("layout_errata.json")


class NormalisationError(RuntimeError):
    """The upstream data cannot be normalised into a coherent corpus."""


# --- the line-slot lattice ----------------------------------------------------

_SLOTS: tuple[tuple[int, int], ...] = tuple(
    (page, line)
    for page in range(1, MADANI_604_PAGE_COUNT + 1)
    for line in range(1, madani_604_lines_on_page(page) + 1)
)
_SLOT_INDEX: dict[tuple[int, int], int] = {slot: i for i, slot in enumerate(_SLOTS)}


@dataclass(frozen=True, slots=True)
class PageShift:
    start: str
    end: str
    page_delta: int


def load_errata(path=ERRATA_PATH) -> list[PageShift]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("errata_version") != 1:
        raise NormalisationError(f"unsupported errata_version in {path}")
    if raw.get("mushaf_id") != MUSHAF_ID:
        raise NormalisationError(f"errata in {path} are for a different muṣḥaf")
    return [
        PageShift(shift["from"], shift["to"], int(shift["page_delta"]))
        for shift in raw["page_shifts"]
    ]


def _longest_non_decreasing(values: list[int]) -> set[int]:
    """Indices of a longest non-decreasing subsequence of `values`."""
    tails: list[int] = []
    tail_index: list[int] = []
    parent = [-1] * len(values)
    for i, value in enumerate(values):
        j = bisect.bisect_right(tails, value)
        if j == len(tails):
            tails.append(value)
            tail_index.append(i)
        else:
            tails[j] = value
            tail_index[j] = i
        parent[i] = tail_index[j - 1] if j > 0 else -1
    kept: set[int] = set()
    cursor = tail_index[-1] if tail_index else -1
    while cursor != -1:
        kept.add(cursor)
        cursor = parent[cursor]
    return kept


def _word_key(word: qul.QulWord) -> str:
    return f"{word.surah}:{word.ayah}:{word.word_position}"


def apply_layout_errata(words: list[qul.QulWord]) -> list[tuple[qul.QulWord, int, int]]:
    """Return `(word, page, line)` with recorded page shifts applied.

    Raises if the data contains a placement violation the errata file does not
    cover, or if it lists a shift the data no longer needs.
    """
    shifts = load_errata()
    position = {_word_key(word): i for i, word in enumerate(words)}

    delta = [0] * len(words)
    for shift in shifts:
        try:
            start, end = position[shift.start], position[shift.end]
        except KeyError as exc:
            raise NormalisationError(
                f"errata reference an unknown word key {exc.args[0]!r}; "
                f"regenerate fixtures/layout_errata.json"
            ) from None
        if end < start:
            raise NormalisationError(f"errata range is reversed: {shift.start}..{shift.end}")
        for i in range(start, end + 1):
            delta[i] = shift.page_delta

    placed = [(word, word.page + delta[i], word.line_number) for i, word in enumerate(words)]

    for word, page, line in placed:
        if (page, line) not in _SLOT_INDEX:
            raise NormalisationError(
                f"word {_word_key(word)} lands outside the muṣḥaf at page {page} line {line}"
            )

    sequence = [_SLOT_INDEX[(page, line)] for _, page, line in placed]
    kept = _longest_non_decreasing(sequence)
    unresolved = [words[i] for i in range(len(sequence)) if i not in kept]
    if unresolved:
        sample = ", ".join(_word_key(word) for word in unresolved[:10])
        raise NormalisationError(
            f"{len(unresolved)} word placement(s) contradict recitation order and are not "
            f"covered by fixtures/layout_errata.json: {sample}"
            f"{' …' if len(unresolved) > 10 else ''}. "
            "Upstream layout data changed — investigate before recording new errata."
        )

    # An errata entry that is no longer needed is itself a defect: it means the
    # correction is now being applied on top of already-correct upstream data.
    if shifts:
        raw_sequence = [_SLOT_INDEX[(w.page, w.line_number)] for w in words]
        if len(_longest_non_decreasing(raw_sequence)) == len(words):
            raise NormalisationError(
                "upstream layout no longer needs any errata; "
                "clear fixtures/layout_errata.json"
            )
    return placed


# --- heading reconstruction ---------------------------------------------------


def derive_page_lines(
    placed: list[tuple[qul.QulWord, int, int]],
) -> tuple[list[PageLineRow], list[PlacementRow]]:
    occupied: dict[tuple[int, int], list[tuple[qul.QulWord, int, int]]] = {}
    for entry in placed:
        occupied.setdefault((entry[1], entry[2]), []).append(entry)

    surah_first_slot: dict[int, tuple[int, int]] = {}
    for word, page, line in placed:
        if word.ayah == 1 and word.word_position == 1 and not word.is_end_marker:
            surah_first_slot.setdefault(word.surah, (page, line))
    if len(surah_first_slot) != SURAH_COUNT:
        missing = sorted(set(range(1, SURAH_COUNT + 1)) - set(surah_first_slot))
        raise NormalisationError(f"no page placement for the opening of surah(s) {missing}")

    headings: dict[tuple[int, int], tuple[int, str]] = {}
    for surah in sorted(surah_first_slot):
        needed = [LINE_TYPE_SURAH_NAME]
        if surah not in SURAHS_WITHOUT_STANDALONE_BASMALLAH:
            # Rendered directly above the first ayah line, below the name band.
            needed.append(LINE_TYPE_BASMALLAH)
        cursor = _SLOT_INDEX[surah_first_slot[surah]] - 1
        claimed: list[tuple[int, int]] = []
        while cursor >= 0 and len(claimed) < len(needed):
            slot = _SLOTS[cursor]
            if slot in occupied or slot in headings:
                break
            claimed.append(slot)
            cursor -= 1
        if len(claimed) != len(needed):
            raise NormalisationError(
                f"surah {surah} opens at page {surah_first_slot[surah][0]} line "
                f"{surah_first_slot[surah][1]} with {len(claimed)} free heading line(s), "
                f"expected {len(needed)} ({', '.join(needed)})"
            )
        # `claimed` walks upwards from the ayah line: basmallah first, then name.
        for slot, line_type in zip(claimed, reversed(needed)):
            headings[slot] = (surah, line_type)

    unclaimed = [slot for slot in _SLOTS if slot not in occupied and slot not in headings]
    if unclaimed:
        raise NormalisationError(
            f"{len(unclaimed)} typeset line(s) hold neither words nor a surah heading, "
            f"e.g. {unclaimed[:5]} — the layout is not fully understood"
        )

    page_lines: list[PageLineRow] = []
    placements: list[PlacementRow] = []
    for page, line in _SLOTS:
        members = occupied.get((page, line))
        if members is None:
            surah, line_type = headings[(page, line)]
            page_lines.append(PageLineRow(page, line, line_type, surah, 0))
            continue
        members.sort(key=lambda entry: (entry[0].surah, entry[0].ayah, entry[0].word_position))
        real_words = [entry for entry in members if not entry[0].is_end_marker]
        page_lines.append(PageLineRow(page, line, LINE_TYPE_AYAH, None, len(real_words)))
        for ordinal, (word, _, _) in enumerate(real_words, start=1):
            placements.append(
                PlacementRow(word.surah, word.ayah, word.word_position, page, line, ordinal)
            )
    return page_lines, placements


# --- assembly -----------------------------------------------------------------


BASMALLAH_WORD_COUNT = 4


def strip_leading_basmallah(verses: list[tanzil.TanzilVerse]) -> list[tanzil.TanzilVerse]:
    """Remove the basmallah that Tanzil prefixes to the first ayah of a surah.

    Tanzil's distribution carries the basmallah inside the text of ayah 1 for
    every surah but al-Fātiḥa (where it *is* ayah 1) and at-Tawba (which has
    none). The muṣḥaf sets it as its own line, and QPC word positions —
    the canonical addressing of §6.1 — do not include it, so it must not be part
    of the ayah text either; it is represented as a `basmallah` page line.

    The prefix is discovered from the data rather than written down here (no
    Quran text in code, rule R2). It is always four tokens; tokens 2-4 must be
    byte-identical across all 112 surahs, which is asserted before anything is
    stripped. The first token is not required to match, because Tanzil records a
    tajwīd variant of it (an extra shadda) where the preceding surah's ending
    causes idghām.
    """
    affected = [
        verse
        for verse in verses
        if verse.ayah == 1 and verse.surah not in SURAHS_WITHOUT_STANDALONE_BASMALLAH
    ]
    expected_count = SURAH_COUNT - len(SURAHS_WITHOUT_STANDALONE_BASMALLAH)
    if len(affected) != expected_count:
        raise NormalisationError(
            f"expected {expected_count} basmallah-prefixed opening ayat, found {len(affected)}"
        )

    tails = {" ".join(verse.text.split()[1:BASMALLAH_WORD_COUNT]) for verse in affected}
    if len(tails) != 1:
        raise NormalisationError(
            f"tokens 2-{BASMALLAH_WORD_COUNT} of ayah 1 are not identical across surahs "
            f"({len(tails)} distinct forms) — the basmallah cannot be identified"
        )

    affected_keys = {(verse.surah, verse.ayah) for verse in affected}
    stripped: list[tanzil.TanzilVerse] = []
    for verse in verses:
        if (verse.surah, verse.ayah) not in affected_keys:
            stripped.append(verse)
            continue
        tokens = verse.text.split()
        remainder = " ".join(tokens[BASMALLAH_WORD_COUNT:])
        if not remainder:
            raise NormalisationError(f"surah {verse.surah} ayah 1 is empty after the basmallah")
        stripped.append(tanzil.TanzilVerse(verse.surah, verse.ayah, remainder))
    return stripped


def build_corpus() -> Corpus:
    """Fetch (from cache), cross-validate and normalise every dataset item."""
    raw_verses = tanzil.parse(tanzil.fetch())
    reference_payload = tanzil.canonical_payload(raw_verses)
    tanzil_verses = strip_leading_basmallah(raw_verses)
    qul_words = qul.load_all_words()

    words = [word for word in qul_words if not word.is_end_marker]
    counts: dict[tuple[int, int], int] = {}
    for word in words:
        key = (word.surah, word.ayah)
        expected = counts.get(key, 0) + 1
        if word.word_position != expected:
            raise NormalisationError(
                f"word positions for {key[0]}:{key[1]} are not contiguous: "
                f"expected {expected}, got {word.word_position}"
            )
        counts[key] = expected

    if len(counts) != TOTAL_AYAHS:
        raise NormalisationError(
            f"QUL word data covers {len(counts)} ayat, expected {TOTAL_AYAHS}"
        )
    for surah, ayah_count in SURAH_AYAH_COUNTS.items():
        for ayah in range(1, ayah_count + 1):
            if (surah, ayah) not in counts:
                raise NormalisationError(f"QUL word data has no words for {surah}:{ayah}")

    verses = [
        VerseRow(
            surah=verse.surah,
            ayah=verse.ayah,
            text_uthmani=verse.text,
            word_count=counts[(verse.surah, verse.ayah)],
        )
        for verse in tanzil_verses
    ]

    word_rows = [
        WordRow(
            surah=word.surah,
            ayah=word.ayah,
            word_position=word.word_position,
            text_uthmani=word.text_uthmani,
            transliteration=word.transliteration or None,
        )
        for word in words
    ]
    gloss_rows = [
        GlossRow(
            surah=word.surah,
            ayah=word.ayah,
            word_position=word.word_position,
            language=WBW_LANGUAGE,
            gloss=word.gloss,
        )
        for word in words
        if word.gloss
    ]

    placed = apply_layout_errata(qul_words)
    page_lines, placements = derive_page_lines(placed)

    return Corpus(
        verses=verses,
        words=word_rows,
        glosses=gloss_rows,
        placements=placements,
        page_lines=page_lines,
        mushaf_id=MUSHAF_ID,
        gloss_language=WBW_LANGUAGE,
        reference_payload=reference_payload,
    )
