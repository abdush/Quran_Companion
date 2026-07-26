"""The normalised corpus: what the pipeline produces, checksums, and loads.

Each dataset item serialises to exactly one payload file, and the SHA-256 of
that file *is* the checksum recorded in the pack manifest and in `qds.dataset`.
One serialisation, one digest, used by the packer, the loader and the golden
tests — so a pack can never claim a checksum the tables were not built from.

Serialisations are line-oriented, LF-terminated, UTF-8, and sorted in canonical
key order, which makes them stable and diffable.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def checksum(payload: bytes) -> str:
    """`sha256:<hex>`, the form the pack manifest schema requires."""
    return f"sha256:{sha256_hex(payload)}"


@dataclass(frozen=True, slots=True)
class VerseRow:
    surah: int
    ayah: int
    text_uthmani: str
    word_count: int


@dataclass(frozen=True, slots=True)
class WordRow:
    surah: int
    ayah: int
    word_position: int
    text_uthmani: str
    transliteration: str | None


@dataclass(frozen=True, slots=True)
class GlossRow:
    surah: int
    ayah: int
    word_position: int
    language: str
    gloss: str


@dataclass(frozen=True, slots=True)
class PlacementRow:
    surah: int
    ayah: int
    word_position: int
    page: int
    line_number: int
    line_ordinal: int


@dataclass(frozen=True, slots=True)
class PageLineRow:
    page: int
    line_number: int
    line_type: str
    surah: int | None
    word_count: int


@dataclass(slots=True)
class Corpus:
    """Everything the `core-hafs` pack ships, already validated and ordered."""

    verses: list[VerseRow] = field(default_factory=list)
    words: list[WordRow] = field(default_factory=list)
    glosses: list[GlossRow] = field(default_factory=list)
    placements: list[PlacementRow] = field(default_factory=list)
    page_lines: list[PageLineRow] = field(default_factory=list)
    mushaf_id: str = ""
    gloss_language: str = ""

    #: Verbatim Tanzil ayah lines, exactly as distributed — the checksummed
    #: reference and the pack payload for `text:tanzil-uthmani-1.1`. Kept
    #: separate from `verses`, whose text has the standalone basmallah removed
    #: so that ayah text and QPC word positions describe the same content.
    #: Tanzil's terms permit verbatim redistribution only, so this is what ships.
    reference_payload: bytes = b""


def _escape(value: str | None) -> str:
    """TSV-safe: payload text never contains tabs or newlines, but be explicit."""
    if value is None:
        return ""
    return value.replace("\t", " ").replace("\n", " ")


def serialise_verses(verses: list[VerseRow]) -> bytes:
    """`surah|ayah|text` — byte-identical to the Tanzil distribution's ayah lines."""
    return "".join(f"{v.surah}|{v.ayah}|{v.text_uthmani}\n" for v in verses).encode("utf-8")


def serialise_words(words: list[WordRow]) -> bytes:
    """`word_key<TAB>text<TAB>transliteration`."""
    return "".join(
        f"{w.surah}:{w.ayah}:{w.word_position}\t{_escape(w.text_uthmani)}"
        f"\t{_escape(w.transliteration)}\n"
        for w in words
    ).encode("utf-8")


def serialise_glosses(glosses: list[GlossRow]) -> bytes:
    """`word_key<TAB>language<TAB>gloss`."""
    return "".join(
        f"{g.surah}:{g.ayah}:{g.word_position}\t{g.language}\t{_escape(g.gloss)}\n"
        for g in glosses
    ).encode("utf-8")


def serialise_layout(page_lines: list[PageLineRow], placements: list[PlacementRow]) -> bytes:
    """The layout item: the line inventory, then the word→line placements.

    Both halves are needed to reconstruct a page: heading lines carry no words,
    so a placement-only serialisation would silently lose them.
    """
    by_line: dict[tuple[int, int], list[PlacementRow]] = {}
    for placement in placements:
        by_line.setdefault((placement.page, placement.line_number), []).append(placement)

    chunks: list[str] = []
    for line in page_lines:
        members = sorted(
            by_line.get((line.page, line.line_number), ()), key=lambda p: p.line_ordinal
        )
        keys = ",".join(f"{p.surah}:{p.ayah}:{p.word_position}" for p in members)
        surah = "" if line.surah is None else str(line.surah)
        chunks.append(f"{line.page}\t{line.line_number}\t{line.line_type}\t{surah}\t{keys}\n")
    return "".join(chunks).encode("utf-8")
