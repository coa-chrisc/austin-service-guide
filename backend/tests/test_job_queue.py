"""The job queue and research pipeline end to end, with fakes for the
model, search, fetcher and geocoder (no network): claim, lease, plan
approval, resume after a crash, cancel, and caps."""

from __future__ import annotations

import asyncio
from datetime import timedelta

from fastapi.testclient import TestClient

from app.jobs.store import utcnow
from app.research.pipeline import LEASE_SECONDS, Run
from app.worker.main import create_app
from app.worker.runner import Runner
from tests.jobs_support import (
    CHURCH_URL,
    PANTRY_URL,
    QUERY,
    FakeProvider,
    SignedClient,
    job_settings,
    research_params,
    scenario_deps,
    sqlite_store,
)


def make_runner(store, settings, **deps_kw):
    return Runner(store, settings, lambda s, st, owner: scenario_deps(s, st, owner, **deps_kw))


def new_job(store, settings, *, approved=True, **caps):
    job = store.create_job("research", research_params(), {**settings.caps(), **caps}, "admin")
    if approved:
        store.update_job(job["id"], plan_approved=True)
    return job["id"]


def test_full_run_drafts_only_what_the_page_supports(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)
    assert asyncio.run(make_runner(store, settings).run_once()) is True

    job = store.get_job(job_id)
    assert job["state"] == "needs_review" and job["stop_reason"] is None
    assert job["counters"]["searches"] == 1 and job["counters"]["pages"] == 1 and job["counters"]["drafts"] == 1
    assert job["counters"]["estimated_cost_usd"] > 0
    assert CHURCH_URL in job["report"]["unreachable"]  # 404 page reported, not fatal

    [draft] = store.list_drafts(job_id)
    svc, prov = draft["candidate"], draft["provenance"]
    assert svc["name"] == "Eastside Community Food Pantry"
    assert "phone" not in svc  # the injected 555-999-0000 was removed
    assert "cost" not in svc  # unsupported text field blanked
    assert svc["locations"][0]["phone"] == "(512) 555-0100"
    assert svc["locations"][0]["hours"] == {"monday": "9:00 AM - 5:00 PM"}
    assert "eligibility_summary" in prov["fields"] and "cost" in prov["missing"]
    assert any("Instruction-like text" in f["message"] for f in prov["flags"])
    assert any(s["url"] == PANTRY_URL for s in svc["sources"])
    assert draft["issues"]["errors"] == []


