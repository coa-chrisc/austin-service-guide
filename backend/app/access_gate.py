"""Optional access-code gate for private demo deployments.

Off unless ``ACCESS_CODES`` is set in the process environment, so local dev,
tests and the Docker image behave as before. When on, every request (the SPA,
its assets and the API) needs a valid access cookie; ``/access`` serves a small
form that sets it. Only ``/api/v1/health`` and the PWA manifest stay public.

``ACCESS_CODES`` is a comma-separated list of ``label:code`` pairs, one per
person or group, e.g. ``chris:kd83-qp20-xm,rockefeller:7tq2-zz81-pa``. The
cookie is ``label.HMAC(secret, label:code)``, so removing or changing a code
(and redeploying) revokes every cookie issued for it. ``ACCESS_GATE_SECRET``
signs the cookies; rotating it signs everyone out.

This is a demo gate, not user authentication: codes are shared secrets, there
is no per-user audit trail, and failed attempts are only slowed, not counted
(serverless instances share no state).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import html
import os
from dataclasses import dataclass
from typing import Mapping
from urllib.parse import parse_qs, quote

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

COOKIE_NAME = "csg_access"
COOKIE_MAX_AGE = 14 * 24 * 3600
GATE_PATH = "/access"
PUBLIC_PATHS = frozenset({"/api/v1/health", "/manifest.webmanifest"})
MIN_CODE_LENGTH = 8
FAILED_ATTEMPT_DELAY_SECONDS = 1.0
MAX_FORM_BYTES = 4096


class AccessGateConfigError(RuntimeError):
    """ACCESS_CODES / ACCESS_GATE_SECRET are set but unusable."""


@dataclass(frozen=True)
class GateConfig:
    codes: dict[str, str]  # label -> code
    secret: bytes


def load_gate_config(env: Mapping[str, str] | None = None) -> GateConfig | None:
    """Parse the gate settings; None means the gate is off."""
    env = os.environ if env is None else env
    raw = (env.get("ACCESS_CODES") or "").strip()
    if not raw:
        return None
    secret = (env.get("ACCESS_GATE_SECRET") or "").strip()
    if len(secret) < 32:
        raise AccessGateConfigError("ACCESS_CODES is set, so ACCESS_GATE_SECRET must be at least 32 characters.")
    codes: dict[str, str] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        label, sep, code = entry.partition(":")
        label, code = label.strip(), code.strip()
        if not sep or not label or not code:
            raise AccessGateConfigError(f"ACCESS_CODES entry {label or entry!r} must look like label:code.")
        if not label.replace("-", "").replace("_", "").isalnum():
            raise AccessGateConfigError(f"ACCESS_CODES label {label!r} may use only letters, digits, - and _.")
        if len(code) < MIN_CODE_LENGTH:
            raise AccessGateConfigError(f"ACCESS_CODES code for {label!r} must be at least {MIN_CODE_LENGTH} characters.")
        if label in codes:
            raise AccessGateConfigError(f"ACCESS_CODES label {label!r} appears twice.")
        codes[label] = code
    if not codes:
        raise AccessGateConfigError("ACCESS_CODES is set but lists no codes.")
    return GateConfig(codes=codes, secret=secret.encode())


def _sign(config: GateConfig, label: str) -> str:
    mac = hmac.new(config.secret, f"{label}:{config.codes[label]}".encode(), hashlib.sha256).hexdigest()
    return f"{label}.{mac}"


def cookie_is_valid(config: GateConfig, value: str | None) -> bool:
    if not value:
        return False
    label, _, _ = value.partition(".")
    if label not in config.codes:
        return False
    # Bytes, not str: compare_digest raises TypeError on non-ASCII str input.
    return hmac.compare_digest(value.encode("utf-8", "surrogateescape"), _sign(config, label).encode())


def match_code(config: GateConfig, submitted: str) -> str | None:
    """Return the label whose code equals ``submitted`` (constant-time per code)."""
    submitted_b = submitted.strip().encode()
    found = None
    for label, code in config.codes.items():
        if hmac.compare_digest(submitted_b, code.encode()):
            found = label
    return found


def _safe_next(raw: str | None) -> str:
    """Only same-site relative paths; anything else goes to the home page."""
    if not raw or not raw.startswith("/") or raw.startswith("//") or "\\" in raw:
        return "/"
    return raw


def _is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto.split(",")[0].strip() == "https"


def _form_page(app_name: str, next_path: str, error: bool) -> HTMLResponse:
    name = html.escape(app_name)
    message = '<p class="err" role="alert">That code didn\'t work. Check it and try again.</p>' if error else ""
    body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{name} · Access</title>
<style>
body{{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#1b1f24}}
main{{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);width:min(22rem,90vw)}}
h1{{font-size:1.25rem;margin:0 0 .25rem}}p{{margin:.25rem 0 1rem;color:#4a5260}}
label{{display:block;font-weight:600;margin-bottom:.35rem}}
input{{width:100%;box-sizing:border-box;font-size:1.05rem;padding:.6rem .7rem;border:1px solid #9aa3ae;border-radius:8px}}
button{{margin-top:1rem;width:100%;font-size:1rem;font-weight:600;padding:.65rem;border:0;border-radius:8px;background:#1b4d89;color:#fff;cursor:pointer}}
.err{{color:#a40e26;font-weight:600}}
</style></head>
<body><main>
<h1>{name}</h1><p>This demo is private. Enter the access code you were given.</p>{message}
<form method="post" action="{GATE_PATH}">
<input type="hidden" name="next" value="{html.escape(next_path)}">
<label for="code">Access code</label>
<input id="code" name="code" type="password" autocomplete="off" autofocus required>
<button type="submit">Continue</button>
</form></main></body></html>"""
    return HTMLResponse(body, status_code=401 if error else 200, headers={"Cache-Control": "no-store"})


