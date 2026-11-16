"""The main app's /api/v1/admin job routes: token gate, validation, signing
and forwarding to the worker, and error mapping. The worker runs in-process
over an ASGI transport with SQLite."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.jobs.proxy import WorkerClient
from app.routers import admin_jobs
from app.worker.main import create_app
from tests.jobs_support import SECRET, job_settings, research_params, sqlite_store

TOKEN = "admin-token-for-tests"
BACKEND = Path(__file__).resolve().parents[1]


class Recorder(httpx.AsyncBaseTransport):
    """ASGI transport to the worker that also records what was forwarded."""

    def __init__(self, app) -> None:
        self.inner = httpx.ASGITransport(app=app)
        self.requests: list[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return await self.inner.handle_async_request(request)


@pytest.fixture()
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_api_token", TOKEN)
    store = sqlite_store(tmp_path)
    worker_app = create_app(settings=job_settings(), store=store, start_runner=False)
    recorder = Recorder(worker_app)
    app = FastAPI()
    app.include_router(admin_jobs.router)
    app.dependency_overrides[admin_jobs.get_worker] = lambda: WorkerClient("http://worker", SECRET, transport=recorder)
    with TestClient(app) as client:
        yield client, recorder, store, app


def start_body(**kw):
    return {**research_params(), "acknowledge_cost": True, **kw}


H = {"X-Admin-Token": TOKEN}


def test_routes_need_the_admin_token(setup):
    client, recorder, _, _ = setup
    assert client.get("/api/v1/admin/jobs").status_code == 403
    assert client.get("/api/v1/admin/jobs", headers={"X-Admin-Token": "wrong"}).status_code == 403
    assert client.post("/api/v1/admin/research/jobs", json=start_body()).status_code == 403
    assert recorder.requests == []  # nothing reached the worker


def test_config_is_open_and_comes_from_the_worker(setup):
    client, _, _, _ = setup
    res = client.get("/api/v1/admin/jobs/config")
    assert res.status_code == 200
    body = res.json()
    assert body["research_enabled"] is True and body["search_provider"] == "searxng"
    assert body["caps"]["max_cost_usd"] == 20.0 and "backend" in body


def test_start_list_get_events_and_cancel(setup):
    client, _, store, _ = setup
    res = client.post("/api/v1/admin/research/jobs", json=start_body(caps={"max_pages": 5}), headers=H)
    assert res.status_code == 202
    job_id = res.json()["id"]
    assert store.get_job(job_id)["caps"]["max_pages"] == 5
    assert [j["id"] for j in client.get("/api/v1/admin/jobs", headers=H).json()["items"]] == [job_id]
    assert client.get(f"/api/v1/admin/jobs/{job_id}", headers=H).json()["state"] == "queued"
    events = client.get(f"/api/v1/admin/jobs/{job_id}/events?after=0", headers=H).json()
    assert events["items"][0]["message"].startswith("Job created")
    assert client.post(f"/api/v1/admin/jobs/{job_id}/cancel", headers=H).json()["state"] == "cancelled"
    assert client.get("/api/v1/admin/drafts", params={"job": job_id}, headers=H).json() == {"items": []}


def test_bodies_and_ids_are_validated_before_forwarding(setup):
    client, recorder, _, _ = setup
    bad = [
        start_body(acknowledge_cost=False),
        {k: v for k, v in start_body().items() if k != "acknowledge_cost"},
        start_body(place={"state": "Texas"}),
        start_body(seed_urls=["file:///etc/passwd"]),
        start_body(allowed_domains=["not a domain"]),
        start_body(caps={"max_cost_usd": -1}),
        start_body(levels=["galactic"]),
    ]
    for body in bad:
        assert client.post("/api/v1/admin/research/jobs", json=body, headers=H).status_code == 422, body
    assert client.get("/api/v1/admin/jobs/..%2Fconfig", headers=H).status_code in (404, 422)
    assert client.get("/api/v1/admin/jobs/not-an-id", headers=H).status_code == 422
    assert client.get("/api/v1/admin/drafts?state=published", headers=H).status_code == 422
    assert client.post(f"/api/v1/admin/drafts/{'a' * 32}/merge", headers=H).status_code == 422
    assert client.post(f"/api/v1/admin/drafts/{'a' * 32}/reject", json={}, headers=H).status_code == 422
    assert recorder.requests == []


def test_oversized_body_is_refused(setup):
    client, recorder, _, _ = setup
    res = client.patch(f"/api/v1/admin/drafts/{'a' * 32}", json={"yaml": "x" * (200 * 1024)}, headers=H)
    assert res.status_code == 413 and recorder.requests == []


def test_only_signed_requests_are_forwarded_with_no_browser_headers(setup):
    client, recorder, _, _ = setup
    client.get("/api/v1/admin/jobs", headers={**H, "Cookie": "session=abc", "X-Forwarded-For": "1.2.3.4",
                                             "Authorization": "Bearer user-token"})
    [forwarded] = recorder.requests
    assert forwarded.headers["authorization"].startswith("CSG1 ")
    for name in ("cookie", "x-admin-token", "x-forwarded-for"):
        assert name not in forwarded.headers


def test_unknown_job_is_404_from_the_worker(setup):
    client, _, _, _ = setup
    assert client.get(f"/api/v1/admin/jobs/{'b' * 32}", headers=H).status_code == 404


def test_secret_mismatch_is_reported_as_502(setup):
    client, recorder, _, app = setup
    app.dependency_overrides[admin_jobs.get_worker] = lambda: WorkerClient("http://worker", "w" * 40,
                                                                          transport=recorder)
    res = client.get("/api/v1/admin/jobs", headers=H)
    assert res.status_code == 502 and "rejected" in res.json()["detail"]


def test_unreachable_worker_is_503(setup):
    client, _, _, app = setup

    def refuse(request):
        raise httpx.ConnectError("refused", request=request)

    app.dependency_overrides[admin_jobs.get_worker] = lambda: WorkerClient(
        "http://worker", SECRET, transport=httpx.MockTransport(refuse))
    res = client.get("/api/v1/admin/jobs", headers=H)
    assert res.status_code == 503 and "unreachable" in res.json()["detail"]


def test_job_routes_are_absent_when_job_backend_is_off(client):
    # The shared app fixture runs with JOB_BACKEND unset.
    assert client.get("/api/v1/admin/jobs/config").status_code == 404
    assert client.post("/api/v1/admin/research/jobs", json={}).status_code == 404


def _import_main(env_extra: dict) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("JOB_", "VERCEL"))}
    env.update({"OPENAI_API_KEY": "", "DEMO_MODE": "true", **env_extra})
    return subprocess.run([sys.executable, "-c", "import app.main"], cwd=BACKEND, env=env,
                          capture_output=True, text=True, timeout=60)


def test_main_app_refuses_to_start_with_unsafe_job_config():
    inline_on_vercel = _import_main({"JOB_BACKEND": "inline", "VERCEL": "1"})
    assert inline_on_vercel.returncode != 0 and "cannot run on Vercel" in inline_on_vercel.stderr
    short = _import_main({"JOB_BACKEND": "remote", "JOB_WORKER_URL": "https://w.example", "JOB_WORKER_SECRET": "x"})
    assert short.returncode != 0 and "JOB_WORKER_SECRET" in short.stderr
    ok = _import_main({"JOB_BACKEND": "remote", "JOB_WORKER_URL": "https://w.example", "JOB_WORKER_SECRET": SECRET})
    assert ok.returncode == 0, ok.stderr


def test_inline_backend_runs_the_worker_in_process(tmp_path, monkeypatch):
    from app.jobs.inline import InlineWorker

    monkeypatch.setattr(get_settings(), "admin_api_token", TOKEN)
    inline = InlineWorker(job_settings(job_backend="inline", job_worker_secret="",
                                       job_inline_database_url=f"sqlite:///{tmp_path / 'inline.sqlite3'}"))
    app = FastAPI()
    app.include_router(admin_jobs.router)
    app.dependency_overrides[admin_jobs.get_worker] = lambda: inline.client
    with TestClient(app) as client:
        assert client.get("/api/v1/admin/jobs/config").json()["research_enabled"] is True
        res = client.post("/api/v1/admin/research/jobs", json=start_body(), headers=H)
        assert res.status_code == 202
        assert client.get("/api/v1/admin/jobs", headers=H).json()["items"][0]["id"] == res.json()["id"]
    assert inline.store.get_job(res.json()["id"])["state"] == "queued"
    assert len(inline.client.secret) >= 32  # a per-process secret was generated
