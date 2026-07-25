"""Small, dependency-free HTTP fetcher with an on-disk cache.

Imports are build-time and idempotent: a fetch that already sits in the cache is
never repeated, so re-running the pipeline is cheap and reproducible, and CI can
warm the cache once.
"""

from __future__ import annotations

import hashlib
import logging
import time
import urllib.error
import urllib.request
from pathlib import Path

from pack_builder.config import (
    HTTP_RETRIES,
    HTTP_TIMEOUT_SECONDS,
    USER_AGENT,
    cache_dir,
)

log = logging.getLogger(__name__)


class FetchError(RuntimeError):
    """An upstream source could not be retrieved."""


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last: Exception | None = None
    for attempt in range(1, HTTP_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            if attempt < HTTP_RETRIES:
                backoff = 2**attempt
                log.warning("fetch failed (%s/%s) for %s: %s", attempt, HTTP_RETRIES, url, exc)
                time.sleep(backoff)
    raise FetchError(f"could not fetch {url}: {last}") from last


def cached_fetch(url: str, cache_name: str | None = None, *, refresh: bool = False) -> Path:
    """Download `url` into the cache and return the cached file path."""
    directory = cache_dir()
    directory.mkdir(parents=True, exist_ok=True)
    name = cache_name or hashlib.sha256(url.encode()).hexdigest()[:32]
    target = directory / name
    if target.exists() and not refresh:
        return target
    payload = _get(url)
    if not payload:
        raise FetchError(f"empty response from {url}")
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.write_bytes(payload)
    tmp.replace(target)
    return target


def is_cached(cache_name: str) -> bool:
    return (cache_dir() / cache_name).exists()
