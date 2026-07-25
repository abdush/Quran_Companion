"""QDS domain service: resolve canonical keys into contract-shaped responses.

Caching (§6.5): reference data is immutable between imports, so a response is a
pure function of `(request, dataset version)`. The cache stores the serialised
body under a key that includes the dataset version, which means an import
invalidates every affected entry without an explicit purge — a stale entry
simply becomes unreachable.

The ETag is a strong validator over the response body, so `If-None-Match`
revalidation is exact rather than heuristic.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from qc_shared.quran.keys import InvalidKeyError, PageRef, VerseKey
from qc_shared.quran.metadata import MADANI_604_MUSHAF_ID
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core import cache as cache_module
from app.core.config import settings
from app.core.problems import bad_request, not_found
from app.qds import repository
from app.qds.schemas import Page, PageLine, Verse, VerseField, Word

#: Dataset items a verse response can draw on, in checksum order.
_VERSE_ITEMS = ("text:tanzil-uthmani-1.1", "text:qpc-hafs", "wbw:en")
_PAGE_ITEMS = ("layout:qpc-hafs-madani-604", "text:qpc-hafs")

DEFAULT_GLOSS_LANGUAGE = "en"


@dataclass(frozen=True, slots=True)
class Representation:
    """A cacheable response body plus its validators."""

    body: bytes
    etag: str
    dataset_version: str

    def json(self) -> dict:
        return json.loads(self.body)


def _canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _etag(body: bytes) -> str:
    return '"' + hashlib.sha256(body).hexdigest()[:32] + '"'


def dataset_version(checksums: dict[str, str], items: tuple[str, ...]) -> str:
    """A short, stable id for the exact data a response was built from."""
    present = [f"{item}@{checksums[item]}" for item in items if item in checksums]
    if not present:
        raise not_found("no QDS dataset is loaded; run the pack-builder import")
    return hashlib.sha256(",".join(present).encode()).hexdigest()[:16]


def parse_fields(raw: str | None) -> set[VerseField]:
    """`fields=text,words` → validated projection; unknown values are a 400."""
    if raw is None or not raw.strip():
        return {VerseField.TEXT}
    selected: set[VerseField] = set()
    for part in raw.split(","):
        name = part.strip()
        if not name:
            continue
        try:
            selected.add(VerseField(name))
        except ValueError:
            allowed = ", ".join(field.value for field in VerseField)
            raise bad_request(f"unknown field {name!r}; allowed: {allowed}") from None
    return selected or {VerseField.TEXT}


def parse_verse_key(raw: str) -> VerseKey:
    try:
        return VerseKey.parse(raw)
    except InvalidKeyError as exc:
        raise bad_request(str(exc)) from None


async def _cached(
    key: str, build, ttl: int | None = None
) -> Representation:
    store = cache_module.cache()
    hit = await store.get(key)
    if hit is not None:
        return Representation(hit, _etag(hit), json.loads(hit)["dataset_version"])
    representation = await build()
    await store.set(key, representation.body, ttl or settings().qds_cache_ttl_seconds)
    return representation


async def get_verse(
    connection: AsyncConnection,
    raw_verse_key: str,
    fields: set[VerseField],
    translation_ids: str | None = None,
) -> Representation:
    verse_key = parse_verse_key(raw_verse_key)
    checksums = await repository.dataset_checksums(connection)
    version = dataset_version(checksums, _VERSE_ITEMS)
    projection = ",".join(sorted(field.value for field in fields))

    cache_key = cache_module.key("verse", version, str(verse_key), projection, translation_ids or "")

    async def build() -> Representation:
        row = await repository.get_verse(connection, verse_key.surah, verse_key.ayah)
        if row is None:
            raise not_found(f"no verse at {verse_key}")

        payload: dict = {
            "verse_key": str(verse_key),
            "surah": row.surah,
            "ayah": row.ayah,
            "dataset_version": version,
        }
        if VerseField.TEXT in fields:
            payload["text"] = row.text_uthmani
        if VerseField.WORDS in fields:
            words = await repository.get_words(
                connection, verse_key.surah, verse_key.ayah, DEFAULT_GLOSS_LANGUAGE
            )
            payload["words"] = [
                Word(
                    word_key=f"{w.surah}:{w.ayah}:{w.word_position}",
                    surah=w.surah,
                    ayah=w.ayah,
                    word_position=w.word_position,
                    text=w.text_uthmani,
                    transliteration=w.transliteration,
                    gloss=w.gloss,
                    morphology_ref=w.morphology_ref,
                ).model_dump(exclude_none=True)
                for w in words
            ]
        if VerseField.TRANSLATIONS in fields:
            # Translation bodies are a later phase; the field is contract-valid
            # and empty rather than absent, so clients can distinguish
            # "requested, none available" from "not requested".
            payload["translations"] = []

        Verse.model_validate(payload)
        body = _canonical(payload)
        return Representation(body, _etag(body), version)

    return await _cached(cache_key, build)


async def get_page(connection: AsyncConnection, mushaf_id: str, page: int) -> Representation:
    try:
        reference = PageRef(mushaf_id, page)
    except InvalidKeyError as exc:
        raise bad_request(str(exc)) from None

    checksums = await repository.dataset_checksums(connection)
    version = dataset_version(checksums, _PAGE_ITEMS)
    cache_key = cache_module.key("page", version, reference.mushaf_id, reference.page)

    async def build() -> Representation:
        if not await repository.mushaf_exists(connection, reference.mushaf_id):
            known = MADANI_604_MUSHAF_ID
            raise not_found(f"unknown mushaf {reference.mushaf_id!r}; this pack ships {known!r}")
        lines = await repository.get_page_lines(connection, reference.mushaf_id, reference.page)
        if not lines:
            raise not_found(f"no layout for page {reference.page} of {reference.mushaf_id}")

        payload = {
            "mushaf_id": reference.mushaf_id,
            "page": reference.page,
            "dataset_version": version,
            "lines": [
                PageLine(
                    line_number=line.line_number,
                    line_type=line.line_type,
                    words=list(line.word_keys),
                ).model_dump()
                for line in lines
            ],
        }
        Page.model_validate(payload)
        body = _canonical(payload)
        return Representation(body, _etag(body), version)

    return await _cached(cache_key, build)
