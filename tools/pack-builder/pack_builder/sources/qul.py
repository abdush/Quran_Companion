"""QUL-curated word data via the Quran Foundation API (§6.2).

One request per muṣḥaf page gives, in a single pass, all three word-level
datasets this pack needs:

* ``text:qpc-hafs``    — `text_uthmani` per word (QPC Ḥafṣ script)
* ``layout:…-604``     — `page_number` + `line_number` per word (KFGQPC V1)
* ``wbw:en``           — `translation.text` + `transliteration.text` per word

Word positions follow the API's `position`, which is the space-split ordering
§6.1 designates as canonical. The API also emits the ayah-end marker (`٦`) as a
trailing pseudo-word with ``char_type_name == "end"``; it is a typographic
glyph, not a word of the text, so it is dropped from the word datasets while its
line placement is retained for layout purposes.

QUL's own bulk SQLite exports are behind a sign-in; this API is the
unauthenticated surface over the same curated data. See README for the
follow-up to switch once export credentials exist.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from qc_shared.quran.metadata import MADANI_604_PAGE_COUNT

from pack_builder.config import HTTP_CONCURRENCY, QUL_API_BASE
from pack_builder.http import cached_fetch

_WORD_FIELDS = "text_uthmani,line_number,page_number,location,char_type_name"
_QUERY = (
    f"words=true&word_fields={_WORD_FIELDS}&fields=text_uthmani"
    "&word_translation_language=en&per_page=50"
)

END_MARKER = "end"


class QulParseError(RuntimeError):
    """A page response did not have the expected shape."""


@dataclass(frozen=True, slots=True)
class QulWord:
    surah: int
    ayah: int
    word_position: int
    text_uthmani: str
    page: int
    line_number: int
    is_end_marker: bool
    gloss: str | None
    transliteration: str | None


def page_url(page: int) -> str:
    return f"{QUL_API_BASE}/verses/by_page/{page}?{_QUERY}"


def cache_name(page: int) -> str:
    return f"qul-page-{page:03d}.json"


def fetch_page(page: int, *, refresh: bool = False) -> Path:
    return cached_fetch(page_url(page), cache_name(page), refresh=refresh)


def fetch_all(*, refresh: bool = False, pages: int = MADANI_604_PAGE_COUNT) -> list[Path]:
    """Fetch every page, concurrently; already-cached pages are not re-requested."""
    with ThreadPoolExecutor(max_workers=HTTP_CONCURRENCY) as pool:
        return list(pool.map(lambda p: fetch_page(p, refresh=refresh), range(1, pages + 1)))


def _parse_location(location: str) -> tuple[int, int, int]:
    try:
        surah, ayah, position = (int(part) for part in location.split(":"))
    except ValueError as exc:
        raise QulParseError(f"unparsable word location {location!r}") from exc
    return surah, ayah, position


def parse_response(path: Path) -> list[QulWord]:
    """Parse one `by_page` response.

    The endpoint returns whole *verses* whose page is N, and a verse that
    straddles a page break carries words typeset on N-1 or N+1. So a word's page
    is taken from the word itself, never from the request — the caller
    reassembles pages from all responses (see :func:`load_all_words`).
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "verses" not in payload:
        raise QulParseError(f"{path}: no 'verses' key")

    words: list[QulWord] = []
    for verse in payload["verses"]:
        for raw in verse["words"]:
            surah, ayah, position = _parse_location(raw["location"])
            word_page = raw.get("page_number")
            line_number = raw.get("line_number")
            if word_page is None or line_number is None:
                raise QulParseError(f"{path}: word {raw['location']} has no page/line placement")
            text = raw.get("text_uthmani") or raw.get("text") or ""
            if not text:
                raise QulParseError(f"{path}: word {raw['location']} has no text")
            words.append(
                QulWord(
                    surah=surah,
                    ayah=ayah,
                    word_position=position,
                    text_uthmani=text,
                    page=int(word_page),
                    line_number=int(line_number),
                    is_end_marker=raw.get("char_type_name") == END_MARKER,
                    gloss=(raw.get("translation") or {}).get("text"),
                    transliteration=(raw.get("transliteration") or {}).get("text"),
                )
            )
    if not words:
        raise QulParseError(f"{path}: response yielded no words")
    return words


def load_all_words(*, pages: int = MADANI_604_PAGE_COUNT) -> list[QulWord]:
    """Every word of the muṣḥaf exactly once, in canonical key order.

    Each verse is returned by exactly one `by_page` response, but its words may
    land on either side of a page break; deduplicating by word key and sorting
    by key gives a placement table that is complete and order-independent.
    """
    by_key: dict[tuple[int, int, int], QulWord] = {}
    for page in range(1, pages + 1):
        for word in parse_response(fetch_page(page)):
            key = (word.surah, word.ayah, word.word_position)
            existing = by_key.get(key)
            if existing is not None and existing != word:
                raise QulParseError(
                    f"conflicting placements for word {word.surah}:{word.ayah}:"
                    f"{word.word_position}: {existing} vs {word}"
                )
            by_key[key] = word
    if not by_key:
        raise QulParseError("no words loaded; run `pack-builder fetch` first")
    return [by_key[key] for key in sorted(by_key)]


def iter_all_words(*, pages: int = MADANI_604_PAGE_COUNT) -> Iterator[QulWord]:
    yield from load_all_words(pages=pages)
