"""Draft quality fixes found in real research runs (stubbed model, search and
fetcher; no network):

1. planned ``site.example.org`` queries become ``site:example.org`` and the
   domain reaches the provider as its site filter;
2. a bare generic draft name ("Food Pantry") gets its site or organisation,
   and look-alike services at different sites are not flagged as duplicates;
3. listings outside the job's topic are skipped, counted in the events and
   never drafted.
"""

from __future__ import annotations

import asyncio

from app.research import extract, plan
from app.research.search import SearchResult, normalize_query, split_site
from app.worker.runner import Runner
from tests.jobs_support import (
    FakeClient,
    FakeFetcher,
    FakeProvider,
    job_settings,
    research_params,
    scenario_deps,
    sqlite_store,
)


def run_job(tmp_path, *, plan_payload, extractions, pages, hits, **caps):
    store, settings = sqlite_store(tmp_path), job_settings()
    job = store.create_job("research", research_params(), {**settings.caps(), **caps}, "admin")
    store.update_job(job["id"], plan_approved=True)
    client = FakeClient(plan_payload, extractions)
    provider = RecordingProvider(hits)
    deps = dict(client=client, provider=provider, fetcher=FakeFetcher(pages))
    runner = Runner(store, settings, lambda s, st, owner: scenario_deps(s, st, owner, **deps))
    assert asyncio.run(runner.run_once()) is True
    return store, job["id"], client, provider


class RecordingProvider(FakeProvider):
    def __init__(self, hits):
        super().__init__(hits)
        self.calls: list[tuple[str, str | None]] = []

    async def search(self, query, *, site=None, limit=10) -> SearchResult:
        self.calls.append((query, site))
        return await super().search(query, site=site, limit=limit)


def events(store, job_id) -> list[str]:
    return [e["message"] for e in store.list_events(job_id)]


def query(text: str) -> dict:
    return {"query": text, "category": "food", "level": "county", "rationale": ""}


# ── 1. site: operator ────────────────────────────────────────────────


def test_a_leading_site_dot_token_becomes_the_site_operator():
    assert normalize_query("site.traviscountytx.gov community centers food pantry") == \
        "site:traviscountytx.gov community centers food pantry"
    assert normalize_query("SITE.Example.ORG pantry") == "site:example.org pantry"
    # Only a leading token that names a real-looking domain is rewritten.
    assert normalize_query("site.com reviews") == "site.com reviews"
    assert normalize_query("food pantry near site.example.org") == "food pantry near site.example.org"
    assert normalize_query("  food   pantry ") == "food pantry"


def test_the_site_operator_is_split_out_as_a_filter():
    assert split_site("site:traviscountytx.gov food pantry") == ("food pantry", "traviscountytx.gov")
    assert split_site("food bank site:www.centraltexasfoodbank.org mobile") == \
        ("food bank mobile", "centraltexasfoodbank.org")
    assert split_site("site.austintexas.gov neighborhood centers") == ("neighborhood centers", "austintexas.gov")
    assert split_site("food pantry hours") == ("food pantry hours", None)
    assert split_site("site:https://evil.example/path pantry") == ("site:https://evil.example/path pantry", None)


def test_the_planner_is_told_the_operator_and_its_output_is_normalised():
    assert "site:" in plan.INSTRUCTIONS
    payload = {"queries": [query("site.traviscountytx.gov community centers food pantry")],
               "official_domains": [], "expected_sources": []}
    out, _ = asyncio.run(plan.make_plan(FakeClient(payload, {}), job_settings(), research_params(),
                                        {"food": "Food"}, max_queries=5))
    assert out["queries"][0]["query"] == "site:traviscountytx.gov community centers food pantry"


def test_search_passes_the_site_to_the_provider_not_a_broken_operator(tmp_path):
    payload = {"queries": [query("site.traviscountytx.gov community centers food pantry"),
                           query("food bank site:centraltexasfoodbank.org mobile pantry"),
                           query("Hope Food Pantry Austin hours")],
               "official_domains": [], "expected_sources": []}
    store, job_id, _, provider = run_job(tmp_path, plan_payload=payload, extractions={}, pages={}, hits={})
    assert provider.calls == [
        ("community centers food pantry", "traviscountytx.gov"),
        ("food bank mobile pantry", "centraltexasfoodbank.org"),
        ("Hope Food Pantry Austin hours", None),
    ]
    stored = [q["query"] for q in store.get_job(job_id)["plan"]["queries"]]
    assert stored[0] == "site:traviscountytx.gov community centers food pantry"


# ── 2. Distinctive names and duplicates ──────────────────────────────

CENTRAL_URL = "https://county.example.gov/central-community-center"
DEL_VALLE_URL = "https://county.example.gov/del-valle-community-center"
COUNTY = "Travis County Health and Human Services"
CENTRAL_TEXT = (
    "Central Austin Community Center. Travis County Health and Human Services. "
    "Food Pantry: free groceries for Travis County residents. "
    "Clothing Closet: free clothes. Public Computers. Meeting Area. Job Search Services. "
    "100 Main St, Austin, TX 78702. Call (512) 854-4100."
)
DEL_VALLE_TEXT = (
    "Del Valle Community Center. Travis County Health and Human Services. "
    "Food Pantry: free groceries for Travis County residents. "
    "3518 FM 973, Del Valle, TX 78617. Call (512) 854-4100."
)


