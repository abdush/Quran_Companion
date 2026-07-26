"""Shared fixtures.

The golden gates measure the *real* corpus, so they need the upstream cache.
Building it once per session (`pack-builder fetch` populates it; the fixture
falls back to fetching) keeps the suite honest without re-downloading 604 pages
per test. If the corpus cannot be obtained the golden tests **fail** — they are
never skipped, because a gate that silently disappears is a gate that is not
protecting anything (rule R8).
"""

from __future__ import annotations

import pytest

from pack_builder import normalize
from pack_builder.corpus import Corpus
from pack_builder.golden import Reference


@pytest.fixture(scope="session")
def corpus() -> Corpus:
    try:
        return normalize.build_corpus()
    except Exception as exc:  # noqa: BLE001 - surfaced as an explicit failure
        pytest.fail(
            f"could not build the corpus, so the golden gates cannot run: {exc}\n"
            "Populate the upstream cache with `uv run pack-builder fetch`."
        )


@pytest.fixture(scope="session")
def reference() -> Reference:
    return Reference.load()
