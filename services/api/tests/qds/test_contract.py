"""Contract tests against `schemas/openapi/qds.yaml` (rule R1).

Two directions, because either alone lets drift through:

* every response body validates against the contract's component schema;
* the routes the app actually publishes match the contract's paths,
  operation ids and parameters.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
import yaml
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from app.main import app
from tests.qds.conftest import MUSHAF_ID

_URI = "https://schemas.quran-companion.dev/openapi/qds.yaml"

#: Routes implemented by task 0.3. The contract also seeds `get_word` and
#: `get_audio_index`, which land in a later task; they are listed here so this
#: test starts failing the day they are implemented without being covered.
IMPLEMENTED = {"get_verse", "get_page"}
DEFERRED = {"get_word", "get_audio_index"}


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "schemas" / "openapi" / "qds.yaml").is_file():
            return candidate
    raise RuntimeError("could not locate schemas/openapi/qds.yaml")


@lru_cache(maxsize=1)
def contract() -> dict[str, Any]:
    return yaml.safe_load((_repo_root() / "schemas" / "openapi" / "qds.yaml").read_text("utf-8"))


def validator(schema_name: str) -> Draft202012Validator:
    registry = Registry().with_resource(_URI, Resource(contents=contract(), specification=DRAFT202012))
    return Draft202012Validator(
        {"$ref": f"{_URI}#/components/schemas/{schema_name}"}, registry=registry
    )


def assert_valid(schema_name: str, instance: Any) -> None:
    errors = sorted(validator(schema_name).iter_errors(instance), key=lambda e: list(e.path))
    assert not errors, "; ".join(
        f"{'/'.join(str(p) for p in e.path) or '<root>'}: {e.message}" for e in errors
    )


class TestResponsesMatchTheContract:
    @pytest.mark.parametrize("fields", ["text", "words", "text,words", "text,words,translations"])
    def test_verse_responses_validate(self, client: TestClient, fields: str) -> None:
        response = client.get("/v1/quran/verses/114:1", params={"fields": fields})
        assert response.status_code == 200
        assert_valid("verse", response.json())

    def test_page_response_validates(self, client: TestClient) -> None:
        response = client.get(f"/v1/quran/pages/{MUSHAF_ID}/604")
        assert response.status_code == 200
        assert_valid("page", response.json())

    @pytest.mark.parametrize(
        "url", ["/v1/quran/verses/0:1", "/v1/quran/verses/114:6", "/v1/quran/pages/nope/604"]
    )
    def test_error_responses_are_rfc9457_problems(self, client: TestClient, url: str) -> None:
        response = client.get(url)
        assert response.status_code in (400, 404)
        assert response.headers["content-type"].startswith("application/problem+json")
        assert_valid("problem", response.json())

    def test_word_keys_match_the_contract_pattern(self, client: TestClient) -> None:
        body = client.get("/v1/quran/verses/114:1", params={"fields": "words"}).json()
        for word in body["words"]:
            assert_valid("word_key", word["word_key"])


class TestRoutesMatchTheContract:
    def test_every_implemented_operation_is_published(self) -> None:
        published = {
            operation["operationId"]
            for path in app.openapi()["paths"].values()
            for operation in path.values()
            if isinstance(operation, dict) and "operationId" in operation
        }
        assert IMPLEMENTED <= published

    def test_no_deferred_operation_is_published_untested(self) -> None:
        published = {
            operation["operationId"]
            for path in app.openapi()["paths"].values()
            for operation in path.values()
            if isinstance(operation, dict) and "operationId" in operation
        }
        assert not (DEFERRED & published), (
            "a contract operation was implemented without extending these contract tests"
        )

    @pytest.mark.parametrize("operation_id", sorted(IMPLEMENTED))
    def test_path_and_method_match(self, operation_id: str) -> None:
        expected_path = next(
            path
            for path, operations in contract()["paths"].items()
            for operation in operations.values()
            if operation.get("operationId") == operation_id
        )
        published = app.openapi()["paths"]
        assert expected_path in published
        assert published[expected_path]["get"]["operationId"] == operation_id

    def test_contract_declares_every_operation_we_serve(self) -> None:
        contract_ids = {
            operation.get("operationId")
            for operations in contract()["paths"].values()
            for operation in operations.values()
        }
        assert IMPLEMENTED <= contract_ids
