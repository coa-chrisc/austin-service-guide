"""Smoke-test a deployed Service Guide (Vercel or any host). Standard library only.

    ACCESS_CODE=<code> python3 deploy/vercel/smoke_test.py https://<host> [--live]

Checks the access gate (when ACCESS_CODE is set), the health endpoint, the SPA
and the catalog API. --live also runs one AI intake turn and mints a Realtime
client secret, which spends a few cents of OpenAI usage. Exits non-zero on the
first failure.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D102
        return None


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {label}{f'  ({detail})' if detail else ''}")
    if not ok:
        sys.exit(1)


def status_of(opener: urllib.request.OpenerDirector, url: str) -> tuple[int, dict[str, str], bytes]:
    try:
        with opener.open(url, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base_url")
    parser.add_argument("--live", action="store_true", help="also run one live AI turn and a Realtime secret mint")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    code = os.environ.get("ACCESS_CODE", "")

    anon = urllib.request.build_opener(NoRedirect())
    jar = http.cookiejar.CookieJar()
    authed = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect())

    st, _, body = status_of(anon, base + "/api/v1/health")
    check("health is public", st == 200 and b"healthy" in body, f"HTTP {st}")

    if code:
        st, headers, _ = status_of(anon, base + "/")
        check("gate redirects pages", st == 303 and "/access" in headers.get("Location", ""), f"HTTP {st}")
        st, _, _ = status_of(anon, base + "/api/v1/services")
        check("gate blocks API", st == 401, f"HTTP {st}")
        form = urllib.parse.urlencode({"code": code, "next": "/"}).encode()
        try:
            authed.open(base + "/access", form, timeout=30)
            st = 200
        except urllib.error.HTTPError as e:
            st = e.code
        check("access code accepted", st == 303 and any(c.name == "csg_access" for c in jar), f"HTTP {st}")
    else:
        print("SKIP  gate checks (ACCESS_CODE not set)")

    st, headers, body = status_of(authed, base + "/")
    check("SPA served", st == 200 and "text/html" in headers.get("Content-Type", "") and b"<div id=\"root\"" in body, f"HTTP {st}")

    st, _, body = status_of(authed, base + "/api/v1/services?page_size=1")
    total = json.loads(body).get("total") if st == 200 else None
    check("catalog API", st == 200 and bool(total), f"{total} services")

    st, _, body = status_of(authed, base + "/api/v1/intake/voice-config")
    voice = json.loads(body) if st == 200 else {}
    check("voice config", st == 200, json.dumps(voice))

    if not args.live:
        return

    def post(path: str, payload: dict) -> tuple[dict, float]:
        req = urllib.request.Request(base + path, json.dumps(payload).encode(), {"Content-Type": "application/json"})
        t0 = time.time()
        with authed.open(req, timeout=310) as r:
            return json.load(r), time.time() - t0

    live = bool(voice.get("live_ai"))
    check("live AI is on", live, "" if live else "set OPENAI_API_KEY and DEMO_MODE=false, then redeploy")
    started, t = post("/api/v1/intake/start", {"language": "en", "mode": "text"})
    check("intake start", "state" in started, f"{t:.1f}s")
    reply, t = post(
        "/api/v1/intake/message",
        {"state": started["state"], "message": "I need help paying rent. I live in 78744.", "language": "en"},
    )
    text = (reply.get("response") or {}).get("content", "")
    check("live AI turn", bool(text), f"{t:.1f}s: {text[:120]!r}")
    if voice.get("mode") == "realtime_audio":
        secret, t = post("/api/v1/intake/realtime/client-secret", {"state": reply["state"], "language": "en"})
        check("Realtime client secret", "client_secret" in secret, f"{t:.1f}s, model {secret.get('model')}")


if __name__ == "__main__":
    main()
