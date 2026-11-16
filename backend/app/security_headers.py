"""Security headers on every response: API, SPA, access gate and errors.

The Content-Security-Policy is built for what the SPA actually loads:

- scripts, the service worker, fonts and the manifest are same-origin
  (Vite's hashed assets, ``registerSW.js``, ``sw.js``, @fontsource files);
- MUI/emotion injects ``<style>`` tags at runtime, so styles need
  ``'unsafe-inline'`` (scripts do not);
- map tiles come from the build-time ``VITE_MAP_TILE_URL`` (OpenStreetMap
  when unset). They are ``<img>`` loads, and the service worker's runtime
  cache ``fetch``es them, so the tile origin is in ``img-src`` and
  ``connect-src``;
- ``realtime_audio`` voice posts its SDP offer to ``https://api.openai.com``.

FastAPI's /docs and /redoc pages load Swagger UI / ReDoc from a CDN with an
inline script, so they get every header except the CSP.
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
OPENAI_ORIGIN = "https://api.openai.com"
HSTS_VALUE = "max-age=63072000; includeSubDomains"

# https://host[:port], where the leftmost label may be Leaflet's {s} subdomain.
_TILE_ORIGIN_RE = re.compile(
    r"^https://((?:\{s\}\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?::\d{1,5})?)(?:[/?#]|$)"
)


def tile_source(url: str | None) -> str:
    """CSP source for the map tile server.

    ``{s}`` as the leftmost label becomes ``*.``; any shape a CSP source
    can't express exactly falls back to ``https:`` so the map still loads.
    """
    match = _TILE_ORIGIN_RE.match(url or OSM_TILE_URL)
    if not match:
        return "https:"
    return "https://" + match.group(1).replace("{s}", "*", 1)


def build_csp() -> str:
    tiles = tile_source(os.environ.get("VITE_MAP_TILE_URL"))
    directives = {
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "img-src": f"'self' data: blob: {tiles}",
        "font-src": "'self' data:",
        "connect-src": f"'self' {OPENAI_ORIGIN} {tiles}",
        "media-src": "'self' blob:",
        "worker-src": "'self'",
        "manifest-src": "'self'",
        "object-src": "'none'",
        "base-uri": "'self'",
        "form-action": "'self'",
        "frame-ancestors": "'none'",
    }
    return "; ".join(f"{name} {value}" for name, value in directives.items())


_STATIC_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    # The voice intake needs the microphone and the map offers "near me".
    (b"permissions-policy", b"camera=(), microphone=(self), geolocation=(self), payment=(), usb=()"),
)


def _is_https(scope: Scope) -> bool:
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-proto":
            return value.decode("latin-1").split(",")[0].strip() == "https"
    return scope.get("scheme") == "https"


class SecurityHeadersMiddleware:
    """Pure ASGI middleware; add it last so it wraps the access gate too.

    Headers a route already set are left alone.
    """

    def __init__(self, app: ASGIApp, csp_exempt_paths: Iterable[str] = ()) -> None:
        self.app = app
        self.csp = build_csp().encode()
        self.csp_exempt_paths = frozenset(csp_exempt_paths)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        extra = list(_STATIC_HEADERS)
        if scope["path"] not in self.csp_exempt_paths:
            extra.append((b"content-security-policy", self.csp))
        if _is_https(scope):
            extra.append((b"strict-transport-security", HSTS_VALUE.encode()))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                headers.extend((k, v) for k, v in extra if k not in present)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
