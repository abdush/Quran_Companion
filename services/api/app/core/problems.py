"""RFC 9457 `application/problem+json` responses (handbook §8.1)."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

CONTENT_TYPE = "application/problem+json"


class ProblemError(Exception):
    """Raised by domain code; rendered as problem details by the handler."""

    def __init__(self, status: int, title: str, detail: str, type_: str = "about:blank") -> None:
        super().__init__(detail)
        self.status = status
        self.title = title
        self.detail = detail
        self.type = type_


def problem_response(request: Request, error: ProblemError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status,
        media_type=CONTENT_TYPE,
        content={
            "type": error.type,
            "title": error.title,
            "status": error.status,
            "detail": error.detail,
            "instance": str(request.url.path),
        },
    )


def not_found(detail: str) -> ProblemError:
    return ProblemError(404, "Not Found", detail)


def bad_request(detail: str) -> ProblemError:
    return ProblemError(400, "Bad Request", detail)
