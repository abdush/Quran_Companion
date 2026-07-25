"""The `qds` reference schema — shared between its reader and its writer.

`qds.*` is import-generated and read-only at runtime (handbook §7.3): the API
reads it, `tools/pack-builder` rebuilds it. Both need the identical table
definition, so it lives here rather than being declared twice and drifting.
Alembic (in `services/api/migrations`) autogenerates against :data:`metadata`.
"""

from qc_shared.qds.tables import (
    QDS_SCHEMA,
    dataset,
    metadata,
    mushaf,
    page_line,
    translation_resource,
    verse,
    word,
    word_gloss,
    word_placement,
)

__all__ = [
    "QDS_SCHEMA",
    "dataset",
    "metadata",
    "mushaf",
    "page_line",
    "translation_resource",
    "verse",
    "word",
    "word_gloss",
    "word_placement",
]
