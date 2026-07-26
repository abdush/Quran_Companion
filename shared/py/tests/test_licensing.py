"""The §6.4 licensing gate. An unregistered dataset must fail the build (NFR-9)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from qc_shared.licensing import (
    AttributionMismatchError,
    LicenseRegistry,
    LicenseRegistryError,
    UnregisteredDatasetError,
    find_registry_path,
)


@pytest.fixture
def registry() -> LicenseRegistry:
    return LicenseRegistry.load(find_registry_path())


class TestRepositoryRegistry:
    def test_the_real_registry_loads(self, registry: LicenseRegistry) -> None:
        assert len(registry) >= 1
        for item in registry.items:
            entry = registry.entry(item)
            assert entry.attribution.strip(), f"{item} has no attribution string"
            assert entry.source_url.startswith("http"), f"{item} has no usable source url"
            assert entry.license.strip(), f"{item} has no license"

    def test_registry_validates_against_its_own_schema(self) -> None:
        jsonschema = pytest.importorskip("jsonschema")
        path = find_registry_path()
        schema = json.loads((path.parent / "licenses.schema.json").read_text(encoding="utf-8"))
        jsonschema.validate(json.loads(path.read_text(encoding="utf-8")), schema)


class TestGate:
    def test_registered_items_pass(self, registry: LicenseRegistry) -> None:
        registry.assert_registered(registry.items)

    def test_unregistered_item_is_a_hard_failure(self, registry: LicenseRegistry) -> None:
        with pytest.raises(UnregisteredDatasetError, match="tafsir:unlicensed-collection"):
            registry.assert_registered([*registry.items, "tafsir:unlicensed-collection"])

    def test_entry_lookup_fails_loudly(self, registry: LicenseRegistry) -> None:
        with pytest.raises(UnregisteredDatasetError, match="not registered"):
            registry.entry("audio:some-reciter")

    def test_declarations_must_match_the_registry(self, registry: LicenseRegistry) -> None:
        item = registry.items[0]
        good = registry.declarations_for([item])
        registry.assert_declarations_match(good)

        tampered = [{**good[0], "attribution": "Public domain, no attribution needed"}]
        with pytest.raises(AttributionMismatchError, match="disagrees with the registry"):
            registry.assert_declarations_match(tampered)

    def test_rejects_a_duplicated_entry(self, tmp_path: Path) -> None:
        entry = {
            "item": "text:x",
            "name": "X",
            "source_url": "https://example.test/x",
            "license": "CC0-1.0",
            "attribution": "X",
            "added_at": "2026-07-25",
        }
        path = tmp_path / "licenses.json"
        path.write_text(json.dumps({"registry_version": 1, "entries": [entry, entry]}))
        with pytest.raises(LicenseRegistryError, match="duplicate registry entry"):
            LicenseRegistry.load(path)

    def test_rejects_an_unknown_registry_version(self, tmp_path: Path) -> None:
        path = tmp_path / "licenses.json"
        path.write_text(json.dumps({"registry_version": 99, "entries": []}))
        with pytest.raises(LicenseRegistryError, match="unsupported registry_version"):
            LicenseRegistry.load(path)


def test_registry_is_discovered_from_the_repo_tree() -> None:
    path = find_registry_path()
    assert path.name == "licenses.json"
    assert path.parent.name == "schemas"
