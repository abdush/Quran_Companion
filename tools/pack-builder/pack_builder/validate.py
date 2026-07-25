"""Schema and licensing validation — the gates a build must clear (R1, §6.4).

Everything the pipeline emits is checked against the contracts seeded in task
0.2 before it reaches a database or an artifact:

* pack manifests against ``schemas/packs/manifest.schema.json``;
* the API-shaped projections the loader will have to serve (``verse``, ``word``,
  ``page``) against the component schemas in ``schemas/openapi/qds.yaml``, so a
  corpus that cannot be rendered as a valid API response never gets loaded;
* every dataset item against ``schemas/licenses.json`` (NFR-9).
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from qc_shared.licensing import LicenseRegistry
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from pack_builder.config import (
    ITEM_LAYOUT,
    ITEM_QPC_TEXT,
    ITEM_TANZIL_TEXT,
    ITEM_WBW,
    LICENSES_PATH,
    MUSHAF_ID,
    PACK_MANIFEST_SCHEMA_PATH,
    QDS_OPENAPI_PATH,
    WBW_LANGUAGE,
)
from pack_builder.corpus import Corpus

_OPENAPI_URI = "https://schemas.quran-companion.dev/openapi/qds.yaml"


class SchemaValidationError(RuntimeError):
    """Emitted data does not satisfy a contract in `schemas/`."""


@lru_cache(maxsize=1)
def _openapi_document() -> dict[str, Any]:
    return yaml.safe_load(QDS_OPENAPI_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=8)
def openapi_validator(schema_name: str) -> Draft202012Validator:
    """A validator for one `components.schemas` entry, with `$ref`s resolved."""
    document = _openapi_document()
    if schema_name not in document["components"]["schemas"]:
        raise SchemaValidationError(f"{QDS_OPENAPI_PATH} has no schema {schema_name!r}")
    # OpenAPI 3.1 component schemas are JSON Schema 2020-12, but the document
    # itself carries no `$schema`, so the dialect has to be stated explicitly.
    registry = Registry().with_resource(
        _OPENAPI_URI, Resource(contents=document, specification=DRAFT202012)
    )
    schema = {"$ref": f"{_OPENAPI_URI}#/components/schemas/{schema_name}"}
    return Draft202012Validator(schema, registry=registry)


@lru_cache(maxsize=1)
def manifest_validator() -> Draft202012Validator:
    schema = json.loads(PACK_MANIFEST_SCHEMA_PATH.read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def _assert_valid(validator: Draft202012Validator, instance: Any, label: str) -> None:
    errors = sorted(validator.iter_errors(instance), key=lambda error: list(error.path))
    if errors:
        details = "; ".join(f"{'/'.join(str(p) for p in e.path) or '<root>'}: {e.message}" for e in errors[:5])
        raise SchemaValidationError(f"{label} failed schema validation: {details}")


def validate_manifest(manifest: dict[str, Any]) -> None:
    _assert_valid(manifest_validator(), manifest, "pack manifest")


def registry() -> LicenseRegistry:
    return LicenseRegistry.load(LICENSES_PATH)


def validate_licensing(items: Iterable[str], declarations: Iterable[dict[str, str]]) -> None:
    """The §6.4 hard gate: unregistered dataset → build fails."""
    items = list(items)
    known = registry()
    known.assert_registered(items)
    known.assert_declarations_match(declarations)


def verse_projection(corpus: Corpus, surah: int, ayah: int) -> dict[str, Any]:
    """The `verse` response the API will build from these rows — API-shaped, so
    it can be checked against the OpenAPI contract before anything is loaded."""
    verse = next(v for v in corpus.verses if v.surah == surah and v.ayah == ayah)
    glosses = {
        (g.surah, g.ayah, g.word_position): g.gloss
        for g in corpus.glosses
        if g.surah == surah and g.ayah == ayah
    }
    words = [
        {
            "word_key": f"{w.surah}:{w.ayah}:{w.word_position}",
            "surah": w.surah,
            "ayah": w.ayah,
            "word_position": w.word_position,
            "text": w.text_uthmani,
            **({"transliteration": w.transliteration} if w.transliteration else {}),
            **(
                {"gloss": glosses[(w.surah, w.ayah, w.word_position)]}
                if (w.surah, w.ayah, w.word_position) in glosses
                else {}
            ),
        }
        for w in corpus.words
        if w.surah == surah and w.ayah == ayah
    ]
    return {
        "verse_key": f"{surah}:{ayah}",
        "surah": surah,
        "ayah": ayah,
        "dataset_version": "validation",
        "text": verse.text_uthmani,
        "words": words,
    }


def page_projection(corpus: Corpus, page: int) -> dict[str, Any]:
    """The `page` response the API will build from these rows."""
    by_line: dict[int, list[Any]] = {}
    for placement in corpus.placements:
        if placement.page == page:
            by_line.setdefault(placement.line_number, []).append(placement)
    lines = []
    for line in corpus.page_lines:
        if line.page != page:
            continue
        members = sorted(by_line.get(line.line_number, ()), key=lambda p: p.line_ordinal)
        lines.append(
            {
                "line_number": line.line_number,
                "line_type": line.line_type,
                "words": [f"{p.surah}:{p.ayah}:{p.word_position}" for p in members],
            }
        )
    return {
        "mushaf_id": corpus.mushaf_id,
        "page": page,
        "dataset_version": "validation",
        "lines": lines,
    }


#: Verses and pages exercised before every load: the opening, the longest ayah's
#: surah, a page with a mid-page surah start, and both ends of the muṣḥaf.
SAMPLE_VERSES: tuple[tuple[int, int], ...] = ((1, 1), (2, 255), (9, 1), (114, 6))
SAMPLE_PAGES: tuple[int, ...] = (1, 2, 187, 208, 604)


def validate_corpus_against_openapi(corpus: Corpus) -> None:
    """Check API-shaped projections of the corpus against `schemas/openapi/qds.yaml`."""
    verse_check = openapi_validator("verse")
    page_check = openapi_validator("page")
    for surah, ayah in SAMPLE_VERSES:
        _assert_valid(verse_check, verse_projection(corpus, surah, ayah), f"verse {surah}:{ayah}")
    for page in SAMPLE_PAGES:
        _assert_valid(page_check, page_projection(corpus, page), f"page {page}")


def corpus_items(corpus: Corpus) -> tuple[str, ...]:
    """Dataset item ids this corpus is composed of, in manifest order."""
    if corpus.mushaf_id != MUSHAF_ID or corpus.gloss_language != WBW_LANGUAGE:
        raise SchemaValidationError(
            f"corpus describes {corpus.mushaf_id}/{corpus.gloss_language}, "
            f"expected {MUSHAF_ID}/{WBW_LANGUAGE}"
        )
    return (ITEM_TANZIL_TEXT, ITEM_QPC_TEXT, ITEM_LAYOUT, ITEM_WBW)


def licenses_path() -> Path:
    return LICENSES_PATH
