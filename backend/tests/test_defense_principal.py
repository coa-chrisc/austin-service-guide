"""Principal resolution (defense-01): order, keyed hashes, network key."""

from __future__ import annotations

import pytest
from starlette.requests import Request

from app.config import get_settings
from app.defense import device
from app.defense.keys import keyed_hash, reset_keys
from app.defense.principal import client_address, net_hash, network_of, resolve_principal

NOW = 1_800_000_000.0


@pytest.fixture(autouse=True)
def fixed_keys(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "defense_hash_key", "h" * 40)
    monkeypatch.setattr(settings, "defense_token_secret", "t" * 40)
    reset_keys()
    yield
    reset_keys()


def _request(path="/api/v1/intake/message", *, client="203.0.113.7", headers=None, cookies=None,
             label=None) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    if cookies:
        raw.append((b"cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()).encode()))
    scope = {
        "type": "http", "method": "POST", "path": path, "raw_path": path.encode(), "query_string": b"",
        "headers": raw, "client": (client, 50000), "server": ("testserver", 443), "scheme": "https",
    }
    if label:
        scope["state"] = {"access_label": label}
    return Request(scope)


def test_access_label_wins_over_everything(monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_api_token", "admin-secret")
    cookie, _ = device.issue(NOW)
    req = _request("/api/v1/admin/x", headers={"X-Admin-Token": "admin-secret"},
                   cookies={device.COOKIE_NAME: cookie}, label="alpha")
    p = resolve_principal(req, NOW)
    assert (p.kind, p.id, p.gated) == ("access", "alpha", True)


def test_admin_token_only_counts_on_admin_routes(monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_api_token", "admin-secret")
    headers = {"X-Admin-Token": "admin-secret"}
    assert resolve_principal(_request("/api/v1/admin/x", headers=headers), NOW).kind == "admin"
    assert resolve_principal(_request("/api/v1/intake/start", headers=headers), NOW).kind == "anon"
    wrong = {"X-Admin-Token": "nope"}
    assert resolve_principal(_request("/api/v1/admin/x", headers=wrong), NOW).kind == "anon"


def test_admin_token_unset_never_matches(monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_api_token", "")
    req = _request("/api/v1/admin/x", headers={"X-Admin-Token": ""})
    assert resolve_principal(req, NOW).kind == "anon"


def test_device_cookie_then_anon():
    cookie, token = device.issue(NOW - 30)
    p = resolve_principal(_request(cookies={device.COOKIE_NAME: cookie}), NOW)
    assert (p.kind, p.id, p.issued_at) == ("device", token.id, token.issued_at)
    assert p.is_new_device(NOW) and not p.is_new_device(NOW + 200)
    anon = resolve_principal(_request(), NOW)
    assert anon.kind == "anon" and anon.id == f"net:{anon.net_hash}" and not anon.gated


@pytest.mark.parametrize("bad", [
    "", "v1.a.b", "v2.abc.1800000000.sig", "v1.abc.notdigits.sig", "v1.abc.1800000000.forged", "x" * 300,
])
def test_bad_device_cookies_are_anon(bad):
    assert resolve_principal(_request(cookies={device.COOKIE_NAME: bad}), NOW).kind == "anon"


def test_expired_and_future_device_cookies_are_rejected():
    ttl = get_settings().defense_device_token_ttl_seconds
    old, _ = device.issue(NOW - ttl)
    future, _ = device.issue(NOW + 3600)
    assert device.parse(old, NOW) is None
    assert device.parse(future, NOW) is None
    fresh, _ = device.issue(NOW - ttl + 5)
    assert device.parse(fresh, NOW) is not None


def test_hashes_are_stable_and_hide_the_input():
    a = resolve_principal(_request(label="alpha"), NOW)
    b = resolve_principal(_request(label="alpha", client="198.51.100.9"), NOW)
    assert a.hash == b.hash == keyed_hash("access:alpha")
    assert "alpha" not in a.hash and len(a.hash) == 26
    reset_keys()
    assert keyed_hash("access:alpha") == a.hash  # configured key: stable across restarts


def test_net_hash_groups_a_slash_24_and_rotates_daily():
    same_net = net_hash("203.0.113.7", NOW), net_hash("203.0.113.200", NOW)
    assert same_net[0] == same_net[1]
    assert net_hash("203.0.114.7", NOW) != same_net[0]
    assert net_hash("203.0.113.7", NOW + 86_400) != same_net[0]
    assert "203" not in same_net[0]


def test_network_of_handles_v6_and_garbage():
    assert network_of("2001:db8:1234:5678::1") == "2001:db8:1234::/48"
    assert network_of("::ffff:203.0.113.7") == "203.0.113.0/24"
    assert network_of("testclient") == "raw:testclient"


def test_forwarded_for_is_ignored_without_trusted_hops(monkeypatch):
    req = _request(client="10.0.0.1", headers={"X-Forwarded-For": "198.51.100.1"})
    monkeypatch.setattr(get_settings(), "defense_trusted_proxy_hops", 0)
    assert client_address(req) == "10.0.0.1"
    monkeypatch.setattr(get_settings(), "defense_trusted_proxy_hops", 1)
    assert client_address(req) == "198.51.100.1"


def test_forwarded_for_takes_the_entry_the_proxy_appended(monkeypatch):
    monkeypatch.setattr(get_settings(), "defense_trusted_proxy_hops", 1)
    spoofed = _request(client="10.0.0.1", headers={"X-Forwarded-For": "1.2.3.4, 198.51.100.1"})
    assert client_address(spoofed) == "198.51.100.1"
