"""End-to-end check of a deployed research worker (issue #18).

Talks to the worker directly with signed requests, the same way the main
app's proxy does (``app/jobs/proxy.py``). The secret is read from the
``JOB_WORKER_SECRET`` environment variable and never printed.

Usage (from ``backend/``)::

    JOB_WORKER_URL=https://<worker domain> JOB_WORKER_SECRET=... \\
        python scripts/research_e2e.py smoke

    # A real research run (costs OpenAI usage, up to --max-cost). The search
    # backend is the worker's RESEARCH_SEARCH_PROVIDER (searxng or
    # openai_web_search); switch it on the worker to compare the two.
    python scripts/research_e2e.py research --county "Travis County" --state TX \\
        --topic "food pantries" --max-cost 2 --max-pages 25 --approve

``smoke`` checks: /healthz is open, /v1 refuses an unsigned call (401), a
signed /v1/config answers, a signed no-op job is created and finished.
``research`` starts a job, approves the plan when asked to, follows the
events until the job finishes, and prints the draft summary. Exit status 1
when a check fails or the job does not reach needs_review.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.jobs.proxy import WorkerClient  # noqa: E402

FINISHED = ("needs_review", "failed", "cancelled")


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


async def call(client: WorkerClient, method: str, path: str, body: dict | None = None, **query) -> tuple[int, dict]:
    raw = json.dumps(body).encode() if body is not None else b""
    res = await client.request(method, path, query=query or None, body=raw, actor="e2e")
    try:
        data = json.loads(res.content or b"{}")
    except ValueError:
        data = {"raw": res.content[:200].decode(errors="replace")}
    return res.status, data


async def smoke(client: WorkerClient) -> None:
    async with httpx.AsyncClient(timeout=20.0) as http:
        health = await http.get(client.base_url + "/healthz")
        print(f"GET /healthz -> {health.status_code} {health.text.strip()}")
        if health.status_code != 200:
            fail("health check")
        unsigned = await http.get(client.base_url + "/v1/config")
        print(f"GET /v1/config without a token -> {unsigned.status_code}")
        if unsigned.status_code != 401:
            fail("an unsigned request was not refused")
        docs = await http.get(client.base_url + "/docs")
        print(f"GET /docs -> {docs.status_code}")
        if docs.status_code != 404:
            fail("API docs are exposed")
    status, config = await call(client, "GET", "/v1/config")
    print(f"GET /v1/config signed -> {status} {json.dumps(config)}")
    if status != 200:
        fail("signed config call")
    status, created = await call(client, "POST", "/v1/jobs", {"kind": "noop"})
    print(f"POST /v1/jobs noop -> {status} {created}")
    if status != 202:
        fail("noop job")
    status, job = await call(client, "GET", f"/v1/jobs/{created['id']}")
    print(f"GET /v1/jobs/<id> -> {status} state={job.get('state')}")
    if job.get("state") != "needs_review":
        fail("noop job did not finish")
    print("smoke: OK")


async def research(client: WorkerClient, args: argparse.Namespace) -> None:
    status, config = await call(client, "GET", "/v1/config")
    print(f"worker config: {json.dumps(config)}")
    if not config.get("research_enabled"):
        fail("research is not enabled on the worker (OPENAI_API_KEY unset)")
    place = {"state": args.state}
    if args.city:
        place["city"] = args.city
    if args.county:
        place["county"] = args.county
    body = {
        "kind": "research",
        "params": {"place": place, "topic": args.topic, "categories": args.category or []},
        "caps": {"max_cost_usd": args.max_cost, "max_pages": args.max_pages, "max_drafts": args.max_drafts,
                 "max_runtime_minutes": args.max_minutes},
    }
    status, created = await call(client, "POST", "/v1/jobs", body)
    print(f"POST /v1/jobs research -> {status} {created}")
    if status != 202:
        fail("could not start the research job")
    job_id = created["id"]
    after, approved, started = 0, False, time.monotonic()
    while True:
        _, events = await call(client, "GET", f"/v1/jobs/{job_id}/events", after=after)
        for ev in events.get("items", []):
            print(f"  [{ev['type']}] {ev['message']}")
        after = events.get("next_after", after)
        _, job = await call(client, "GET", f"/v1/jobs/{job_id}")
        state = job.get("state")
        if state == "awaiting_plan" and not approved:
            queries = (job.get("plan") or {}).get("queries", [])
            print(f"plan: {len(queries)} queries")
            for i, q in enumerate(queries):
                print(f"  {i}: {json.dumps(q)[:200]}")
            if not args.approve:
                print(f"Plan waits for approval; rerun with --approve or approve job {job_id} in the console.")
                return
            status, _ = await call(client, "POST", f"/v1/jobs/{job_id}/approve-plan", {})
            print(f"approve-plan -> {status}")
            approved = True
        if state in FINISHED:
            break
        if time.monotonic() - started > (args.max_minutes + 5) * 60:
            fail("timed out waiting for the job")
        await asyncio.sleep(5)
    print(f"job {job_id}: state={state} stop_reason={job.get('stop_reason')} error={job.get('error')}")
    print(f"counters: {json.dumps(job.get('counters'))}")
    _, drafts = await call(client, "GET", "/v1/drafts", job=job_id)
    items = drafts.get("items", [])
    print(f"drafts: {len(items)}")
    for d in items:
        print(f"  {d['slug'] or '-'}: {d['name']} (confidence {d['confidence']}, errors {d['error_count']}, "
              f"warnings {d['warning_count']}, duplicates {d['duplicate_count']}, flags {d['flag_count']})")
    if items:
        _, first = await call(client, "GET", f"/v1/drafts/{items[0]['id']}")
        fields = (first.get("provenance") or {}).get("fields") or {}
        print(f"first draft cites {len(fields)} fields; sample:")
        for name, refs in list(fields.items())[:3]:
            ref = refs[0] if refs else {}
            print(f"  {name}: {ref.get('url', '')} \"{(ref.get('quote') or '')[:120]}\"")
    if state != "needs_review":
        fail(f"job ended {state}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("smoke", "research"))
    parser.add_argument("--url", default=os.environ.get("JOB_WORKER_URL", ""))
    parser.add_argument("--city")
    parser.add_argument("--county")
    parser.add_argument("--state", default="TX")
    parser.add_argument("--topic", default="food pantries")
    parser.add_argument("--category", action="append")
    parser.add_argument("--max-cost", type=float, default=2.0)
    parser.add_argument("--max-pages", type=int, default=25)
    parser.add_argument("--max-drafts", type=int, default=10)
    parser.add_argument("--max-minutes", type=int, default=20)
    parser.add_argument("--approve", action="store_true", help="approve the proposed plan as is")
    args = parser.parse_args()
    secret = os.environ.get("JOB_WORKER_SECRET", "")
    if not args.url.startswith("https://") and not args.url.startswith("http://"):
        parser.error("set JOB_WORKER_URL or --url")
    if len(secret) < 32:
        parser.error("set JOB_WORKER_SECRET (32+ characters)")
    client = WorkerClient(args.url, secret)
    asyncio.run(smoke(client) if args.mode == "smoke" else research(client, args))


if __name__ == "__main__":
    main()
