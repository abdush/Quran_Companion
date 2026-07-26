"""`GET /v1/quran/verses/{verse_key}` and `GET /v1/quran/pages/{mushaf_id}/{page}`."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.cache import MemoryCache
from tests.qds.conftest import MUSHAF_ID


class TestGetVerse:
    def test_returns_the_verse_text_by_default(self, client: TestClient) -> None:
        response = client.get("/v1/quran/verses/114:1")
        assert response.status_code == 200
        body = response.json()
        assert body["verse_key"] == "114:1"
        assert body["surah"] == 114
        assert body["ayah"] == 1
        assert body["text"]
        assert "words" not in body, "words must be opt-in via `fields`"
        assert body["dataset_version"]

    def test_expands_words_on_request(self, client: TestClient) -> None:
        body = client.get("/v1/quran/verses/114:1", params={"fields": "text,words"}).json()
        assert [word["word_key"] for word in body["words"]] == [
            "114:1:1",
            "114:1:2",
            "114:1:3",
            "114:1:4",
        ]
        assert body["words"][0]["gloss"] == "Say"
        # A word without a gloss omits the field rather than sending null.
        assert "gloss" not in body["words"][3]

    def test_words_only_projection_omits_text(self, client: TestClient) -> None:
        body = client.get("/v1/quran/verses/114:2", params={"fields": "words"}).json()
        assert "text" not in body
        assert len(body["words"]) == 2

    def test_translations_field_is_present_but_empty(self, client: TestClient) -> None:
        body = client.get("/v1/quran/verses/114:1", params={"fields": "translations"}).json()
        assert body["translations"] == []

    @pytest.mark.parametrize("verse_key", ["0:1", "115:1", "1:8", "abc", "1:1:1"])
    def test_rejects_invalid_keys_with_problem_details(
        self, client: TestClient, verse_key: str
    ) -> None:
        response = client.get(f"/v1/quran/verses/{verse_key}")
        assert response.status_code == 400
        assert response.headers["content-type"].startswith("application/problem+json")
        assert response.json()["status"] == 400

    def test_unknown_field_is_a_400(self, client: TestClient) -> None:
        response = client.get("/v1/quran/verses/114:1", params={"fields": "tafsir"})
        assert response.status_code == 400
        assert "tafsir" in response.json()["detail"]

    def test_valid_but_unloaded_verse_is_a_404(self, client: TestClient) -> None:
        response = client.get("/v1/quran/verses/114:6")
        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/problem+json")


class TestGetPage:
    def test_returns_the_full_line_inventory(self, client: TestClient) -> None:
        response = client.get(f"/v1/quran/pages/{MUSHAF_ID}/604")
        assert response.status_code == 200
        lines = response.json()["lines"]
        assert [line["line_type"] for line in lines] == [
            "surah_name",
            "basmallah",
            "ayah",
            "ayah",
        ]

    def test_heading_lines_carry_no_words(self, client: TestClient) -> None:
        lines = client.get(f"/v1/quran/pages/{MUSHAF_ID}/604").json()["lines"]
        assert lines[0]["words"] == []
        assert lines[1]["words"] == []

    def test_words_are_in_reading_order(self, client: TestClient) -> None:
        lines = client.get(f"/v1/quran/pages/{MUSHAF_ID}/604").json()["lines"]
        assert lines[2]["words"] == ["114:1:1", "114:1:2", "114:1:3", "114:1:4"]
        assert lines[3]["words"] == ["114:2:1", "114:2:2", "114:3:1", "114:3:2"]

    def test_unknown_mushaf_is_a_404(self, client: TestClient) -> None:
        response = client.get("/v1/quran/pages/indopak-15-lines/604")
        assert response.status_code == 404
        assert "unknown mushaf" in response.json()["detail"]

    def test_unloaded_page_is_a_404(self, client: TestClient) -> None:
        assert client.get(f"/v1/quran/pages/{MUSHAF_ID}/1").status_code == 404

    @pytest.mark.parametrize("page", [0, 605, 9999])
    def test_pages_outside_the_mushaf_are_rejected(self, client: TestClient, page: int) -> None:
        assert client.get(f"/v1/quran/pages/{MUSHAF_ID}/{page}").status_code == 422


class TestCaching:
    """§6.5 — Redis in front of Postgres, 24 h TTL, ETag revalidation."""

    def test_sets_public_cache_headers(self, client: TestClient) -> None:
        response = client.get("/v1/quran/verses/114:1")
        assert response.headers["Cache-Control"] == "public, max-age=86400"
        assert response.headers["ETag"].startswith('"')

    def test_second_request_is_served_from_cache(
        self, client: TestClient, memory_cache: MemoryCache
    ) -> None:
        client.get("/v1/quran/verses/114:1")
        assert memory_cache.misses == 1
        client.get("/v1/quran/verses/114:1")
        assert memory_cache.hits == 1

    def test_ttl_is_24_hours(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        recorded: list[int] = []
        cache = MemoryCache()
        original = cache.set

        async def spy(key: str, value: bytes, ttl_seconds: int) -> None:
            recorded.append(ttl_seconds)
            await original(key, value, ttl_seconds)

        cache.set = spy  # type: ignore[method-assign]
        from app.core import cache as cache_module

        cache_module.set_cache(cache)
        try:
            client.get("/v1/quran/verses/114:1")
            client.get(f"/v1/quran/pages/{MUSHAF_ID}/604")
        finally:
            cache_module.set_cache(None)
        assert recorded == [86_400, 86_400]

    def test_projections_are_cached_separately(
        self, client: TestClient, memory_cache: MemoryCache
    ) -> None:
        client.get("/v1/quran/verses/114:1")
        client.get("/v1/quran/verses/114:1", params={"fields": "text,words"})
        assert memory_cache.misses == 2
        assert memory_cache.hits == 0

    def test_if_none_match_returns_304_without_a_body(self, client: TestClient) -> None:
        first = client.get("/v1/quran/verses/114:1")
        second = client.get(
            "/v1/quran/verses/114:1", headers={"If-None-Match": first.headers["ETag"]}
        )
        assert second.status_code == 304
        assert not second.content
        assert second.headers["ETag"] == first.headers["ETag"]

    def test_stale_etag_gets_a_fresh_body(self, client: TestClient) -> None:
        response = client.get(
            "/v1/quran/verses/114:1", headers={"If-None-Match": '"deadbeef"'}
        )
        assert response.status_code == 200

    def test_etag_differs_between_representations(self, client: TestClient) -> None:
        plain = client.get("/v1/quran/verses/114:1").headers["ETag"]
        expanded = client.get(
            "/v1/quran/verses/114:1", params={"fields": "text,words"}
        ).headers["ETag"]
        assert plain != expanded
