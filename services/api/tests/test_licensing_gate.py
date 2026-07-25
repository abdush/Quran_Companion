"""The §6.4 / NFR-9 licensing gate, wired into a pipeline that actually runs.

`tools/pack-builder` enforces this before it writes a pack or a table, but that
suite has no CI job yet. The `api` job's path filter already covers
`schemas/**`, so mirroring the gate here means an unregistered or misattributed
dataset fails the build today — which is the whole point of calling it a gate.

Move or drop these once `tools/pack-builder` has its own CI job; until then,
deleting them silently removes the only enforcement.
"""

from __future__ import annotations

import json

import pytest
from jsonschema import Draft202012Validator
from qc_shared.licensing import (
    AttributionMismatchError,
    LicenseRegistry,
    UnregisteredDatasetError,
    find_registry_path,
)

#: Datasets the shipped `core-hafs` pack is built from (pack_builder.config).
CORE_HAFS_ITEMS = (
    "text:tanzil-uthmani-1.1",
    "text:qpc-hafs",
    "layout:qpc-hafs-madani-604",
    "wbw:en",
)


@pytest.fixture(scope="module")
def registry() -> LicenseRegistry:
    return LicenseRegistry.load(find_registry_path())


class TestRegistryIntegrity:
    def test_validates_against_its_schema(self) -> None:
        path = find_registry_path()
        schema = json.loads((path.parent / "licenses.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator(schema).validate(json.loads(path.read_text(encoding="utf-8")))

    def test_every_entry_is_attributable(self, registry: LicenseRegistry) -> None:
        for item in registry.items:
            entry = registry.entry(item)
            assert entry.attribution.strip(), f"{item}: empty attribution"
            assert entry.license.strip(), f"{item}: no license"
            assert entry.source_url.startswith("http"), f"{item}: no usable source url"

    def test_non_spdx_codes_document_their_constraints(self, registry: LicenseRegistry) -> None:
        # A registry-defined code is only acceptable with an explanation of what
        # it permits (§6.4); an SPDX id speaks for itself.
        for item in registry.items:
            entry = registry.entry(item)
            if "-" in entry.license and entry.license[0].isupper() and " " not in entry.license:
                continue
            assert entry.usage_constraints, f"{item}: non-SPDX license without usage_constraints"


class TestGateFiresOnTheShippedPack:
    def test_every_core_hafs_dataset_is_registered(self, registry: LicenseRegistry) -> None:
        registry.assert_registered(CORE_HAFS_ITEMS)

    def test_declarations_can_be_built_for_the_pack(self, registry: LicenseRegistry) -> None:
        declarations = registry.declarations_for(CORE_HAFS_ITEMS)
        assert [d["item"] for d in declarations] == list(CORE_HAFS_ITEMS)
        registry.assert_declarations_match(declarations)

    def test_an_unregistered_dataset_fails(self, registry: LicenseRegistry) -> None:
        with pytest.raises(UnregisteredDatasetError, match="tafsir:unlicensed"):
            registry.assert_registered([*CORE_HAFS_ITEMS, "tafsir:unlicensed"])

    def test_a_reworded_attribution_fails(self, registry: LicenseRegistry) -> None:
        declarations = registry.declarations_for(CORE_HAFS_ITEMS)
        declarations[0]["attribution"] = "Public domain"
        with pytest.raises(AttributionMismatchError, match="disagrees with the registry"):
            registry.assert_declarations_match(declarations)

    def test_tanzil_terms_are_recorded(self, registry: LicenseRegistry) -> None:
        # Tanzil permits verbatim redistribution only; losing that note would
        # let a future pack ship a modified text without anyone noticing.
        entry = registry.entry("text:tanzil-uthmani-1.1")
        assert entry.license == "CC-BY-3.0"
        assert "tanzil.net" in entry.attribution
        assert "modif" in (entry.usage_constraints or "").lower()
