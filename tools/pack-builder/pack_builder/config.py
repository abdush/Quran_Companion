"""Pipeline configuration: dataset identities, sources, and on-disk locations.

Every id in :data:`DATASET_ITEMS` must have a matching entry in
`schemas/licenses.json` — that is the §6.4 gate, checked by
:mod:`pack_builder.validate` before anything is built or loaded.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from qc_shared.quran.metadata import MADANI_604_MUSHAF_ID

PACK_ID = "core-hafs"
#: CalVer, per the `packs/manifest.schema.json` pattern `YYYY.0M.MICRO`.
PACK_VERSION = "2026.07.0"

MUSHAF_ID = MADANI_604_MUSHAF_ID
WBW_LANGUAGE = "en"

# --- dataset item ids (mirror schemas/licenses.json) -------------------------

ITEM_TANZIL_TEXT = "text:tanzil-uthmani-1.1"
ITEM_QPC_TEXT = "text:qpc-hafs"
ITEM_LAYOUT = f"layout:{MUSHAF_ID}"
ITEM_WBW = f"wbw:{WBW_LANGUAGE}"

#: Contents of the `core-hafs` pack, in manifest order (§6.3).
DATASET_ITEMS: tuple[str, ...] = (
    ITEM_TANZIL_TEXT,
    ITEM_QPC_TEXT,
    ITEM_LAYOUT,
    ITEM_WBW,
)

# --- upstream sources --------------------------------------------------------

TANZIL_URL = "https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true"
TANZIL_VERSION = "1.1"

#: Quran Foundation API — the unauthenticated surface over the QUL-curated QPC
#: Ḥafṣ word text, KFGQPC Madani 604 line/page placement and QuranWBW glosses
#: (§6.2). QUL's own bulk SQLite exports need an account; see README.
QUL_API_BASE = "https://api.quran.com/api/v4"
QUL_VERSION = "qf-api-v4"

USER_AGENT = "quran-companion-pack-builder/0.1 (+https://github.com/abdush/quran-companion)"
HTTP_TIMEOUT_SECONDS = 60
HTTP_RETRIES = 4
HTTP_CONCURRENCY = 8

# --- paths -------------------------------------------------------------------

TOOL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = TOOL_ROOT.parent.parent

SCHEMAS_DIR = REPO_ROOT / "schemas"
LICENSES_PATH = SCHEMAS_DIR / "licenses.json"
QDS_OPENAPI_PATH = SCHEMAS_DIR / "openapi" / "qds.yaml"
PACK_MANIFEST_SCHEMA_PATH = SCHEMAS_DIR / "packs" / "manifest.schema.json"

FIXTURES_DIR = TOOL_ROOT / "fixtures"
REFERENCE_FIXTURE_PATH = FIXTURES_DIR / "tanzil_reference.json"
PUBLIC_KEYS_DIR = TOOL_ROOT / "keys"


def cache_dir() -> Path:
    """Raw upstream downloads (gitignored). Override with `QPACK_CACHE_DIR`."""
    return Path(os.environ.get("QPACK_CACHE_DIR", TOOL_ROOT / ".cache"))


def build_dir() -> Path:
    """Normalised payload files, one per dataset item. Override with `QPACK_BUILD_DIR`."""
    return Path(os.environ.get("QPACK_BUILD_DIR", TOOL_ROOT / "build"))


def dist_dir() -> Path:
    """Signed `.qpack` artifacts. Override with `QPACK_DIST_DIR`."""
    return Path(os.environ.get("QPACK_DIST_DIR", TOOL_ROOT / "dist"))


def database_url() -> str:
    """Sync SQLAlchemy URL for the loader (the API uses the async driver)."""
    return os.environ.get(
        "QPACK_DATABASE_URL",
        "postgresql+psycopg://qc:qc-dev-password@localhost:5432/qc",
    )


@dataclass(frozen=True, slots=True)
class ItemSource:
    """Where a dataset item came from — recorded in `qds.dataset` and the pack."""

    item: str
    version: str
    source_url: str
    payload_filename: str


ITEM_SOURCES: dict[str, ItemSource] = {
    ITEM_TANZIL_TEXT: ItemSource(
        item=ITEM_TANZIL_TEXT,
        version=TANZIL_VERSION,
        source_url="https://tanzil.net/download/",
        payload_filename="text-tanzil-uthmani.txt",
    ),
    ITEM_QPC_TEXT: ItemSource(
        item=ITEM_QPC_TEXT,
        version=QUL_VERSION,
        source_url="https://qul.tarteel.ai/resources/quran-script",
        payload_filename="text-qpc-hafs.tsv",
    ),
    ITEM_LAYOUT: ItemSource(
        item=ITEM_LAYOUT,
        version=QUL_VERSION,
        source_url="https://qul.tarteel.ai/resources/mushaf-layout/15",
        payload_filename="layout-qpc-hafs-madani-604.tsv",
    ),
    ITEM_WBW: ItemSource(
        item=ITEM_WBW,
        version=QUL_VERSION,
        source_url="https://qul.tarteel.ai/resources/word-translation",
        payload_filename="wbw-en.tsv",
    ),
}
