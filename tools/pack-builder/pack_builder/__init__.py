"""`tools/pack-builder` — the QDS import pipeline and `.qpack` builder (§6.3, §6.5).

Stages, each independently runnable from :mod:`pack_builder.cli`:

``fetch``  → cache raw upstream downloads
``build``  → normalise into canonical, checksummed payload files
``load``   → truncate-and-reload the `qds.*` reference tables
``pack``   → assemble, checksum and sign the `.qpack`
``verify`` → re-check checksums, signature and the licensing gate
"""

__version__ = "0.1.0"
