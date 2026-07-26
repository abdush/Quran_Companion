"""CLI surface and the caching HTTP fetcher."""

from __future__ import annotations

import urllib.error
from pathlib import Path

import pytest

from pack_builder import http, signing
from pack_builder.cli import main
from pack_builder.config import DATASET_ITEMS


class TestCli:
    def test_check_licenses_passes_and_lists_every_dataset(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert main(["check-licenses"]) == 0
        printed = capsys.readouterr().out
        for item in DATASET_ITEMS:
            assert item in printed

    def test_keygen_writes_a_public_key_and_prints_the_seed(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("pack_builder.signing.PUBLIC_KEYS_DIR", tmp_path)
        assert main(["keygen", "--name", "throwaway"]) == 0
        printed = capsys.readouterr().out
        assert "QPACK_SIGNING_KEY=" in printed
        assert (tmp_path / "throwaway-signing.pub").is_file()

    def test_verify_fails_loudly_on_a_missing_pack(self, tmp_path: Path) -> None:
        from pack_builder.pack import PackError

        with pytest.raises(PackError, match="no pack at"):
            main(["verify", str(tmp_path / "absent.qpack")])

    def test_unknown_command_exits_with_usage(self) -> None:
        with pytest.raises(SystemExit):
            main(["nonsense"])

    def test_requires_a_command(self) -> None:
        with pytest.raises(SystemExit):
            main([])


class TestSigningKeyDiscovery:
    def test_reads_a_seed_from_a_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(signing, "PUBLIC_KEYS_DIR", tmp_path)
        seed, _ = signing.generate_keypair("throwaway")
        key_file = tmp_path / "seed"
        key_file.write_text(seed + "\n", encoding="utf-8")
        monkeypatch.delenv(signing.PRIVATE_KEY_ENV, raising=False)
        monkeypatch.setenv(signing.PRIVATE_KEY_FILE_ENV, str(key_file))
        assert signing.load_private_key() is not None

    def test_missing_key_is_a_clear_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv(signing.PRIVATE_KEY_ENV, raising=False)
        monkeypatch.delenv(signing.PRIVATE_KEY_FILE_ENV, raising=False)
        with pytest.raises(signing.SigningError, match="no signing key"):
            signing.load_private_key()

    def test_non_base64_seed_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv(signing.PRIVATE_KEY_ENV, "not base64!!")
        with pytest.raises(signing.SigningError, match="not valid base64"):
            signing.load_private_key()

    def test_missing_public_key_is_a_clear_error(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("pack_builder.signing.PUBLIC_KEYS_DIR", tmp_path)
        with pytest.raises(signing.SigningError, match="no public key"):
            signing.load_public_key("absent")


class TestCachedFetch:
    def test_downloads_once_and_reuses_the_cache(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("QPACK_CACHE_DIR", str(tmp_path))
        calls: list[str] = []

        def fake_get(url: str) -> bytes:
            calls.append(url)
            return b"payload"

        monkeypatch.setattr(http, "_get", fake_get)
        first = http.cached_fetch("https://example.test/x", "x.txt")
        second = http.cached_fetch("https://example.test/x", "x.txt")
        assert first == second == tmp_path / "x.txt"
        assert first.read_bytes() == b"payload"
        assert calls == ["https://example.test/x"], "a cached file must not be re-downloaded"

    def test_refresh_forces_a_new_download(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("QPACK_CACHE_DIR", str(tmp_path))
        payloads = iter([b"old", b"new"])
        monkeypatch.setattr(http, "_get", lambda url: next(payloads))
        http.cached_fetch("https://example.test/x", "x.txt")
        assert http.cached_fetch("https://example.test/x", "x.txt", refresh=True).read_bytes() == b"new"

    def test_empty_response_is_an_error(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("QPACK_CACHE_DIR", str(tmp_path))
        monkeypatch.setattr(http, "_get", lambda url: b"")
        with pytest.raises(http.FetchError, match="empty response"):
            http.cached_fetch("https://example.test/empty", "empty.txt")

    def test_retries_then_gives_up(self, monkeypatch: pytest.MonkeyPatch) -> None:
        attempts: list[int] = []

        def always_fail(request, timeout):
            attempts.append(1)
            raise urllib.error.URLError("nope")

        monkeypatch.setattr(http.urllib.request, "urlopen", always_fail)
        monkeypatch.setattr(http.time, "sleep", lambda _: None)
        with pytest.raises(http.FetchError, match="could not fetch"):
            http._get("https://example.test/flaky")
        assert len(attempts) == http.HTTP_RETRIES

    def test_recovers_after_a_transient_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        state = {"calls": 0}

        class _Response:
            def __enter__(self):
                return self

            def __exit__(self, *_) -> bool:
                return False

            def read(self) -> bytes:
                return b"ok"

        def flaky(request, timeout):
            state["calls"] += 1
            if state["calls"] == 1:
                raise TimeoutError("slow")
            return _Response()

        monkeypatch.setattr(http.urllib.request, "urlopen", flaky)
        monkeypatch.setattr(http.time, "sleep", lambda _: None)
        assert http._get("https://example.test/flaky") == b"ok"
