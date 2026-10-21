"""Request body size limit for the intake API.

Intake requests carry the browser-held intake state, so they are the only
endpoints where a client can send an arbitrarily large JSON body. Bodies
over ``MAX_INTAKE_BODY_BYTES`` are rejected with 413 before FastAPI parses
them, whether or not the client sent a Content-Length header.
"""

from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_INTAKE_BODY_BYTES = 256 * 1024
INTAKE_PATH_PREFIX = "/api/v1/intake/"


class IntakeBodyLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        max_bytes: int = MAX_INTAKE_BODY_BYTES,
        path_prefix: str = INTAKE_PATH_PREFIX,
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
