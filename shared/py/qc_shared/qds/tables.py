"""SQLAlchemy Core definition of the `qds` reference tables (handbook §7.2, §7.3).

Design notes
------------
* **Canonical addressing everywhere.** Rows are keyed by `(surah, ayah)` and
  `(surah, ayah, word_position)` — the contract from §6.1 / D-003. No surrogate
  ids, so any context can join by key without a lookup table.
* **`qds` is the only schema that may hold Quran text** (rule R2). Every other
  context references it by key.
* **Import-generated, read-only at runtime.** Nothing in the API writes here;
  `tools/pack-builder` truncates and reloads. `qds.dataset` records the
  provenance (source, version, checksum) of every item that was loaded, which is
  what the API's `dataset_version` / `ETag` is derived from.
* **Layout is a separate dimension from text.** Word keys are
  layout-independent; `qds.word_placement` maps a word key onto
  `(mushaf_id, page, line_number)` for one edition, and `qds.page_line` carries
  the full line inventory of a page — including the `surah_name` and
  `basmallah` lines that hold no words.
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP

QDS_SCHEMA = "qds"

#: Naming convention so Alembic autogenerate produces stable constraint names.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(schema=QDS_SCHEMA, naming_convention=NAMING_CONVENTION)


dataset = Table(
    "dataset",
    metadata,
    Column(
        "item",
        String(64),
        primary_key=True,
        doc="Dataset item id `kind:name[-version]`; must exist in schemas/licenses.json (§6.4).",
    ),
    Column("version", String(32), nullable=False, doc="Upstream dataset version."),
    Column("source_url", Text, nullable=False),
    Column(
        "checksum",
        String(71),
        nullable=False,
        doc="`sha256:<hex>` over the canonical serialisation of this item.",
    ),
    Column("pack_id", String(64), nullable=True, doc="Pack this import came from, if any."),
    Column("pack_version", String(16), nullable=True),
    Column("row_count", Integer, nullable=False, server_default="0"),
    Column("imported_at", TIMESTAMP(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("checksum LIKE 'sha256:%'", name="checksum_algorithm"),
    comment="Provenance of every imported qds dataset item (§6.4 licensing gate joins on `item`).",
)


mushaf = Table(
    "mushaf",
    metadata,
    Column("id", String(64), primary_key=True, doc="Layout+script edition id, e.g. qpc-hafs-madani-604."),
    Column("name", Text, nullable=False),
    Column("script", String(32), nullable=False),
    Column("page_count", SmallInteger, nullable=False),
    Column("lines_per_page", SmallInteger, nullable=False),
    Column("dataset_item", String(64), ForeignKey(dataset.c.item), nullable=False),
    CheckConstraint("page_count > 0", name="page_count_positive"),
    comment="One row per layout edition shipped by a data pack.",
)


verse = Table(
    "verse",
    metadata,
    Column("surah", SmallInteger, primary_key=True),
    Column("ayah", SmallInteger, primary_key=True),
    Column("text_uthmani", Text, nullable=False, doc="Verbatim Ḥafṣ Uthmani text (Tanzil reference)."),
    Column("word_count", SmallInteger, nullable=False, doc="Space-split word count; golden-tested."),
    Column("dataset_item", String(64), ForeignKey(dataset.c.item), nullable=False),
    CheckConstraint("surah BETWEEN 1 AND 114", name="surah_range"),
    CheckConstraint("ayah >= 1", name="ayah_positive"),
    CheckConstraint("word_count >= 1", name="word_count_positive"),
    comment="Canonical ayah text, addressed by (surah, ayah) per §6.1.",
)


word = Table(
    "word",
    metadata,
    Column("surah", SmallInteger, primary_key=True),
    Column("ayah", SmallInteger, primary_key=True),
    Column("word_position", SmallInteger, primary_key=True),
    Column("text_uthmani", Text, nullable=False, doc="Word text in the QPC Ḥafṣ script edition."),
    Column("transliteration", Text, nullable=True),
    Column("morphology_ref", String(32), nullable=True, doc="Opaque QAC location id; populated in a later phase."),
    Column("dataset_item", String(64), ForeignKey(dataset.c.item), nullable=False),
    ForeignKeyConstraint(
        ["surah", "ayah"],
        [verse.c.surah, verse.c.ayah],
        name="fk_word_verse",
    ),
    CheckConstraint("word_position >= 1", name="word_position_positive"),
    comment="Word-level text addressed by (surah, ayah, word_position) per §6.1.",
)


word_gloss = Table(
    "word_gloss",
    metadata,
    Column("surah", SmallInteger, primary_key=True),
    Column("ayah", SmallInteger, primary_key=True),
    Column("word_position", SmallInteger, primary_key=True),
    Column("language", String(16), primary_key=True, doc="BCP 47 tag of the word-by-word gloss."),
    Column("gloss", Text, nullable=False),
    Column("dataset_item", String(64), ForeignKey(dataset.c.item), nullable=False),
    ForeignKeyConstraint(
        ["surah", "ayah", "word_position"],
        [word.c.surah, word.c.ayah, word.c.word_position],
        name="fk_word_gloss_word",
    ),
    comment="Word-by-word gloss, one row per (word key, language). Packs ship one language at a time.",
)


page_line = Table(
    "page_line",
    metadata,
    Column("mushaf_id", String(64), ForeignKey(mushaf.c.id), primary_key=True),
    Column("page", SmallInteger, primary_key=True),
    Column("line_number", SmallInteger, primary_key=True),
    Column(
        "line_type",
        String(16),
        nullable=False,
        doc="ayah | surah_name | basmallah — matches the OpenAPI `page_line.line_type` enum.",
    ),
    Column(
        "surah",
        SmallInteger,
        nullable=True,
        doc="For surah_name/basmallah lines, the surah being opened; NULL on ayah lines.",
    ),
    Column("word_count", SmallInteger, nullable=False, server_default="0"),
    CheckConstraint(
        "line_type IN ('ayah', 'surah_name', 'basmallah')",
        name="line_type_enum",
    ),
    CheckConstraint("page >= 1", name="page_positive"),
    CheckConstraint("line_number >= 1", name="line_number_positive"),
    CheckConstraint(
        "(line_type = 'ayah') = (surah IS NULL)",
        name="surah_only_on_heading_lines",
    ),
    comment="Complete typeset line inventory of every page, including word-less heading lines.",
)


word_placement = Table(
    "word_placement",
    metadata,
    Column("mushaf_id", String(64), ForeignKey(mushaf.c.id), primary_key=True),
    Column("surah", SmallInteger, primary_key=True),
    Column("ayah", SmallInteger, primary_key=True),
    Column("word_position", SmallInteger, primary_key=True),
    Column("page", SmallInteger, nullable=False),
    Column("line_number", SmallInteger, nullable=False),
    Column("line_ordinal", SmallInteger, nullable=False, doc="1-based order within the line (RTL reading order)."),
    ForeignKeyConstraint(
        ["surah", "ayah", "word_position"],
        [word.c.surah, word.c.ayah, word.c.word_position],
        name="fk_word_placement_word",
    ),
    ForeignKeyConstraint(
        ["mushaf_id", "page", "line_number"],
        [page_line.c.mushaf_id, page_line.c.page, page_line.c.line_number],
        name="fk_word_placement_page_line",
    ),
    UniqueConstraint(
        "mushaf_id", "page", "line_number", "line_ordinal", name="uq_word_placement_line_slot"
    ),
    comment="The §6.1 word_key → (mushaf_id, page, line) mapping that ships in the data pack.",
)

Index(
    "ix_word_placement_page",
    word_placement.c.mushaf_id,
    word_placement.c.page,
    word_placement.c.line_number,
    word_placement.c.line_ordinal,
)


translation_resource = Table(
    "translation_resource",
    metadata,
    Column("id", String(64), primary_key=True, doc="Translation resource id, e.g. en-sahih."),
    Column("language", String(16), nullable=False, doc="BCP 47 language tag."),
    Column("name", Text, nullable=False),
    Column("translator", Text, nullable=True),
    Column("direction", String(3), nullable=False),
    Column("is_word_by_word", Boolean, nullable=False, server_default="false"),
    Column("dataset_item", String(64), ForeignKey(dataset.c.item), nullable=False),
    CheckConstraint("direction IN ('ltr', 'rtl')", name="direction_enum"),
    comment="Metadata for translation/gloss resources; translation bodies land in a later phase.",
)


#: Load order that satisfies the foreign keys (and the reverse for truncation).
LOAD_ORDER: tuple[Table, ...] = (
    dataset,
    mushaf,
    verse,
    word,
    word_gloss,
    page_line,
    word_placement,
    translation_resource,
)