def test_plan_approval_parks_the_job_then_resumes(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings(research_require_plan_approval=True)
    job_id = new_job(store, settings, approved=False)
    provider = FakeProvider({QUERY: [PANTRY_URL]})
    runner = make_runner(store, settings, provider=provider)
    asyncio.run(runner.run_once())
    job = store.get_job(job_id)
    assert job["state"] == "awaiting_plan" and job["plan"]["queries"][0]["query"] == QUERY
    assert provider.queries == []  # nothing searched before approval
    assert asyncio.run(runner.run_once()) is False  # parked jobs are not claimed

    app = create_app(settings=settings, store=store, start_runner=False)
    with TestClient(app) as client:
        signed = SignedClient(client)
        res = signed.post(f"/v1/jobs/{job_id}/approve-plan", {"keep": [0]})
        assert res.status_code == 200 and res.json()["state"] == "queued"
        assert signed.post(f"/v1/jobs/{job_id}/approve-plan", {"keep": [0]}).status_code == 409

    asyncio.run(runner.run_once())
    assert store.get_job(job_id)["state"] == "needs_review"
    assert provider.queries == [QUERY]


def test_approve_plan_keeps_only_the_chosen_queries(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings, approved=False)
    plan = {"queries": [{"query": f"q{i}", "category": "food", "level": "county", "rationale": ""} for i in range(3)],
            "official_domains": [], "expected_sources": []}
    store.update_job(job_id, state="awaiting_plan", plan=plan)
    with TestClient(create_app(settings=settings, store=store, start_runner=False)) as client:
        signed = SignedClient(client)
        assert signed.post(f"/v1/jobs/{job_id}/approve-plan", {"keep": []}).status_code == 422
        res = signed.post(f"/v1/jobs/{job_id}/approve-plan", {"keep": [2, 0, 9]})
    assert [q["query"] for q in res.json()["plan"]["queries"]] == ["q0", "q2"]


def test_only_one_job_runs_at_a_time(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    first, second = new_job(store, settings), new_job(store, settings)
    claimed = store.claim_job("worker-a", LEASE_SECONDS)
    assert claimed["id"] == first
    assert store.claim_job("worker-b", LEASE_SECONDS) is None
    assert store.get_job(second)["state"] == "queued"


def test_a_job_whose_worker_died_is_resumed_without_repeating_steps(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)
    provider = FakeProvider({QUERY: [PANTRY_URL]})

    # Worker A plans and searches, then "dies" (its lease simply expires).
    job = store.claim_job("worker-a", LEASE_SECONDS)
    run = Run(job, scenario_deps(store, settings, "worker-a", provider=provider))

    async def partial():
        await run.plan_phase()
        await run.search_phase()

    asyncio.run(partial())
    store.update_job(job_id, lease_expires_at=utcnow() - timedelta(seconds=1))

    # Worker B takes it over and finishes it; the search is not repeated.
    runner_b = Runner(store, settings, lambda s, st, owner: scenario_deps(s, st, owner, provider=provider))
    assert asyncio.run(runner_b.run_once()) is True
    job = store.get_job(job_id)
    assert job["state"] == "needs_review"
    assert provider.queries == [QUERY]
    assert job["counters"]["drafts"] == 1
    # Worker A's lease is gone: it can no longer heartbeat or finish the job.
    assert store.heartbeat(job_id, "worker-a", LEASE_SECONDS) is False


class CancellingProvider(FakeProvider):
    def __init__(self, store, job_id):
        super().__init__({QUERY: [PANTRY_URL]})
        self.store, self.job_id = store, job_id

    async def search(self, query, *, site=None, limit=10):
        self.store.transition(self.job_id, ("running",), state="cancelled", lease_owner=None, lease_expires_at=None)
        return await super().search(query, site=site, limit=limit)


def test_cancel_stops_the_run_at_the_next_step(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)
    runner = make_runner(store, settings, provider=CancellingProvider(store, job_id))
    asyncio.run(runner.run_once())
    job = store.get_job(job_id)
    assert job["state"] == "cancelled"
    assert job["counters"]["pages"] == 0 and store.list_drafts(job_id) == []


def test_cancel_endpoint_cancels_queued_and_running_jobs(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)
    with TestClient(create_app(settings=settings, store=store, start_runner=False)) as client:
        res = SignedClient(client).post(f"/v1/jobs/{job_id}/cancel")
    assert res.status_code == 200 and res.json()["state"] == "cancelled"
    assert store.claim_job("w", LEASE_SECONDS) is None


def test_step_cap_stops_the_job_and_keeps_its_report(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings, max_steps=2)  # plan + one search, then stop
    asyncio.run(make_runner(store, settings).run_once())
    job = store.get_job(job_id)
    assert job["state"] == "needs_review" and job["stop_reason"] == "max_steps"
    assert job["counters"]["pages"] == 0
    assert any("max_steps" in n for n in job["report"]["notices"])


def test_cost_cap_stops_the_job(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings, max_cost_usd=0.001)  # the plan call alone costs more
    asyncio.run(make_runner(store, settings).run_once())
    job = store.get_job(job_id)
    assert job["stop_reason"] == "max_cost_usd" and job["counters"]["searches"] == 0


def test_per_job_caps_can_only_lower_the_environment(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings(research_max_pages=10)
    with TestClient(create_app(settings=settings, store=store, start_runner=False)) as client:
        signed = SignedClient(client)
        body = {"kind": "research", "params": research_params(), "caps": {"max_pages": 500, "max_cost_usd": 1.5}}
        job_id = signed.post("/v1/jobs", body).json()["id"]
        caps = signed.get(f"/v1/jobs/{job_id}").json()["caps"]
        assert caps["max_pages"] == 10 and caps["max_cost_usd"] == 1.5
        # A second research job is refused while the first is active.
        assert signed.post("/v1/jobs", body).status_code == 409


def test_research_is_refused_without_an_openai_key(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings(openai_api_key="")
    with TestClient(create_app(settings=settings, store=store, start_runner=False)) as client:
        signed = SignedClient(client)
        assert signed.get("/v1/config").json()["research_enabled"] is False
        res = signed.post("/v1/jobs", {"kind": "research", "params": research_params()})
        assert res.status_code == 503


def test_a_failing_job_is_marked_failed_and_the_runner_survives(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)

    class Broken:
        class responses:  # noqa: N801
            @staticmethod
            async def create(**kwargs):
                raise ValueError("boom")

    asyncio.run(make_runner(store, settings, client=Broken()).run_once())
    job = store.get_job(job_id)
    assert job["state"] == "failed" and "boom" in job["error"]


def test_events_page_with_after(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)
    asyncio.run(make_runner(store, settings).run_once())
    with TestClient(create_app(settings=settings, store=store, start_runner=False)) as client:
        signed = SignedClient(client)
        first = signed.get(f"/v1/jobs/{job_id}/events").json()
        assert first["items"] and first["next_after"] == first["items"][-1]["id"]
        later = signed.get(f"/v1/jobs/{job_id}/events", f"after={first['next_after']}").json()
        assert later == {"items": [], "next_after": first["next_after"]}


def test_retention_purges_old_finished_jobs(tmp_path):
    store, settings = sqlite_store(tmp_path), job_settings()
    job_id = new_job(store, settings)
    asyncio.run(make_runner(store, settings).run_once())
    store.update_job(job_id, created_at=utcnow() - timedelta(days=31))
    assert store.purge(30) == 1
    assert store.get_job(job_id) is None and store.list_drafts(job_id) == []
