"""Draft review (edit, accept, reject) and the data-pack zip export."""

from __future__ import annotations

import asyncio
import io
import zipfile

import pytest
import yaml
from fastapi.testclient import TestClient

from app.research.export import build_export
from app.services.pack_validator import validate_pack
from app.worker import main as worker_main
from app.worker.main import create_app
from app.worker.runner import Runner
from tests.jobs_support import (
    CATEGORIES_YAML,
    PANTRY_URL,
    SignedClient,
    job_settings,
    research_params,
    scenario_deps,
    sqlite_store,
)


@pytest.fixture()
def finished(tmp_path, monkeypatch):
    """A worker client and a finished job with one draft, against a tiny pack."""
    from app.research.pipeline import PackContext

    pack = PackContext(categories_yaml=CATEGORIES_YAML, services=[])
    monkeypatch.setattr(worker_main, "pack_context", lambda: pack)
    store, settings = sqlite_store(tmp_path), job_settings()
    job = store.create_job("research", research_params(), settings.caps(), "admin")
    store.update_job(job["id"], plan_approved=True)
    asyncio.run(Runner(store, settings, lambda s, st, o: scenario_deps(s, st, o)).run_once())
    [draft] = store.list_drafts(job["id"])
    with TestClient(create_app(settings=settings, store=store, start_runner=False)) as client:
        yield SignedClient(client), job["id"], draft["id"], store


def test_draft_detail_has_yaml_provenance_and_validator_results(finished):
    signed, job_id, draft_id, _ = finished
    listed = signed.get("/v1/drafts", f"job={job_id}").json()["items"]
    assert [d["id"] for d in listed] == [draft_id] and listed[0]["error_count"] == 0
    detail = signed.get(f"/v1/drafts/{draft_id}").json()
    assert yaml.safe_load(detail["yaml"])["slug"] == detail["slug"]
    assert detail["provenance"]["fields"]["eligibility_summary"][0]["url"] == PANTRY_URL
    assert detail["issues"] == {"errors": [], "warnings": detail["issues"]["warnings"]}


def test_edit_revalidates_strips_verification_and_blocks_accept_on_errors(finished):
    signed, _, draft_id, _ = finished
    svc = yaml.safe_load(signed.get(f"/v1/drafts/{draft_id}").json()["yaml"])
    svc["categories"] = []
    svc["last_verified_date"] = "2026-01-01"
    svc["verified_by"] = "someone"
    res = signed.patch(f"/v1/drafts/{draft_id}", {"yaml": yaml.safe_dump(svc)})
    assert res.status_code == 200
    body = res.json()
    assert body["error_count"] >= 1
    assert "last_verified_date" not in body["candidate"] and "verified_by" not in body["candidate"]
    assert signed.post(f"/v1/drafts/{draft_id}/accept").status_code == 409

    assert signed.patch(f"/v1/drafts/{draft_id}", {"yaml": "- not\n- a mapping"}).status_code == 422
    assert signed.patch(f"/v1/drafts/{draft_id}", {"yaml": "a: [unclosed"}).status_code == 422


def test_accept_reject_and_export(finished):
    signed, job_id, draft_id, store = finished
    res = signed.post(f"/v1/drafts/{draft_id}/accept")
    assert res.status_code == 200 and res.json()["state"] == "accepted"
    assert store.get_draft(draft_id)["reviewed_by"] == "admin"

    zres = signed.get(f"/v1/jobs/{job_id}/export.zip")
    assert zres.status_code == 200 and zres.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(zres.content))
    names = set(zf.namelist())
    assert {"pack.yaml", "categories.yaml", "life_events.yaml", "crisis_resources.yaml", "SOURCES.md"} <= names
    slug = res.json()["slug"]
    assert f"services/{slug}.yaml" in names
    assert PANTRY_URL in zf.read("SOURCES.md").decode()

    rej = signed.post(f"/v1/drafts/{draft_id}/reject", {"reason": "Closed permanently"})
    assert rej.json()["state"] == "rejected" and rej.json()["reject_reason"] == "Closed permanently"
    assert signed.post(f"/v1/drafts/{draft_id}/reject", {"reason": ""}).status_code == 422


def test_export_is_a_valid_pack_and_entries_stay_unverified():
    job = {"id": "a" * 32, "params": research_params()}
    svc = {
        "id": "svc-x", "slug": "x", "name": "X Pantry", "provider_name": "X", "categories": ["food"],
        "eligibility_summary": "Anyone.", "status": "active", "phone": "512-555-0100",
        "last_verified_date": "2026-01-01", "verified_by": "me",
        "sources": [{"url": "https://x.example.org/", "retrieved_at": "2026-11-01", "fields": ["name"]}],
    }
    data = build_export(job, [{"candidate": svc}], CATEGORIES_YAML)
    zf = zipfile.ZipFile(io.BytesIO(data))
    files = {name: yaml.safe_load(zf.read(name)) for name in zf.namelist() if name.endswith(".yaml")}
    assert "last_verified_date" not in files["services/x.yaml"]
    assert files["pack.yaml"]["schema_version"] == 1 and "UNVERIFIED" in files["pack.yaml"]["notes"]
    result = validate_pack(files)
    assert result["errors"] == []
