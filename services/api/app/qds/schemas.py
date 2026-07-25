"""Response models mirroring `schemas/openapi/qds.yaml` (rule R1 — schema first).

Field names, optionality and `additionalProperties: false` follow the contract
exactly; the contract test round-trips these models through the OpenAPI
component schemas so drift is caught rather than discovered by a client.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

VERSE_KEY_PATTERN = r"^(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4]):[1-9][0-9]{0,2}$"
WORD_KEY_PATTERN = r"^(?:[1-9]|[1-9][0-9]|10[0-9]|11[0-4]):[1-9][0-9]{0,2}:[1-9][0-9]{0,2}$"
MUSHAF_ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LineType(StrEnum):
    AYAH = "ayah"
    SURAH_NAME = "surah_name"
    BASMALLAH = "basmallah"


class Word(Strict):
    word_key: str = Field(pattern=WORD_KEY_PATTERN)
    surah: int = Field(ge=1, le=114)
    ayah: int = Field(ge=1)
    word_position: int = Field(ge=1)
    text: str | None = None
    transliteration: str | None = None
    gloss: str | None = None
    morphology_ref: str | None = None


class Translation(Strict):
    translation_id: str
    text: str
    language: str | None = None


class Verse(Strict):
    verse_key: str = Field(pattern=VERSE_KEY_PATTERN)
    surah: int = Field(ge=1, le=114)
    ayah: int = Field(ge=1)
    dataset_version: str
    text: str | None = None
    words: list[Word] | None = None
    translations: list[Translation] | None = None


class PageLine(Strict):
    line_number: int = Field(ge=1)
    line_type: LineType
    words: list[str] | None = None


class Page(Strict):
    mushaf_id: str = Field(pattern=MUSHAF_ID_PATTERN)
    page: int = Field(ge=1, le=604)
    dataset_version: str
    lines: list[PageLine] | None = None


class VerseField(StrEnum):
    """Values accepted by the `fields` query parameter."""

    TEXT = "text"
    WORDS = "words"
    TRANSLATIONS = "translations"
