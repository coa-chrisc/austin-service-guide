"""Who is asking: a principal that is not an IP address.

Resolution order (first match wins):

``access``  the access-gate label (``AccessGateMiddleware`` puts it on the
            request scope after validating the cookie);
``admin``   a request under ``/api/v1/admin`` with a valid ``X-Admin-Token``;
``device``  a valid signed ``csg_dev`` cookie (ungated deployments);
``anon``    none of these. Its id is the network hash, so anonymous callers
            on one /24 share one allowance.

``Principal.hash`` is a keyed hash; stores and logs use it, never the id.
The network key (``net_hash``) is a weak signal: HMAC of the client address
truncated to /24 (IPv4) or /48 (IPv6), keyed with ``DEFENSE_HASH_KEY`` and
the UTC date so it changes daily and cannot be reversed or joined across
days. The raw address is never stored or logged. No ASN header is read: the
platforms this app targets do not document one.
"""

from __future__ import annotations

import hmac
import ipaddress
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from starlette.requests import Request

from app.config import get_settings
from app.defense import device
from app.defense.keys import hash_key, keyed_hash

Kind = Literal["access", "admin", "device", "anon"]


@dataclass(frozen=True)
class Principal:
    kind: Kind
    id: str
    hash: str
    net_hash: str
    #: Device tokens only: Unix seconds the token was issued.
    issued_at: int | None = None

    @property
    def gated(self) -> bool:
        """Known to the operator (access label or admin token)."""
        return self.kind in ("access", "admin")

    def is_new_device(self, now: float) -> bool:
        warmup = get_settings().defense_new_token_warmup_seconds
        return self.kind == "device" and self.issued_at is not None and now - self.issued_at < warmup


def client_address(request: Request) -> str:
    """Client address: X-Forwarded-For only behind trusted proxies, else the peer."""
    hops = get_settings().defense_trusted_proxy_hops
    if hops > 0:
        header = request.headers.get("x-forwarded-for", "")
        entries = [e.strip() for e in header.split(",") if e.strip()]
        if entries:
            # Each trusted proxy appends the address it saw; the client is
            # ``hops`` entries from the right. Anything further left is
            # client-supplied and ignored.
            return entries[-hops] if len(entries) >= hops else entries[0]
    client = request.client
    return client.host if client else ""


def network_of(address: str) -> str:
    """/24 for IPv4, /48 for IPv6; an unparseable value is used as is."""
    try:
        ip = ipaddress.ip_address(address.split("%")[0])
    except ValueError:
        return f"raw:{address[:64]}"
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    prefix = 24 if ip.version == 4 else 48
    return str(ipaddress.ip_network(f"{ip}/{prefix}", strict=False))


def net_hash(address: str, now: float) -> str:
    day = datetime.fromtimestamp(now, tz=timezone.utc).strftime("%Y-%m-%d")
    return keyed_hash(network_of(address), key=hash_key() + b":" + day.encode())


def _admin_token_ok(request: Request) -> bool:
    expected = get_settings().admin_api_token
    supplied = request.headers.get("x-admin-token", "")
    return bool(expected) and hmac.compare_digest(
        supplied.encode("utf-8", "surrogateescape"), expected.encode()
    )


def resolve_principal(request: Request, now: float) -> Principal:
    net = net_hash(client_address(request), now)
    label = (request.scope.get("state") or {}).get("access_label")
    if label:
        return Principal("access", label, keyed_hash(f"access:{label}"), net)
    if request.url.path.startswith("/api/v1/admin") and _admin_token_ok(request):
        return Principal("admin", "admin", keyed_hash("admin:admin"), net)
    token = device.parse(request.cookies.get(device.COOKIE_NAME), now)
    if token is not None:
        return Principal("device", token.id, keyed_hash(f"device:{token.id}"), net, token.issued_at)
    return Principal("anon", f"net:{net}", keyed_hash(f"anon:{net}"), net)
