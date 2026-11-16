"""Signed app-to-worker tokens (CSG1) and the worker's 401 gate."""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.jobs.auth import TokenError, sign, verify
from app.jobs.settings import JobConfigError, check_app_config
from app.worker.main import create_app
from tests.jobs_support import SECRET, SignedClient, job_settings, sqlite_store


def _verify(header, *, path="/v1/jobs", method="POST", body=b"{}", seen=None, now=None, secrets_=(SECRET,)):
    used: set[str] = set()

    def default_seen(jti: str, exp: int) -> bool:
        if jti in used:
            return True
        used.add(jti)
        return False

    return verify(header, secrets_=list(secrets_), method=method, path=path, body=body,
                  seen=seen or default_seen, now=now)


def test_valid_token_verifies_and_carries_the_actor():
    header = sign(SECRET, method="POST", path="/v1/jobs", body=b"{}", actor="admin")
    assert _verify(header).actor == "admin"


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda h: None, "missing token"),
        (lambda h: "Bearer abc", "missing token"),
        (lambda h: h[:-4] + "AAAA", "bad signature"),
        (lambda h: "CSG1 notatoken", "malformed token"),
    ],
)
def test_malformed_or_forged_tokens_fail(mutate, message):
    header = sign(SECRET, method="POST", path="/v1/jobs", body=b"{}")
    with pytest.raises(TokenError, match=message):
        _verify(mutate(header))


def test_wrong_secret_fails_and_previous_secret_is_accepted_for_rotation():
    old = "o" * 40
    header = sign(old, method="POST", path="/v1/jobs", body=b"{}")
    with pytest.raises(TokenError, match="bad signature"):
        _verify(header)
    assert _verify(header, secrets_=(SECRET, old)).actor == "token"


def test_expired_token_fails():
    header = sign(SECRET, method="POST", path="/v1/jobs", body=b"{}", now=time.time() - 120)
    with pytest.raises(TokenError, match="expired"):
        _verify(header)


def test_wrong_method_path_or_body_fails():
    header = sign(SECRET, method="POST", path="/v1/jobs", body=b"{}")
    with pytest.raises(TokenError, match="wrong method"):
        _verify(header, method="GET")
    with pytest.raises(TokenError, match="wrong path"):
        _verify(header, path="/v1/jobs/x/cancel")
    with pytest.raises(TokenError, match="wrong body"):
        _verify(header, body=b'{"kind":"noop"}')


def test_replayed_token_fails():
    header = sign(SECRET, method="POST", path="/v1/jobs", body=b"{}")
    used: set[str] = set()

    def seen(jti: str, exp: int) -> bool:
        hit = jti in used
        used.add(jti)
        return hit

    _verify(header, seen=seen)
    with pytest.raises(TokenError, match="replayed"):
        _verify(header, seen=seen)


def test_lifetime_is_capped_at_sixty_seconds():
    header = sign(SECRET, method="GET", path="/v1/jobs", lifetime=3600)
    payload = json.loads(__import__("base64").urlsafe_b64decode(header.split()[1].split(".")[0] + "=="))
    assert payload["exp"] - payload["iat"] == 60


# ── The worker's HTTP gate ───────────────────────────────────────────

@pytest.fixture()
def worker(tmp_path):
    app = create_app(settings=job_settings(), store=sqlite_store(tmp_path), start_runner=False)
    with TestClient(app) as client:
        yield client


def test_health_is_open_and_docs_are_off(worker):
    assert worker.get("/healthz").json() == {"status": "ok"}
    for path in ("/docs", "/openapi.json", "/redoc"):
        assert worker.get(path).status_code == 404


def test_signed_request_succeeds(worker):
    res = SignedClient(worker).get("/v1/jobs")
    assert res.status_code == 200 and res.json() == {"items": []}


def _status(worker, header, method="GET", path="/v1/jobs", body=b""):
    headers = {"authorization": header} if header else {}
    if body:
        headers["content-type"] = "application/json"
    return worker.request(method, path, content=body, headers=headers).status_code


def test_missing_token_is_401(worker):
    res = worker.get("/v1/jobs")
    assert res.status_code == 401
    assert res.json() == {"detail": "Unauthorized"}  # no hint about why


def test_expired_token_is_401(worker):
    assert _status(worker, sign(SECRET, method="GET", path="/v1/jobs", now=time.time() - 300)) == 401


def test_replayed_token_is_401(worker):
    header = sign(SECRET, method="GET", path="/v1/jobs")
    assert _status(worker, header) == 200
    assert _status(worker, header) == 401


def test_wrong_path_token_is_401(worker):
    assert _status(worker, sign(SECRET, method="GET", path="/v1/drafts")) == 401
    # The query string is part of the signed path.
    assert _status(worker, sign(SECRET, method="GET", path="/v1/drafts"), path="/v1/drafts?state=accepted") == 401


def test_wrong_body_token_is_401(worker):
    header = sign(SECRET, method="POST", path="/v1/jobs", body=b'{"kind":"noop"}')
    assert _status(worker, header, "POST", "/v1/jobs", b'{"kind":"research"}') == 401


def test_wrong_secret_is_401(worker):
    assert _status(worker, sign("x" * 40, method="GET", path="/v1/jobs")) == 401


# ── Startup refusals ─────────────────────────────────────────────────

def test_worker_refuses_to_start_with_a_short_secret(tmp_path):
    app = create_app(settings=job_settings(job_worker_secret="short"), store=sqlite_store(tmp_path),
                     start_runner=False)
    with pytest.raises(JobConfigError):
        with TestClient(app):
            pass


def test_worker_refuses_to_start_without_a_database():
    app = create_app(settings=job_settings(database_url=""), start_runner=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        with TestClient(app):
            pass


def test_app_refuses_inline_on_vercel_and_remote_with_a_short_or_missing_secret():
    with pytest.raises(JobConfigError, match="Vercel"):
        check_app_config(job_settings(job_backend="inline"), env={"VERCEL": "1"})
    with pytest.raises(JobConfigError, match="JOB_WORKER_SECRET"):
        check_app_config(job_settings(job_backend="remote", job_worker_url="https://w.example",
                                      job_worker_secret="short"), env={})
    with pytest.raises(JobConfigError, match="JOB_WORKER_SECRET"):
        check_app_config(job_settings(job_backend="remote", job_worker_url="https://w.example",
                                      job_worker_secret=""), env={})
    with pytest.raises(JobConfigError, match="JOB_WORKER_URL"):
        check_app_config(job_settings(job_backend="remote", job_worker_url=""), env={})
    assert check_app_config(job_settings(job_backend="off"), env={"VERCEL": "1"}) == "off"
    assert check_app_config(job_settings(job_backend="inline"), env={}) == "inline"


@pytest.mark.parametrize("backend", ["off", "inline", "remote"])
def test_app_settings_and_job_settings_accept_the_same_job_backend(monkeypatch, backend):
    # JOB_BACKEND is read by app.config (partner import gate) and by
    # app.jobs.settings (research jobs); every value one accepts the other must too.
    from app.config import Settings
    from app.jobs.settings import JobSettings

    monkeypatch.setenv("JOB_BACKEND", backend)
    assert Settings().job_backend == JobSettings().job_backend == backend
