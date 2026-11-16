"""The research fetcher refuses internal targets (issue #18 SSRF rules).

No network: a fake resolver maps hostnames to addresses and an httpx
MockTransport serves the responses.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.research.fetch import FetchError, SafeFetcher, address_allowed, check_url

PUBLIC = "93.184.215.14"


def run(coro):
    return asyncio.run(coro)


def make_fetcher(handler, dns: dict[str, list[str]] | None = None, **kw) -> SafeFetcher:
    dns = dns or {}

    async def resolver(host: str, port: int) -> list[str]:
        return dns.get(host, [PUBLIC])

    async def no_sleep(_s: float) -> None:
        return None

    return SafeFetcher("test-agent", resolver=resolver, transport=httpx.MockTransport(handler), sleep=no_sleep, **kw)


def html(body: str, status: int = 200, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, headers={"content-type": "text/html; charset=utf-8", **(headers or {})},
                          content=body.encode())


def never(request: httpx.Request) -> httpx.Response:  # pragma: no cover - must not be called
    raise AssertionError(f"no request expected, got {request.url}")


@pytest.mark.parametrize(
    "url, reason",
    [
        ("http://127.0.0.1/", "blocked_address"),
        ("http://169.254.169.254/latest/meta-data/", "blocked_address"),
        ("http://[::1]/", "blocked_address"),
        ("http://[::ffff:127.0.0.1]/", "blocked_address"),
        ("http://10.0.0.5/", "blocked_address"),
        ("http://100.64.0.1/", "blocked_address"),
        ("http://example.org:8080/", "bad_port"),
        ("ftp://example.org/", "bad_scheme"),
        ("http://user:pw@example.org/", "credentials_in_url"),
        ("http://localhost/", "blocked_host"),
        ("http://searxng.railway.internal:8080/", "bad_port"),
        ("http://postgres.railway.internal/", "blocked_host"),
        ("http://intranet/", "blocked_host"),
    ],
)
def test_static_url_checks_refuse_internal_targets(url, reason):
    with pytest.raises(FetchError) as exc:
        run(make_fetcher(never).fetch(url))
    assert exc.value.reason == reason


def test_hostname_resolving_to_a_private_address_is_refused():
    fetcher = make_fetcher(never, dns={"evil.example.com": ["192.168.1.10"]})
    with pytest.raises(FetchError) as exc:
        run(fetcher.fetch("https://evil.example.com/"))
    assert exc.value.reason == "blocked_address"


def test_any_private_answer_in_a_mixed_dns_reply_is_refused():
    fetcher = make_fetcher(never, dns={"mixed.example.com": [PUBLIC, "10.1.2.3"]})
    with pytest.raises(FetchError) as exc:
        run(fetcher.fetch("https://mixed.example.com/"))
    assert exc.value.reason == "blocked_address"


def test_public_url_redirecting_to_a_private_one_is_refused():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        return html("", 302, {"location": "http://169.254.169.254/latest/meta-data/"})

    with pytest.raises(FetchError) as exc:
        run(make_fetcher(handler).fetch("https://example.org/start"))
    assert exc.value.reason == "blocked_address"
    assert seen == [PUBLIC]  # only the first, public hop was requested


def test_redirect_to_a_host_that_resolves_privately_is_refused():
    def handler(request: httpx.Request) -> httpx.Response:
        return html("", 301, {"location": "https://rebind.example.net/"})

    fetcher = make_fetcher(handler, dns={"rebind.example.net": ["127.0.0.1"]})
    with pytest.raises(FetchError) as exc:
        run(fetcher.fetch("https://example.org/"))
    assert exc.value.reason == "blocked_address"


def test_connection_is_pinned_to_the_checked_address_with_the_original_host_header():
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return html("<html><head><title>Food pantry</title></head><body><p>Open Monday</p></body></html>")

    page = run(make_fetcher(handler).fetch("https://pantry.example.org/hours?x=1"))
    assert requests[0].url.host == PUBLIC
    assert requests[0].headers["host"] == "pantry.example.org"
    assert requests[0].extensions.get("sni_hostname") == "pantry.example.org"
    assert "cookie" not in requests[0].headers and "authorization" not in requests[0].headers
    assert page.title == "Food pantry" and "Open Monday" in page.text


def test_too_many_redirects_stop():
    def handler(request: httpx.Request) -> httpx.Response:
        return html("", 302, {"location": "https://example.org/again"})

    with pytest.raises(FetchError) as exc:
        run(make_fetcher(handler).fetch("https://example.org/"))
    assert exc.value.reason == "too_many_redirects"


def test_body_is_capped_while_streaming():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/plain"}, content=b"a" * 5000)

    page = run(make_fetcher(handler, max_bytes=1000).fetch("https://example.org/big.txt"))
    assert page.truncated and len(page.text) == 1000


def test_disallowed_content_type_is_refused():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "application/octet-stream"}, content=b"\x00")

    with pytest.raises(FetchError) as exc:
        run(make_fetcher(handler).fetch("https://example.org/file.bin"))
    assert exc.value.reason == "content_type"


def test_robots_txt_is_respected():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, headers={"content-type": "text/plain"},
                                  content=b"User-agent: *\nDisallow: /private\n")
        return html("ok")

    fetcher = make_fetcher(handler)
    assert run(fetcher.allowed_by_robots("https://example.org/public")) is True
    assert run(fetcher.allowed_by_robots("https://example.org/private/page")) is False


@pytest.mark.parametrize("addr", ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254",
                                  "100.64.0.1", "::1", "fc00::1", "fe80::1", "224.0.0.1", "::ffff:10.0.0.1",
                                  "2002:0a00:0001::1", "0.0.0.0"])
def test_address_allowed_rejects_non_global(addr):
    assert address_allowed(addr) is False


def test_address_allowed_accepts_public():
    assert address_allowed(PUBLIC) is True
    assert address_allowed("2606:4700:4700::1111") is True


def test_check_url_defaults_ports():
    assert check_url("https://example.org/x") == ("https", "example.org", 443)
    assert check_url("http://example.org/x") == ("http", "example.org", 80)
