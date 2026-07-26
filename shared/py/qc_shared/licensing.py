"""The licensing registry gate (handbook §6.4, NFR-9).

``schemas/licenses.json`` is the single registry of every third-party dataset,
its license, attribution string and usage constraints. Two rules follow from
§6.4, and both are enforced here rather than by convention:

1. **A pack may not reference an unregistered dataset.** Building or validating
   a ``.qpack`` whose ``contents``/``licenses`` mention an item absent from the
   registry raises :class:`UnregisteredDatasetError` — a hard failure, not a
   warning.
2. **Attribution must be exact.** A pack manifest's per-item ``license`` and
   ``attribution`` must equal the registry's, so the About screen and the pack
   can never disagree.

This module lives in ``shared/py`` so the same check runs from the pack-builder
CLI *and* from the API test suite; there is exactly one implementation to keep
honest (rule R8).
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

REGISTRY_ENV_VAR = "QC_LICENSES_PATH"
_REGISTRY_RELATIVE_PATH = Path("schemas") / "licenses.json"


class LicenseRegistryError(Exception):
    """Base class for licensing-gate failures."""


class UnregisteredDatasetError(LicenseRegistryError):
    """A dataset item is used but absent from ``schemas/licenses.json``."""


class AttributionMismatchError(LicenseRegistryError):
    """A declared license/attribution disagrees with the registry."""


@dataclass(frozen=True, slots=True)
class LicenseEntry:
    item: str
    name: str
    source_url: str
    license: str
    attribution: str
    added_at: str
    license_url: str | None = None
    usage_constraints: str | None = None

    @classmethod
    def from_json(cls, raw: dict[str, Any]) -> LicenseEntry:
        return cls(
            item=raw["item"],
            name=raw["name"],
            source_url=raw["source_url"],
            license=raw["license"],
            attribution=raw["attribution"],
            added_at=raw["added_at"],
            license_url=raw.get("license_url"),
            usage_constraints=raw.get("usage_constraints"),
        )

    def as_manifest_declaration(self) -> dict[str, str]:
        """The ``licenses[]`` entry a pack manifest must carry for this item."""
        return {"item": self.item, "license": self.license, "attribution": self.attribution}


def find_registry_path(start: Path | None = None) -> Path:
    """Locate ``schemas/licenses.json``.

    Honours ``QC_LICENSES_PATH`` (used by containers where the repo tree is not
    present), otherwise walks up from ``start`` looking for the repo root.
    """
    override = os.environ.get(REGISTRY_ENV_VAR)
    if override:
        return Path(override)

    here = (start or Path(__file__)).resolve()
    for candidate in (here, *here.parents):
        registry = candidate / _REGISTRY_RELATIVE_PATH
        if registry.is_file():
            return registry
    raise LicenseRegistryError(
        f"could not locate {_REGISTRY_RELATIVE_PATH} above {here}; "
        f"set {REGISTRY_ENV_VAR} to point at the registry"
    )


@lru_cache(maxsize=4)
def _load(path: Path) -> tuple[LicenseEntry, ...]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("registry_version") != 1:
        raise LicenseRegistryError(f"unsupported registry_version: {raw.get('registry_version')!r}")
    entries = tuple(LicenseEntry.from_json(entry) for entry in raw["entries"])
    seen: set[str] = set()
    for entry in entries:
        if entry.item in seen:
            raise LicenseRegistryError(f"duplicate registry entry for item {entry.item!r}")
        seen.add(entry.item)
    return entries


class LicenseRegistry:
    """Read-only view over ``schemas/licenses.json``."""

    def __init__(self, entries: Iterable[LicenseEntry]) -> None:
        self._by_item = {entry.item: entry for entry in entries}

    @classmethod
    def load(cls, path: Path | None = None) -> LicenseRegistry:
        return cls(_load(path or find_registry_path()))

    def __contains__(self, item: object) -> bool:
        return item in self._by_item

    def __len__(self) -> int:
        return len(self._by_item)

    @property
    def items(self) -> tuple[str, ...]:
        return tuple(sorted(self._by_item))

    def entry(self, item: str) -> LicenseEntry:
        try:
            return self._by_item[item]
        except KeyError:
            raise UnregisteredDatasetError(
                f"dataset {item!r} is not registered in schemas/licenses.json (§6.4). "
                f"Register it with license, attribution and source before shipping it."
            ) from None

    def assert_registered(self, items: Iterable[str]) -> None:
        """Fail unless every id in ``items`` has a registry entry."""
        missing = sorted({item for item in items if item not in self._by_item})
        if missing:
            raise UnregisteredDatasetError(
                "unregistered dataset(s) in schemas/licenses.json (§6.4, NFR-9): "
                + ", ".join(missing)
            )

    def assert_declarations_match(self, declarations: Iterable[dict[str, str]]) -> None:
        """Fail unless each manifest ``licenses[]`` entry matches the registry."""
        for declaration in declarations:
            entry = self.entry(declaration["item"])
            expected = entry.as_manifest_declaration()
            if declaration != expected:
                raise AttributionMismatchError(
                    f"license declaration for {entry.item!r} disagrees with the registry.\n"
                    f"  manifest: {declaration}\n"
                    f"  registry: {expected}"
                )

    def declarations_for(self, items: Iterable[str]) -> list[dict[str, str]]:
        """Build the manifest ``licenses[]`` block for ``items`` from the registry."""
        return [self.entry(item).as_manifest_declaration() for item in items]
