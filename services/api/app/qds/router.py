"""QDS read routes, implementing `schemas/openapi/qds.yaml`.

Public and cacheable: these endpoints expose only canonical reference data, take
no user identity, and hold nothing profile-scoped. Every 200 carries a strong
`ETag` and `Cache-Control: public, max-age=86400`; `If-None-Match` gets a bare
304 (§8.1).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.db import qds_connection
from app.core.problems import CONTENT_TYPE
from app.qds import service
from app.qds.schemas import Page, Verse

router = APIRouter(prefix="/v1/quran", tags=["quran"])

_PROBLEM_RESPONSES: dict[int | str, dict] = {
    400: {"description": "Malformed key or parameters.", "content": {CONTENT_TYPE: {}}},
    404: {"description": "No resource at this canonical key.", "content": {CONTENT_TYPE: {}}},
}

CACHE_CONTROL = "public, max-age=86400"

VerseKeyPath = Annotated[str, Path(description="Canonical verse key `surah:ayah` (§6.1).")]
MushafIdPath = Annotated[
    str, Path(description="Layout+script edition id, e.g. `qpc-hafs-madani-604`.")
]
PageNumberPath = Annotated[int, Path(ge=1, le=604)]
FieldsQuery = Annotated[str, Query(description="Comma-separated projection.")]
TranslationIdsQuery = Annotated[
    str | None, Query(description="Comma-separated translation resource ids.")
]
IfNoneMatch = Annotated[
    str | None,
    Header(alias="If-None-Match", description="Conditional revalidation against a prior ETag."),
]


async def connection() -> AsyncIterator[AsyncConnection]:
    async with qds_connection() as active:
        yield active


QdsConnection = Annotated[AsyncConnection, Depends(connection)]


def _respond(
    request: Request,
    representation: service.Representation,
    if_none_match: str | None,
) -> Response:
    headers = {"ETag": representation.etag, "Cache-Control": CACHE_CONTROL}
    if if_none_match and representation.etag in {
        candidate.strip() for candidate in if_none_match.split(",")
    }:
        return Response(status_code=304, headers=headers)
    return Response(
        content=representation.body,
        media_type="application/json",
        headers=headers,
    )


@router.get(
    "/verses/{verse_key}",
    operation_id="get_verse",
    summary="Resolve a verse by canonical key",
    response_model=Verse,
    responses=_PROBLEM_RESPONSES,
)
async def get_verse(
    request: Request,
    verse_key: VerseKeyPath,
    active: QdsConnection,
    fields: FieldsQuery = "text",
    translation_ids: TranslationIdsQuery = None,
    if_none_match: IfNoneMatch = None,
) -> Response:
    representation = await service.get_verse(
        active, verse_key, service.parse_fields(fields), translation_ids
    )
    return _respond(request, representation, if_none_match)


@router.get(
    "/pages/{mushaf_id}/{page}",
    operation_id="get_page",
    summary="Layout of one mushaf page",
    response_model=Page,
    responses=_PROBLEM_RESPONSES,
)
async def get_page(
    request: Request,
    mushaf_id: MushafIdPath,
    page: PageNumberPath,
    active: QdsConnection,
    if_none_match: IfNoneMatch = None,
) -> Response:
    representation = await service.get_page(active, mushaf_id, page)
    return _respond(request, representation, if_none_match)
