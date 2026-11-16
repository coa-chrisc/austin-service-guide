"""Fetch public web pages for the research agent without becoming an SSRF proxy.

Every URL is hostile: it comes from search results or page links. Rules,
re-checked on every redirect hop:

- ``http``/``https`` only, ports 80 and 443 only, no credentials in the URL;
- the host is resolved here and every address must be globally routable
  (``ipaddress`` ``is_global``; loopback, private, link-local, CGNAT,
  multicast, unique-local, metadata and IPv4-mapped forms are refused) and
  ``*.internal`` / ``localhost`` names are refused outright;
- the connection goes to the resolved address (pinned), with the original
  name as ``Host`` and TLS SNI, so a second DNS answer cannot swap the target;
- at most 3 redirects, 2 MB body cap enforced while streaming, connect
  timeout 5 s, total 15 s, no cookies, no auth headers;
- only text/html, text/plain and application/xhtml+xml.

``SEARXNG_URL`` never passes through here (see ``providers/searxng.py``).
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
import urllib.robotparser
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Awaitable, Callable
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

MAX_REDIRECTS = 3
MAX_BYTES = 2 * 1024 * 1024
CONNECT_TIMEOUT = 5.0
TOTAL_TIMEOUT = 15.0
MIN_HOST_INTERVAL = 2.0
MAX_TEXT_CHARS = 200_000
ALLOWED_TYPES = ("text/html", "text/plain", "application/xhtml+xml")
_BLOCKED_SUFFIXES = (".internal", ".local", ".localhost", ".localdomain", ".home.arpa", ".onion")

Resolver = Callable[[str, int], Awaitable[list[str]]]


class FetchError(Exception):
    """The URL was refused or the fetch failed. ``reason`` is a short code."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason


@dataclass
class FetchedPage:
    url: str
    final_url: str
    status: int
    content_type: str
    title: str
    text: str
    links: list[str] = field(default_factory=list)
    truncated: bool = False


async def system_resolver(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(info[4][0] for info in infos))


