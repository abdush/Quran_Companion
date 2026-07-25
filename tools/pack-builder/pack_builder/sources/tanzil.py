"""Tanzil `quran-uthmani` — the checksummed canonical text reference (§6.2).

Tanzil's terms forbid modifying the text, so the parser is deliberately
verbatim: it strips only the comment banner and blank lines the distribution
format adds, and never normalises, re-orders, or re-splits anything.

The raw download embeds the current year in its copyright banner, so its file
digest is *not* stable over time. The golden checksum is taken over the
canonical serialisation produced by :func:`canonical_payload` instead — the
verbatim ayah lines and nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from qc_shared.quran.keys import VerseKey
from qc_shared.quran.metadata import SURAH_AYAH_COUNTS, TOTAL_AYAHS

from pack_builder.config import ITEM_SOURCES, ITEM_TANZIL_TEXT, TANZIL_URL
from pack_builder.http import cached_fetch

CACHE_NAME = "tanzil-quran-uthmani.txt"


class TanzilParseError(RuntimeError):
    """The Tanzil distribution did not have the expected shape."""


@dataclass(frozen=True, slots=True)
class TanzilVerse:
    surah: int
    ayah: int
    text: str


def fetch(*, refresh: bool = False) -> Path:
    return cached_fetch(TANZIL_URL, CACHE_NAME, refresh=refresh)


def parse(path: Path) -> list[TanzilVerse]:
    """Parse `surah|ayah|text` lines into ayah order, validating the corpus shape."""
    verses: list[TanzilVerse] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|", 2)
        if len(parts) != 3:
            raise TanzilParseError(f"{path}:{lineno}: expected 'surah|ayah|text', got {raw!r}")
        surah_raw, ayah_raw, text = parts
        try:
            key = VerseKey(int(surah_raw), int(ayah_raw))
        except ValueError as exc:
            raise TanzilParseError(f"{path}:{lineno}: {exc}") from exc
        if not text:
            raise TanzilParseError(f"{path}:{lineno}: empty text for {key}")
        verses.append(TanzilVerse(key.surah, key.ayah, text))

    if len(verses) != TOTAL_AYAHS:
        raise TanzilParseError(f"expected {TOTAL_AYAHS} ayat, parsed {len(verses)}")

    expected = [
        (surah, ayah)
        for surah in sorted(SURAH_AYAH_COUNTS)
        for ayah in range(1, SURAH_AYAH_COUNTS[surah] + 1)
    ]
    actual = [(verse.surah, verse.ayah) for verse in verses]
    if actual != expected:
        first_divergence = next(
            index for index, pair in enumerate(actual) if index >= len(expected) or pair != expected[index]
        )
        raise TanzilParseError(
            "ayah ordering diverges from the Ḥafṣ division at position "
            f"{first_divergence}: got {actual[first_divergence]}, "
            f"expected {expected[first_divergence]}"
        )
    return verses


def canonical_payload(verses: list[TanzilVerse]) -> bytes:
    """Stable `surah|ayah|text` serialisation — the checksummed pack payload."""
    return "".join(f"{v.surah}|{v.ayah}|{v.text}\n" for v in verses).encode("utf-8")


PAYLOAD_FILENAME = ITEM_SOURCES[ITEM_TANZIL_TEXT].payload_filename
