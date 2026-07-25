"""Pack assembly: checksums, signature, and the §6.4 licensing gate."""

from __future__ import annotations

import base64
import json
import zipfile
from pathlib import Path

import pytest
from qc_shared.licensing import UnregisteredDatasetError

from pack_builder import pack, signing
from pack_builder.config import DATASET_ITEMS, PACK_ID, PACK_VERSION
from pack_builder.corpus import Corpus, checksum
from pack_builder.validate import SchemaValidationError, registry, validate_manifest

pytestmark = pytest.mark.golden


@pytest.fixture(scope="module")
def signing_key(monkeymodule, tmp_path_factory: pytest.TempPathFactory) -> None:
    """Sign and verify with a throwaway key.

    The keypair is written outside the repo: the suite must never need the real
    signing key, and must never leave a public key behind in `keys/`.
    """
    monkeymodule.setattr(signing, "PUBLIC_KEYS_DIR", tmp_path_factory.mktemp("keys"))
    monkeymodule.setenv(signing.KEY_NAME_ENV, "test")
    seed, _ = signing.generate_keypair()
    monkeymodule.setenv(signing.PRIVATE_KEY_ENV, seed)


@pytest.fixture(scope="module")
def monkeymodule():
    from _pytest.monkeypatch import MonkeyPatch

    patch = MonkeyPatch()
    yield patch
    patch.undo()


@pytest.fixture(scope="module")
def built_pack(corpus: Corpus, signing_key, tmp_path_factory, monkeymodule) -> Path:
    monkeymodule.setenv("QPACK_DIST_DIR", str(tmp_path_factory.mktemp("dist")))
    monkeymodule.setenv("QPACK_BUILD_DIR", str(tmp_path_factory.mktemp("build")))
    return pack.write_pack(corpus)


class TestManifest:
    def test_matches_the_pack_manifest_schema(self, built_pack: Path) -> None:
        validate_manifest(pack.read_manifest(built_pack))

    def test_declares_the_expected_identity_and_contents(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        assert manifest["manifest_version"] == 1
        assert manifest["pack_id"] == PACK_ID == "core-hafs"
        assert manifest["version"] == PACK_VERSION
        assert manifest["contents"] == list(DATASET_ITEMS)

    def test_checksums_cover_every_item(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        assert set(manifest["checksums"]) == set(manifest["contents"])
        assert all(value.startswith("sha256:") for value in manifest["checksums"].values())

    def test_checksums_are_of_the_shipped_payloads(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        with zipfile.ZipFile(built_pack) as archive:
            for item, expected in manifest["checksums"].items():
                filename = pack.ITEM_SOURCES[item].payload_filename
                assert checksum(archive.read(f"{pack.PAYLOAD_DIR}/{filename}")) == expected


class TestSignature:
    def test_pack_verifies_end_to_end(self, built_pack: Path) -> None:
        pack.verify_pack(built_pack)

    def test_an_unsigned_manifest_is_refused(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        manifest.pop("signature")
        with pytest.raises(signing.SigningError, match="unsigned"):
            signing.verify_manifest(manifest)

    def test_a_tampered_manifest_fails_verification(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        manifest["version"] = "2099.01.0"
        with pytest.raises(signing.SigningError, match="does not verify"):
            signing.verify_manifest(manifest)

    def test_a_tampered_payload_fails_verification(
        self, built_pack: Path, tmp_path: Path
    ) -> None:
        corrupted = tmp_path / "corrupted.qpack"
        with zipfile.ZipFile(built_pack) as source, zipfile.ZipFile(corrupted, "w") as target:
            for info in source.infolist():
                data = source.read(info.filename)
                if info.filename.endswith(".tsv"):
                    data = data + b"114:6:4\ttampered\t\n"
                target.writestr(info.filename, data)
        with pytest.raises(pack.PackError, match="checksum mismatch"):
            pack.verify_pack(corrupted)

    def test_signature_is_over_canonical_bytes(self) -> None:
        manifest = {"b": 2, "a": 1, "signature": "ed25519:ignored"}
        assert signing.canonical_manifest_bytes(manifest) == b'{"a":1,"b":2}'

    def test_a_short_seed_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv(signing.PRIVATE_KEY_ENV, base64.b64encode(b"too short").decode())
        with pytest.raises(signing.SigningError, match="32 bytes"):
            signing.load_private_key()


class TestLicensingGate:
    def test_every_shipped_dataset_is_registered(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        known = registry()
        known.assert_registered(manifest["contents"])
        known.assert_declarations_match(manifest["licenses"])

    def test_attribution_is_copied_verbatim_from_the_registry(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        known = registry()
        for declaration in manifest["licenses"]:
            entry = known.entry(declaration["item"])
            assert declaration["attribution"] == entry.attribution
            assert declaration["license"] == entry.license

    def test_an_unregistered_dataset_fails_the_build(self, corpus: Corpus, signing_key) -> None:
        payloads = [*pack.build_payloads(corpus)]
        payloads.append(pack.Payload("tafsir:unregistered", "tafsir.tsv", b"x\n"))
        with pytest.raises(UnregisteredDatasetError, match="tafsir:unregistered"):
            pack.build_manifest(payloads)

    def test_a_manifest_claiming_a_wrong_licence_is_refused(self, built_pack: Path) -> None:
        manifest = pack.read_manifest(built_pack)
        manifest["licenses"][0]["license"] = "CC0-1.0"
        with pytest.raises(Exception, match="disagrees with the registry"):
            registry().assert_declarations_match(manifest["licenses"])


class TestPayloadSerialisation:
    def test_payloads_are_stable_across_rebuilds(self, corpus: Corpus) -> None:
        first = {p.item: p.checksum for p in pack.build_payloads(corpus)}
        second = {p.item: p.checksum for p in pack.build_payloads(corpus)}
        assert first == second

    def test_layout_payload_carries_word_less_heading_lines(self, corpus: Corpus) -> None:
        payload = next(p for p in pack.build_payloads(corpus) if p.item.startswith("layout:"))
        lines = payload.data.decode().splitlines()
        assert len(lines) == len(corpus.page_lines)
        headings = [line for line in lines if "\tsurah_name\t" in line]
        assert len(headings) == 114
        assert all(line.rsplit("\t", 1)[1] == "" for line in headings)


def test_manifest_rejects_a_bad_version_format() -> None:
    with pytest.raises(SchemaValidationError):
        validate_manifest(
            {
                "manifest_version": 1,
                "pack_id": "core-hafs",
                "version": "v1",
                "contents": ["text:qpc-hafs"],
                "checksums": {"text:qpc-hafs": "sha256:" + "0" * 64},
                "licenses": [],
                "signature": "ed25519:AA==",
            }
        )


def test_pack_is_a_zip_with_a_manifest(built_pack: Path) -> None:
    with zipfile.ZipFile(built_pack) as archive:
        names = archive.namelist()
    assert pack.MANIFEST_NAME in names
    assert sum(name.startswith(f"{pack.PAYLOAD_DIR}/") for name in names) == len(DATASET_ITEMS)
    assert json.loads(zipfile.ZipFile(built_pack).read(pack.MANIFEST_NAME))["pack_id"] == PACK_ID