def address_allowed(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        mapped = ip.ipv4_mapped or ip.sixtofour
        if mapped is not None:
            ip = mapped
        elif ip.teredo is not None:
            return False
    return ip.is_global and not ip.is_multicast and not ip.is_reserved


def check_url(url: str) -> tuple[str, str, int]:
    """Static checks. Returns (scheme, host, port) or raises FetchError."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise FetchError("bad_url", str(exc)) from exc
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise FetchError("bad_scheme", scheme)
    if parts.username or parts.password:
        raise FetchError("credentials_in_url")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise FetchError("no_host")
    if port is None:
        port = 443 if scheme == "https" else 80
    if port not in (80, 443):
        raise FetchError("bad_port", str(port))
    if host == "localhost" or host.endswith(_BLOCKED_SUFFIXES):
        raise FetchError("blocked_host", host)
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None and not address_allowed(host):
        raise FetchError("blocked_address", host)
    if literal is None and "." not in host:
        raise FetchError("blocked_host", host)  # single-label names are internal
    return scheme, host, port


class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "template", "svg", "iframe", "object", "head"}
    _BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article",
              "header", "footer", "table", "ul", "ol", "dd", "dt", "address", "td", "th", "main", "nav"}

    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.parts: list[str] = []
        self.links: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
        if tag in self._SKIP:
            self._skip += 1
        if tag in self._BLOCK:
            self.parts.append("\n")
        if tag == "a":
            href = dict(attrs).get("href")
            if href and not href.startswith(("javascript:", "data:", "#")):
                self.links.append(urljoin(self.base_url, href).split("#", 1)[0])
                if href.startswith(("mailto:", "tel:")):
                    self.parts.append(f" {href.split(':', 1)[1]} ")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in self._SKIP and self._skip:
            self._skip -= 1
        if tag in self._BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def html_to_text(html: str, base_url: str) -> tuple[str, str, list[str]]:
    """(title, readable text, absolute links)."""
    parser = _TextExtractor(base_url)
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # noqa: BLE001 — malformed markup: keep what parsed
        pass
    lines = [" ".join(line.split()) for line in "".join(parser.parts).splitlines()]
    text = "\n".join(line for line in lines if line)
    links = list(dict.fromkeys(link for link in parser.links if link.startswith(("http://", "https://", "mailto:"))))
    return " ".join(parser.title.split())[:300], text[:MAX_TEXT_CHARS], links[:500]


class SafeFetcher:
    def __init__(
        self,
        user_agent: str,
        *,
        resolver: Resolver = system_resolver,
        transport: httpx.AsyncBaseTransport | None = None,
        min_host_interval: float = MIN_HOST_INTERVAL,
        max_bytes: int = MAX_BYTES,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.user_agent = user_agent
        self.resolver = resolver
        self.max_bytes = max_bytes
        self.min_host_interval = min_host_interval
        self._sleep = sleep
        self._last: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._client = httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            trust_env=False,  # never route through an env-configured proxy
            timeout=httpx.Timeout(TOTAL_TIMEOUT, connect=CONNECT_TIMEOUT),
            headers={"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _polite(self, host: str) -> None:
        last = self._last.get(host)
        if last is not None:
            wait = self.min_host_interval - (time.monotonic() - last)
            if wait > 0:
                await self._sleep(wait)
        self._last[host] = time.monotonic()

    async def _resolve(self, host: str, port: int) -> str:
        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            literal = None
        if literal is not None:
            return host
        try:
            addrs = await self.resolver(host, port)
        except (OSError, socket.gaierror) as exc:
            raise FetchError("dns_failed", host) from exc
        if not addrs:
            raise FetchError("dns_failed", host)
        bad = [a for a in addrs if not address_allowed(a)]
        if bad:
            raise FetchError("blocked_address", f"{host} -> {bad[0]}")
        return addrs[0]

    async def _one_hop(self, url: str) -> httpx.Response:
        scheme, host, port = check_url(url)
        addr = await self._resolve(host, port)
        parts = urlsplit(url)
        netloc_ip = f"[{addr}]" if ":" in addr else addr
        if port not in (80, 443) or (scheme == "https" and port != 443) or (scheme == "http" and port != 80):
            netloc_ip = f"{netloc_ip}:{port}"
        pinned = urlunsplit((scheme, netloc_ip, parts.path or "/", parts.query, ""))
        host_header = host if (scheme, port) in (("https", 443), ("http", 80)) else f"{host}:{port}"
        request = self._client.build_request(
            "GET", pinned, headers={"Host": host_header},
            extensions={"sni_hostname": host} if scheme == "https" else {},
        )
        await self._polite(host)
        return await self._client.send(request, stream=True)

    async def _fetch(self, url: str) -> FetchedPage:
        current = url
        for _hop in range(MAX_REDIRECTS + 1):
            response = await self._one_hop(current)
            try:
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("location")
                    if not location:
                        raise FetchError("bad_redirect")
                    current = urljoin(current, location)
                    continue
                if response.status_code >= 400:
                    raise FetchError("http_error", str(response.status_code))
                ctype = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if ctype not in ALLOWED_TYPES:
                    raise FetchError("content_type", ctype or "none")
                body = bytearray()
                truncated = False
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > self.max_bytes:
                        del body[self.max_bytes:]
                        truncated = True
                        break
                charset = response.charset_encoding or "utf-8"
                try:
                    raw = body.decode(charset, errors="replace")
                except LookupError:
                    raw = body.decode("utf-8", errors="replace")
                if ctype == "text/plain":
                    title, text, links = "", raw[:MAX_TEXT_CHARS], []
                else:
                    title, text, links = html_to_text(raw, current)
                return FetchedPage(url=url, final_url=current, status=response.status_code, content_type=ctype,
                                   title=title, text=text, links=links, truncated=truncated)
            finally:
                await response.aclose()
        raise FetchError("too_many_redirects")

    async def fetch(self, url: str) -> FetchedPage:
        try:
            return await asyncio.wait_for(self._fetch(url), timeout=TOTAL_TIMEOUT)
        except FetchError:
            raise
        except asyncio.TimeoutError as exc:
            raise FetchError("timeout") from exc
        except httpx.HTTPError as exc:
            raise FetchError("network", type(exc).__name__) from exc

    async def allowed_by_robots(self, url: str) -> bool:
        """robots.txt, cached per host. Unreachable robots.txt allows; 401/403 disallows."""
        try:
            scheme, host, port = check_url(url)
        except FetchError:
            return False
        key = f"{scheme}://{host}:{port}"
        if key not in self._robots:
            parser: urllib.robotparser.RobotFileParser | None = urllib.robotparser.RobotFileParser()
            robots_url = urlunsplit((scheme, host if port in (80, 443) else f"{host}:{port}", "/robots.txt", "", ""))
            try:
                page = await self.fetch(robots_url)
                parser.parse(page.text.splitlines())  # type: ignore[union-attr]
            except FetchError as exc:
                if str(exc) in ("http_error: 401", "http_error: 403"):
                    parser.disallow_all = True  # type: ignore[union-attr]
                else:
                    parser = None
            self._robots[key] = parser
        parser = self._robots[key]
        return True if parser is None else parser.can_fetch(self.user_agent, url)
