"""Search results that ignore the site and engines that fail, seen in a real
SearXNG run from a datacenter IP (stubbed HTTP, model and fetcher; no network):

1. a site-restricted search keeps only hits on that domain or its
   subdomains, counts what it dropped in the job events, and records a
   warning when nothing on the site is left;
2. engines SearXNG reports as unresponsive are named in one job event per
   search phase, so staff can see when search is degraded.
"""

from __future__ import annotations

import asyncio

import httpx

from app.research.pipeline import Run
from app.research.providers.searxng import SearxngProvider
from app.research.search import SearchHit, SearchResult, keep_on_site
from app.worker.runner import Runner
from tests.jobs_support import FakeClient, FakeFetcher, job_settings, research_params, scenario_deps, sqlite_store

COUNTY = "traviscountytx.gov"


def query(text: str) -> dict:
    return {"query": text, "category": "food", "level": "county", "rationale": ""}


def plan(*texts: str) -> dict:
    return {"queries": [query(t) for t in texts], "official_domains": [COUNTY], "expected_sources": []}


def run_job(tmp_path, provider, payload, **caps):
    store, settings = sqlite_store(tmp_path), job_settings()
    job = store.create_job("research", research_params(), {**settings.caps(), **caps}, "admin")
    store.update_job(job["id"], plan_approved=True)
    deps = dict(client=FakeClient(payload, {}), provider=provider, fetcher=FakeFetcher({}))
    runner = Runner(store, settings, lambda s, st, owner: scenario_deps(s, st, owner, **deps))
    assert asyncio.run(runner.run_once()) is True
    return store, job["id"], settings, deps


def events(store, job_id, type_=None) -> list[str]:
    return [e["message"] for e in store.list_events(job_id) if type_ is None or e["type"] == type_]


