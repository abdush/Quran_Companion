"""Build and verify `.qpack` artifacts (handbook §6.3).

A `.qpack` is a zip holding one payload file per dataset item plus
`manifest.json`. The manifest lists the contents, a SHA-256 per item, the
per-item license declarations copied verbatim from `schemas/licenses.json`, and
an Ed25519 signature over the canonical manifest bytes.

Packs are immutable: a rebuild that changes any payload must change `version`.
"""

from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pack_builder import corpus as corpus_mod
from pack_builder.config import (
    ITEM_LAYOUT,
    ITEM_QPC_TEXT,
    ITEM_SOURCES,
    ITEM_TANZIL_TEXT,
    ITEM_WBW,
    PACK_ID,
    PACK_VERSION,
    build_dir,
    dist_dir,
)
from pack_builder.corpus import Corpus
from pack_builder.signing import sign_manifest, verify_manifest
from pack_builder.validate import corpus_items, registry, validate_licensing, validate_manifest

MANIFEST_NAME = "manifest.json"
MANIFEST_VERSION = 1
PAYLOAD_DIR = "data"


class PackError(RuntimeError):
    """A pack could not be built, or failed verification."""


@dataclass(frozen=True, slots=True)
class Payload:
    item: str
    filename: str
    data: bytes

    @property
    def checksum(self) -> str:
        return corpus_mod.checksum(self.data)


def build_payloads(corpus: Corpus) -> list[Payload]:
    """Serialise the corpus into one checksummable file per dataset item."""
    return [
        # Verbatim Tanzil, not the basmallah-stripped `corpus.verses`: the
        # licence permits redistributing this text only unmodified.
        Payload(
            ITEM_TANZIL_TEXT,
            ITEM_SOURCES[ITEM_TANZIL_TEXT].payload_filename,
            corpus.reference_payload,
        ),
        Payload(
            ITEM_QPC_TEXT,
            ITEM_SOURCES[ITEM_QPC_TEXT].payload_filename,
            corpus_mod.serialise_words(corpus.words),
        ),
        Payload(
            ITEM_LAYOUT,
            ITEM_SOURCES[ITEM_LAYOUT].payload_filename,
            corpus_mod.serialise_layout(corpus.page_lines, corpus.placements),
        ),
        Payload(
            ITEM_WBW,
            ITEM_SOURCES[ITEM_WBW].payload_filename,
            corpus_mod.serialise_glosses(corpus.glosses),
        ),
    ]


def write_payloads(payloads: list[Payload], directory: Path | None = None) -> Path:
    target = directory or build_dir()
    target.mkdir(parents=True, exist_ok=True)
    for payload in payloads:
        (target / payload.filename).write_bytes(payload.data)
    (target / "checksums.json").write_text(
        json.dumps({p.item: p.checksum for p in payloads}, indent=2) + "\n", encoding="utf-8"
    )
    return target


def build_manifest(
    payloads: list[Payload], *, pack_id: str = PACK_ID, version: str = PACK_VERSION
) -> dict[str, Any]:
    """Assemble and sign the manifest, after the licensing gate has passed."""
    items = [payload.item for payload in payloads]
    declarations = registry().declarations_for(items)
    validate_licensing(items, declarations)

    manifest: dict[str, Any] = {
        "manifest_version": MANIFEST_VERSION,
        "pack_id": pack_id,
        "version": version,
        "contents": items,
        "checksums": {payload.item: payload.checksum for payload in payloads},
        "licenses": declarations,
    }
    manifest["signature"] = sign_manifest(manifest)
    validate_manifest(manifest)
    return manifest


def artifact_path(pack_id: str = PACK_ID, version: str = PACK_VERSION) -> Path:
    return dist_dir() / f"{pack_id}-{version}.qpack"


def write_pack(corpus: Corpus, *, pack_id: str = PACK_ID, version: str = PACK_VERSION) -> Path:
    validate_licensing(corpus_items(corpus), registry().declarations_for(corpus_items(corpus)))
    payloads = build_payloads(corpus)
    write_payloads(payloads)
    manifest = build_manifest(payloads, pack_id=pack_id, version=version)

    target = artifact_path(pack_id, version)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
        )
        for payload in payloads:
            archive.writestr(f"{PAYLOAD_DIR}/{payload.filename}", payload.data)
    return target


def read_manifest(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as archive:
        return json.loads(archive.read(MANIFEST_NAME))


def verify_pack(path: Path) -> dict[str, Any]:
    """Everything a client checks before trusting a pack (§6.3, NFR-1)."""
    if not path.is_file():
        raise PackError(f"no pack at {path}")
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read(MANIFEST_NAME))
        validate_manifest(manifest)
        verify_manifest(manifest)

        declared = set(manifest["contents"])
        checksummed = set(manifest["checksums"])
        if checksummed != declared:
            raise PackError(
                f"checksums do not cover contents: missing {sorted(declared - checksummed)}, "
                f"extra {sorted(checksummed - declared)}"
            )
        validate_licensing(manifest["contents"], manifest["licenses"])

        for item in manifest["contents"]:
            filename = ITEM_SOURCES[item].payload_filename
            data = archive.read(f"{PAYLOAD_DIR}/{filename}")
            actual = corpus_mod.checksum(data)
            if actual != manifest["checksums"][item]:
                raise PackError(
                    f"checksum mismatch for {item}: manifest says "
                    f"{manifest['checksums'][item]}, payload hashes to {actual}"
                )
    return manifest
