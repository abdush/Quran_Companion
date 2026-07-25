"""The golden data checks (handbook §23, rule R8).

Three gates, each comparing the built corpus against an expectation that does
*not* come from the corpus:

1. :func:`check_reference_checksums` — the Tanzil text we ship hashes to the
   digests pinned in `fixtures/tanzil_reference.json`, whole-corpus and
   per-surah. Detects any silent change to the text, upstream or local.
2. :func:`check_word_counts` — per-ayah word counts match the pinned
   expectation, agree with the actual word rows, and reconcile with an
   independent space-split of the Tanzil text. The two sources legitimately
   disagree in exactly two documented ways (the standalone basmallah, and the
   handful of units the muṣḥaf sets joined); both are enumerated in the fixture
   and any *new* disagreement fails.
3. :func:`check_layout` — every page carries exactly the number of typeset lines
   the Madani 604 muṣḥaf has, the heading lines total 114 surah names plus 112
   basmallahs, and every word is placed exactly once.

These functions raise :class:`GoldenCheckError`. They are called by the CLI
before a pack is written *and* by the test suite. Never relax an expectation to
make one pass — a red golden check means the data or the code is wrong.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from qc_shared.quran.metadata import (
    MADANI_604_PAGE_COUNT,
    SURAH_AYAH_COUNTS,
    SURAH_COUNT,
    SURAHS_WITHOUT_STANDALONE_BASMALLAH,
    TOTAL_AYAHS,
    madani_604_lines_on_page,
)

from pack_builder.config import REFERENCE_FIXTURE_PATH
from pack_builder.corpus import Corpus, sha256_hex
from pack_builder.normalize import (
    BASMALLAH_WORD_COUNT,
    LINE_TYPE_AYAH,
    LINE_TYPE_BASMALLAH,
    LINE_TYPE_SURAH_NAME,
)


class GoldenCheckError(AssertionError):
    """A golden data gate failed. The data is wrong — do not weaken the gate."""


@dataclass(frozen=True, slots=True)
class Reference:
    """The pinned expectations, loaded from `fixtures/tanzil_reference.json`."""

    payload_sha256: str
    surah_sha256: dict[int, str]
    word_counts: dict[int, list[int]]
    joined_units: dict[str, int]
    basmallah_surahs: tuple[int, ...]

    @classmethod
    def load(cls, path: Path = REFERENCE_FIXTURE_PATH) -> Reference:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if raw.get("reference_version") != 1:
            raise GoldenCheckError(f"unsupported reference_version in {path}")
        return cls(
            payload_sha256=raw["tanzil"]["payload_sha256"],
            surah_sha256={int(k): v for k, v in raw["tanzil"]["surah_sha256"].items()},
            word_counts={int(k): v for k, v in raw["word_counts"].items()},
            joined_units={k: int(v) for k, v in raw["joined_word_units"].items()},
            basmallah_surahs=tuple(raw["basmallah_prefixed_surahs"]),
        )

    def expected_word_count(self, surah: int, ayah: int) -> int:
        return self.word_counts[surah][ayah - 1]


def surah_digest(corpus: Corpus, surah: int) -> str:
    """SHA-256 over the `surah|ayah|text` lines of one surah, as shipped."""
    digest = hashlib.sha256()
    for verse in corpus.verses:
        if verse.surah == surah:
            digest.update(f"{verse.surah}|{verse.ayah}|{verse.text_uthmani}\n".encode())
    return digest.hexdigest()


def check_reference_checksums(corpus: Corpus, reference: Reference | None = None) -> None:
    reference = reference or Reference.load()

    actual = sha256_hex(corpus.reference_payload)
    if actual != reference.payload_sha256:
        raise GoldenCheckError(
            "Tanzil reference text does not match the pinned checksum.\n"
            f"  expected sha256:{reference.payload_sha256}\n"
            f"  actual   sha256:{actual}\n"
            "The canonical text changed. Verify the upstream release before touching "
            "the fixture (rule R8)."
        )

    mismatched = [
        surah
        for surah in range(1, SURAH_COUNT + 1)
        if surah_digest(corpus, surah) != reference.surah_sha256[surah]
    ]
    if mismatched:
        raise GoldenCheckError(
            f"surah text digests differ from the pinned reference for surah(s) {mismatched}"
        )


def check_word_counts(corpus: Corpus, reference: Reference | None = None) -> None:
    reference = reference or Reference.load()

    actual: dict[tuple[int, int], int] = {}
    for word in corpus.words:
        actual[(word.surah, word.ayah)] = actual.get((word.surah, word.ayah), 0) + 1

    if len(actual) != TOTAL_AYAHS:
        raise GoldenCheckError(f"words cover {len(actual)} ayat, expected {TOTAL_AYAHS}")

    problems: list[str] = []
    for surah, ayah_count in SURAH_AYAH_COUNTS.items():
        if len(reference.word_counts[surah]) != ayah_count:
            raise GoldenCheckError(
                f"reference has {len(reference.word_counts[surah])} word counts for surah "
                f"{surah}, which has {ayah_count} ayat"
            )
        for ayah in range(1, ayah_count + 1):
            expected = reference.expected_word_count(surah, ayah)
            found = actual.get((surah, ayah), 0)
            if found != expected:
                problems.append(f"{surah}:{ayah} has {found} words, expected {expected}")
    if problems:
        raise GoldenCheckError(
            f"{len(problems)} ayah(s) have unexpected word counts: " + "; ".join(problems[:10])
        )

    # `verse.word_count` is what the API reports; it must equal the rows present.
    for verse in corpus.verses:
        found = actual.get((verse.surah, verse.ayah), 0)
        if verse.word_count != found:
            raise GoldenCheckError(
                f"verse {verse.surah}:{verse.ayah} declares word_count={verse.word_count} "
                f"but {found} word rows exist"
            )

    _check_cross_source_word_counts(corpus, reference, actual)


def _check_cross_source_word_counts(
    corpus: Corpus, reference: Reference, actual: dict[tuple[int, int], int]
) -> None:
    """Reconcile QPC word counts with an independent split of the Tanzil text."""
    tanzil_counts: dict[tuple[int, int], int] = {}
    for line in corpus.reference_payload.decode("utf-8").splitlines():
        surah_raw, ayah_raw, text = line.split("|", 2)
        tanzil_counts[(int(surah_raw), int(ayah_raw))] = len(text.split())

    basmallah_surahs = set(reference.basmallah_surahs)
    expected_basmallah = set(range(1, SURAH_COUNT + 1)) - SURAHS_WITHOUT_STANDALONE_BASMALLAH
    if basmallah_surahs != expected_basmallah:
        raise GoldenCheckError(
            "the fixture's basmallah-prefixed surah list disagrees with the muṣḥaf: "
            f"{sorted(basmallah_surahs ^ expected_basmallah)}"
        )

    unexplained: list[str] = []
    for (surah, ayah), qpc in actual.items():
        tanzil = tanzil_counts[(surah, ayah)]
        allowance = BASMALLAH_WORD_COUNT if (ayah == 1 and surah in basmallah_surahs) else 0
        allowance += reference.joined_units.get(f"{surah}:{ayah}", 0)
        if tanzil - allowance != qpc:
            unexplained.append(
                f"{surah}:{ayah}: Tanzil splits into {tanzil}, QPC into {qpc}, "
                f"documented allowance {allowance}"
            )
    if unexplained:
        raise GoldenCheckError(
            f"{len(unexplained)} ayah(s) diverge between Tanzil and QPC word splitting beyond "
            "the documented allowances: "
            + "; ".join(unexplained[:10])
            + ". Investigate before recording a new allowance (rule R8)."
        )


def check_layout(corpus: Corpus) -> None:
    lines_on_page: dict[int, int] = {}
    types: dict[str, int] = {}
    for line in corpus.page_lines:
        lines_on_page[line.page] = lines_on_page.get(line.page, 0) + 1
        types[line.line_type] = types.get(line.line_type, 0) + 1

    wrong = {
        page: lines_on_page.get(page, 0)
        for page in range(1, MADANI_604_PAGE_COUNT + 1)
        if lines_on_page.get(page, 0) != madani_604_lines_on_page(page)
    }
    if wrong:
        detail = "; ".join(
            f"page {page} has {count}, expected {madani_604_lines_on_page(page)}"
            for page, count in sorted(wrong.items())[:10]
        )
        raise GoldenCheckError(f"{len(wrong)} page(s) have the wrong line count: {detail}")

    expected_names = SURAH_COUNT
    expected_basmallahs = SURAH_COUNT - len(SURAHS_WITHOUT_STANDALONE_BASMALLAH)
    if types.get(LINE_TYPE_SURAH_NAME, 0) != expected_names:
        raise GoldenCheckError(
            f"{types.get(LINE_TYPE_SURAH_NAME, 0)} surah-name lines, expected {expected_names}"
        )
    if types.get(LINE_TYPE_BASMALLAH, 0) != expected_basmallahs:
        raise GoldenCheckError(
            f"{types.get(LINE_TYPE_BASMALLAH, 0)} basmallah lines, expected {expected_basmallahs}"
        )

    ayah_lines = types.get(LINE_TYPE_AYAH, 0)
    total = sum(madani_604_lines_on_page(p) for p in range(1, MADANI_604_PAGE_COUNT + 1))
    if ayah_lines + expected_names + expected_basmallahs != total:
        raise GoldenCheckError(
            f"line types sum to {ayah_lines + expected_names + expected_basmallahs}, "
            f"expected {total}"
        )

    placed = {(p.surah, p.ayah, p.word_position) for p in corpus.placements}
    if len(placed) != len(corpus.placements):
        raise GoldenCheckError("a word is placed on more than one line")
    words = {(w.surah, w.ayah, w.word_position) for w in corpus.words}
    if placed != words:
        missing = sorted(words - placed)[:5]
        extra = sorted(placed - words)[:5]
        raise GoldenCheckError(
            f"placement set differs from the word set: {len(words - placed)} unplaced "
            f"(e.g. {missing}), {len(placed - words)} orphaned (e.g. {extra})"
        )

    for line in corpus.page_lines:
        if line.line_type != LINE_TYPE_AYAH and line.word_count:
            raise GoldenCheckError(
                f"{line.line_type} line at page {line.page} line {line.line_number} carries words"
            )


def run_all(corpus: Corpus, reference: Reference | None = None) -> None:
    reference = reference or Reference.load()
    check_reference_checksums(corpus, reference)
    check_word_counts(corpus, reference)
    check_layout(corpus)


def build_reference(corpus: Corpus) -> dict[str, Any]:
    """Regenerate the fixture. Only ever run deliberately, and review the diff:
    this is the expectation the gates are measured against."""
    tanzil_counts: dict[tuple[int, int], int] = {}
    for line in corpus.reference_payload.decode("utf-8").splitlines():
        surah_raw, ayah_raw, text = line.split("|", 2)
        tanzil_counts[(int(surah_raw), int(ayah_raw))] = len(text.split())

    qpc_counts: dict[tuple[int, int], int] = {}
    for word in corpus.words:
        qpc_counts[(word.surah, word.ayah)] = qpc_counts.get((word.surah, word.ayah), 0) + 1

    basmallah_surahs = sorted(set(range(1, SURAH_COUNT + 1)) - SURAHS_WITHOUT_STANDALONE_BASMALLAH)
    joined: dict[str, int] = {}
    for (surah, ayah), qpc in sorted(qpc_counts.items()):
        allowance = BASMALLAH_WORD_COUNT if (ayah == 1 and surah in basmallah_surahs) else 0
        difference = tanzil_counts[(surah, ayah)] - allowance - qpc
        if difference:
            joined[f"{surah}:{ayah}"] = difference

    return {
        "reference_version": 1,
        "tanzil": {
            "dataset": "text:tanzil-uthmani-1.1",
            "payload_sha256": sha256_hex(corpus.reference_payload),
            "surah_sha256": {
                str(surah): surah_digest(corpus, surah) for surah in range(1, SURAH_COUNT + 1)
            },
        },
        "basmallah_prefixed_surahs": basmallah_surahs,
        "joined_word_units": joined,
        "word_counts": {
            str(surah): [qpc_counts[(surah, ayah)] for ayah in range(1, count + 1)]
            for surah, count in sorted(SURAH_AYAH_COUNTS.items())
        },
    }