def searxng(pages: dict[str, dict]) -> tuple[SearxngProvider, list[httpx.Request]]:
    """A SearXNG provider answering from ``pages`` keyed by the q parameter."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=pages.get(request.url.params["q"], {"results": []}))

    return SearxngProvider("http://searxng.test:8080", transport=httpx.MockTransport(handler)), seen


def results(*urls: str) -> list[dict]:
    return [{"url": u, "title": "t", "content": "", "engine": "bing"} for u in urls]


# ── 1. Results must match the site ───────────────────────────────────


def test_keep_on_site_keeps_the_domain_and_its_subdomains_only():
    hits = [SearchHit(url=u) for u in (
        "https://www.traviscountytx.gov/health",
        "https://traviscountytx.gov/",
        "https://hhs.traviscountytx.gov/food",
        "https://www.austintexas.gov/",
        "https://my.spokanecity.org/",
        "https://nottraviscountytx.gov/",
        "https://traviscountytx.gov.example.com/",
        "not a url",
    )]
    kept, dropped = keep_on_site(hits, COUNTY)
    assert [h.url for h in kept] == ["https://www.traviscountytx.gov/health", "https://traviscountytx.gov/",
                                     "https://hhs.traviscountytx.gov/food"]
    assert dropped == 5
    assert keep_on_site(hits, None) == (hits, 0)


def test_off_site_hits_are_dropped_counted_and_an_empty_site_is_recorded(tmp_path):
    provider, _ = searxng({
        "food pantry hours site:traviscountytx.gov": {"results": results(
            "https://www.austintexas.gov/", "https://www.traviscountytx.gov/food", "https://my.spokanecity.org/",
            "https://hhs.traviscountytx.gov/pantry")},
        "Manor food pantry site:traviscountytx.gov": {"results": results(
            "https://roguevalleymanor.org/", "https://tierradelsol.org/")},
        "Hope Food Pantry Austin hours": {"results": results(
            "https://hopefoodpantryaustin.org/", "https://www.austintexas.gov/")},
    })
    store, job_id, _, _ = run_job(tmp_path, provider, plan(
        "site:traviscountytx.gov food pantry hours",
        "site:traviscountytx.gov Manor food pantry",
        "Hope Food Pantry Austin hours",
    ))
    kept = [[h["url"] for h in store.get_step(job_id, f"search:{i}")[1]["hits"]] for i in range(3)]
    assert kept == [
        ["https://www.traviscountytx.gov/food", "https://hhs.traviscountytx.gov/pantry"],
        [],
        ["https://hopefoodpantryaustin.org/", "https://www.austintexas.gov/"],  # no site: nothing dropped
    ]
    searches = events(store, job_id, "search")
    assert any("-> 2 results" in m and "2 off-site results dropped" in m for m in searches), searches
    assert any('"Hope Food Pantry Austin hours" -> 2 results' in m and "dropped" not in m for m in searches)
    warnings = events(store, job_id, "warning")
    assert any("No results on traviscountytx.gov" in m and "2 off-site results dropped" in m for m in warnings), \
        warnings
    assert "Selected 4 pages to read from 4 search results" in events(store, job_id, "planned")


def test_on_site_hits_past_the_first_ten_are_not_lost(tmp_path):
    off = [f"https://junk{i}.example.com/" for i in range(12)]
    provider, _ = searxng({"pantry site:traviscountytx.gov": {"results": results(
        *off, "https://www.traviscountytx.gov/a", "https://www.traviscountytx.gov/b")}})
    store, job_id, _, _ = run_job(tmp_path, provider, plan("site:traviscountytx.gov pantry"))
    hits = store.get_step(job_id, "search:0")[1]["hits"]
    assert [h["url"] for h in hits] == ["https://www.traviscountytx.gov/a", "https://www.traviscountytx.gov/b"]


# ── 2. Visible degradation ───────────────────────────────────────────


def test_searxng_reports_unresponsive_engines():
    provider, _ = searxng({"q": {"results": [], "unresponsive_engines": [
        ["brave", "Suspended: too many requests"], ["duckduckgo", "CAPTCHA"], "garbage", ["only-one"]]}})
    result = asyncio.run(provider.search("q"))
    assert result.unresponsive == [("brave", "Suspended: too many requests"), ("duckduckgo", "CAPTCHA")]
    assert SearchResult().unresponsive == []


def test_one_event_per_search_phase_names_the_failed_engines(tmp_path):
    provider, _ = searxng({
        "a": {"results": results("https://a.example.org/"),
              "unresponsive_engines": [["brave", "too many requests"], ["duckduckgo", "CAPTCHA"]]},
        "b": {"results": [], "unresponsive_engines": [["brave", "Suspended: too many requests"],
                                                      ["duckduckgo", "CAPTCHA"]]},
        "c": {"results": results("https://c.example.org/")},
    })
    store, job_id, settings, deps = run_job(tmp_path, provider, plan("a", "b", "c"))
    degraded = [m for m in events(store, job_id, "warning") if "degraded" in m]
    assert len(degraded) == 1, degraded
    assert "2 of 3 searches" in degraded[0]
    assert "brave in 2 (Suspended: too many requests; too many requests)" in degraded[0]
    assert "duckduckgo in 2 (CAPTCHA)" in degraded[0]

    # A resumed run replays committed searches without repeating the event.
    run = Run(store.get_job(job_id), scenario_deps(store, settings, "worker-2", **deps))
    asyncio.run(run.search_phase())
    assert len([m for m in events(store, job_id, "warning") if "degraded" in m]) == 1


def test_a_run_stopped_by_a_cap_mid_search_still_reports_failed_engines(tmp_path):
    provider, _ = searxng({"a": {"results": [], "unresponsive_engines": [["google", "CAPTCHA"]]}})
    store, job_id, _, _ = run_job(tmp_path, provider, plan("a", "b"), max_steps=2)  # plan, then one search
    assert store.get_job(job_id)["stop_reason"] == "max_steps"
    assert [m for m in events(store, job_id, "warning") if "degraded" in m] == \
        ["Search degraded: engines failed in 1 of 1 searches: google in 1 (CAPTCHA)"]


def test_no_degraded_event_when_every_engine_answers(tmp_path):
    provider, _ = searxng({"a": {"results": results("https://a.example.org/"), "unresponsive_engines": []}})
    store, job_id, _, _ = run_job(tmp_path, provider, plan("a"))
    assert not [m for m in events(store, job_id) if "degraded" in m]
