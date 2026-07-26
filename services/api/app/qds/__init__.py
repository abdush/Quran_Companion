"""`qds` — the Quran Data Service bounded context (handbook §6.5).

Serves canonical Quran reference data (text, layout, word-by-word) by the keys
of §6.1. Read-only: `qds.*` is rebuilt only by `tools/pack-builder`, and the
runtime opens read-only transactions against it.

Import `app.qds.api` from other contexts; everything else is internal.
"""