def listing(name: str, site: str, address: str, zip_code: str) -> dict:
    """A model listing with the generic name the real runs produced."""
    return {
        "name": name, "provider_name": COUNTY, "description": "Free groceries for Travis County residents.",
        "eligibility_summary": None, "how_to_apply": None, "cost": None, "cost_type": None,
        "website_url": None, "phone": "(512) 854-4100", "email": None, "languages_offered": [],
        "provider_type": "county", "categories": ["food"], "eligibility_requires": [],
        "locations": [{"name": site, "address": address, "city": "Austin", "state": "TX", "zip_code": zip_code,
                       "phone": None, "hours": {d: None for d in extract.DAYS}}],
        "evidence": [{"field": "name", "quote": f"{name}:"},
                     {"field": "provider_name", "quote": COUNTY},
                     {"field": "description", "quote": "free groceries for Travis County residents"},
                     {"field": "locations.0.address", "quote": address}],
        "extracted_criteria": {"income_limits": None, "residency": None, "ages": None, "other": None},
        "confidence": 0.8,
    }


def test_generic_names_are_made_distinctive_and_not_cross_flagged(tmp_path):
    payload = {"queries": [query("county community center food pantry")], "official_domains": [],
               "expected_sources": []}
    extractions = {
        CENTRAL_URL: {"services": [listing("Food Pantry", "Central Austin Community Center", "100 Main St", "78702")],
                      "off_topic_listings": []},
        DEL_VALLE_URL: {"services": [listing("Food Pantry", "Del Valle Community Center", "3518 FM 973", "78617")],
                        "off_topic_listings": []},
    }
    store, job_id, _, _ = run_job(
        tmp_path, plan_payload=payload, extractions=extractions,
        pages={CENTRAL_URL: ("Central", CENTRAL_TEXT), DEL_VALLE_URL: ("Del Valle", DEL_VALLE_TEXT)},
        hits={"county community center food pantry": [CENTRAL_URL, DEL_VALLE_URL]},
    )
    drafts = store.list_drafts(job_id)
    assert [d["candidate"]["name"] for d in drafts] == [
        "Central Austin Community Center Food Pantry", "Del Valle Community Center Food Pantry"]
    assert [d["candidate"]["slug"] for d in drafts] == [
        "central-austin-community-center-food-pantry", "del-valle-community-center-food-pantry"]
    assert all(d["candidate"]["provider_name"] == COUNTY for d in drafts)
    # Same county phone, same generic service, different sites: not duplicates.
    assert [d["duplicates"] for d in drafts] == [[], []]
    assert not any("possible duplicate" in m for m in events(store, job_id))
    assert any(f["field"] == "name" and "site or organisation" in f["message"]
               for f in drafts[0]["provenance"]["flags"])


def test_the_extractor_is_asked_for_a_name_a_resident_can_tell_apart():
    text = extract.INSTRUCTIONS
    assert "<organisation or site> <service>" in text
    assert "provider_name" in text and "never a bare" in text.lower()


# ── 3. Off-topic listings ────────────────────────────────────────────


def test_off_topic_listings_are_skipped_counted_and_not_drafted(tmp_path):
    payload = {"queries": [query("central community center food pantry")], "official_domains": [],
               "expected_sources": []}
    extractions = {CENTRAL_URL: {
        "services": [listing("Food Pantry", "Central Austin Community Center", "100 Main St", "78702")],
        "off_topic_listings": ["Clothing Closet", "Public Computers", "Meeting Area", "Job Search Services"],
    }}
    store, job_id, client, _ = run_job(
        tmp_path, plan_payload=payload, extractions=extractions,
        pages={CENTRAL_URL: ("Central", CENTRAL_TEXT)},
        hits={"central community center food pantry": [CENTRAL_URL]},
        max_drafts=1,
    )
    job = store.get_job(job_id)
    assert job["counters"]["drafts"] == 1 and job["stop_reason"] is None
    assert any(m.startswith("Skipped 4 listings outside the topic") for m in events(store, job_id))

    [call] = [c for c in client.responses.calls if c["text"]["format"]["name"] == "service_listings"]
    assert "Topic: food pantries" in call["input"]
    schema = call["text"]["format"]["schema"]
    assert "off_topic_listings" in schema["required"]
    assert "off_topic_listings" in call["instructions"]


def test_the_extractor_reports_off_topic_names_without_drafting_them():
    payload = {"services": [{"name": "Food Pantry"}], "off_topic_listings": ["Public Computers", "", 3]}
    services, off_topic, _ = asyncio.run(extract.extract_page(
        FakeClient({}, {"u": payload}), job_settings(), params=research_params(), categories={"food": "Food"},
        url="u", title="t", text="x"))
    assert [s["name"] for s in services] == ["Food Pantry"]
    assert off_topic == ["Public Computers"]

