"""RFC 9457 `application/problem+json` responses (handbook §8.1).

Every error leaves the API as problem details — including ones nobody wrote a
handler for. A dependency that fails (an unreachable database, say) is resolved
before the route body runs, so without the catch-all below such a request would
return a bare `500 text/plain` and break the §8.1 contract exactly when a client
most needs a parseable error.
"""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)

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


def install_problem_handlers(app) -> None:
    """Render every unhandled error as problem details (§8.1)."""

    @app.exception_handler(ProblemError)
    async def _handle_problem(request: Request, error: ProblemError):
        return problem_response(request, error)

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, error: Exception):
        # The exception is logged with its traceback for operators; the response
        # says only that something failed. Exception text can carry connection
        # strings and query fragments, and must not reach a client (rule R7).
        log.exception("unhandled error serving %s", request.url.path)
        return problem_response(
            request,
            ProblemError(500, "Internal Server Error", "The request could not be completed."),
        )
