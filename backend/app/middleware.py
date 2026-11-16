"""Request body size limit for the intake and admin APIs.

Intake requests carry the browser-held intake state, and the admin JSON
routes carry service records, matching rules and synthetic test profiles,
so they are the endpoints where a client can send a large JSON body. Bodies over
``MAX_INTAKE_BODY_BYTES`` are rejected with 413 before FastAPI parses them,
whether or not the client sent a Content-Length header.
"""

from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_INTAKE_BODY_BYTES = 256 * 1024
INTAKE_PATH_PREFIX = "/api/v1/intake/"
# Only the admin routes that take JSON records; other admin routes (for
# example file imports) set their own limits.
ADMIN_JSON_PREFIXES = (
    "/api/v1/admin/services",
    "/api/v1/admin/eligibility",
    "/api/v1/admin/matching-rules",
    "/api/v1/admin/pack/export",
    # Research jobs (#18); admin_jobs.py also refuses bodies over 128 KiB.
    "/api/v1/admin/research",
    "/api/v1/admin/jobs",
    "/api/v1/admin/drafts",
)


class IntakeBodyLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        max_bytes: int = MAX_INTAKE_BODY_BYTES,
        path_prefix: str | tuple[str, ...] = (INTAKE_PATH_PREFIX, *ADMIN_JSON_PREFIXES),
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.path_prefix = path_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in ("POST", "PUT", "PATCH")
            or not scope["path"].startswith(self.path_prefix)
        ):
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = 0
                if declared > self.max_bytes:
                    await self._reject(scope, receive, send)
                    return

        # Buffer the body (bounded) and replay it to the app.
        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            body = message.get("body", b"")
            total += len(body)
            if total > self.max_bytes:
                await self._reject(scope, receive, send)
                return
            chunks.append(body)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            {"detail": f"Request body exceeds {self.max_bytes // 1024} KiB."},
            status_code=413,
        )
        await response(scope, receive, send)