def _private_cache(send: Send) -> Send:
    """Gated responses must never land in a shared cache: public -> private, Vary: Cookie."""

    async def wrapped(message: Message) -> None:
        if message["type"] == "http.response.start":
            headers = [
                (k, v.replace(b"public", b"private") if k.lower() == b"cache-control" else v)
                for k, v in message.get("headers", [])
                if k.lower() != b"vary" or b"cookie" not in v.lower()
            ]
            vary = [v for k, v in headers if k.lower() == b"vary"]
            headers = [(k, v) for k, v in headers if k.lower() != b"vary"]
            headers.append((b"vary", b", ".join([*vary, b"Cookie"])))
            message = {**message, "headers": headers}
        await send(message)

    return wrapped


class AccessGateMiddleware:
    """Pure ASGI middleware so it also guards the SPA catch-all and streamed bodies."""

    def __init__(self, app: ASGIApp, config: GateConfig, app_name: str) -> None:
        self.app = app
        self.config = config
        self.app_name = app_name

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]
        if path in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        if path == GATE_PATH:
            response = await self._gate(request)
        elif cookie_is_valid(self.config, request.cookies.get(COOKIE_NAME)):
            await self.app(scope, receive, _private_cache(send))
            return
        elif path == "/api" or path.startswith("/api/"):
            response = JSONResponse({"detail": "Access code required."}, status_code=401)
        else:
            target = path + (f"?{scope['query_string'].decode('latin-1')}" if scope.get("query_string") else "")
            response = RedirectResponse(f"{GATE_PATH}?next={quote(target, safe='')}", status_code=303)
        await response(scope, receive, send)

    async def _gate(self, request: Request) -> Response:
        if request.method == "GET":
            return _form_page(self.app_name, _safe_next(request.query_params.get("next")), error=False)
        if request.method != "POST":
            return Response(status_code=405, headers={"Allow": "GET, POST"})

        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > MAX_FORM_BYTES:
                return Response(status_code=413)
        form = parse_qs(body.decode("utf-8", "replace"))
        next_path = _safe_next((form.get("next") or [""])[0])
        label = match_code(self.config, (form.get("code") or [""])[0])
        if label is None:
            await asyncio.sleep(FAILED_ATTEMPT_DELAY_SECONDS)
            return _form_page(self.app_name, next_path, error=True)

        response = RedirectResponse(next_path, status_code=303)
        response.set_cookie(
            COOKIE_NAME,
            _sign(self.config, label),
            max_age=COOKIE_MAX_AGE,
            httponly=True,
            secure=_is_https(request),
            samesite="lax",
            path="/",
        )
        return response
