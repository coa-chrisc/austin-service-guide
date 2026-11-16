"""The main app's client for the job worker.

Every call is signed (``app/jobs/auth.py``) and bound to its method, path,
query and body. No browser header is forwarded. ``remote`` mode talks to
``JOB_WORKER_URL`` over HTTPS; ``inline`` mode (``app/jobs/inline.py``)
talks to an in-process worker app through the same code path.

Stdlib + httpx only: this module runs inside the Vercel function, which does
not install the worker's database dependencies.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.jobs.auth import request_path, sign

logger = logging.getLogger(__name__)

# Generous for a proxied JSON call; well under Vercel's 300 s function cap.
TIMEOUT = httpx.Timeout(30.0, connect=5.0)
PASS_HEADERS = ("content-type", "content-disposition")


class WorkerUnavailable(Exception):
    """The worker could not be reached (network error or timeout)."""


@dataclass
class WorkerResponse:
    status: int
    content: bytes
    headers: dict[str, str]


class WorkerClient:
    def __init__(self, base_url: str, secret: str, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.transport = transport

    async def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str | int] | None = None,
        body: bytes = b"",
        actor: str = "token",
    ) -> WorkerResponse:
        query_string = urlencode({k: v for k, v in (query or {}).items() if v is not None})
        url = httpx.URL(self.base_url + path + (f"?{query_string}" if query_string else ""))
        # Sign exactly the path and query the worker will see (any base path included).
        signed_path = request_path(url.path, url.query.decode("ascii"))
        headers = {"authorization": sign(self.secret, method=method, path=signed_path, body=body, actor=actor)}
        if body:
            headers["content-type"] = "application/json"
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=TIMEOUT, follow_redirects=False) as client:
                res = await client.request(method, url, content=body, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning("job worker unreachable: %s", type(exc).__name__)
            raise WorkerUnavailable(type(exc).__name__) from None
        return WorkerResponse(
            status=res.status_code,
            content=res.content,
            headers={k: v for k, v in res.headers.items() if k.lower() in PASS_HEADERS},
        )
