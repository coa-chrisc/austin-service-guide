"""Both search backends behind one SearchProvider interface: SearXNG (own
infrastructure) and OpenAI's web_search tool. No network."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.research.providers.openai_search import OpenAIWebSearchProvider, parse_response
from app.research.providers.searxng import SearxngProvider
from app.research.search import SearchHit, make_provider, select_urls
from tests.jobs_support import job_settings


def test_searxng_provider_queries_json_and_maps_results():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = request.url
        return httpx.Response(200, json={"results": [
            {"url": "https://www.traviscountytx.gov/health", "title": "Health", "content": "c", "engine": "bing"},
            {"url": "javascript:alert(1)", "title": "bad"},
            {"url": "https://pantry.example.org/", "title": "Pantry", "engine": "duckduckgo"},
        ], "unresponsive_engines": [["brave", "timeout"]]})

    provider = SearxngProvider("http://searxng.railway.internal:8080/", transport=httpx.MockTransport(handler))
    result = asyncio.run(provider.search("food pantry", site="example.org", limit=5))
    assert seen["url"].host == "searxng.railway.internal" and seen["url"].path == "/search"
    assert seen["url"].params["format"] == "json" and seen["url"].params["q"] == "food pantry site:example.org"
    assert [h.url for h in result.hits] == ["https://www.traviscountytx.gov/health", "https://pantry.example.org/"]
    assert result.usage.search_calls == 0  # self-hosted: no per-call charge


def test_searxng_errors_surface_to_the_pipeline():
    provider = SearxngProvider("http://s:8080", transport=httpx.MockTransport(lambda r: httpx.Response(429)))
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(provider.search("q"))


OPENAI_RESPONSE = {
    "output": [
        {"type": "reasoning", "summary": []},
        {"type": "web_search_call", "status": "completed", "action": {
            "type": "search", "query": "food pantry Travis County",
            "sources": [{"type": "url", "url": "https://www.centraltexasfoodbank.org/get-help"},
                        {"type": "url", "url": "https://www.traviscountytx.gov/health-human-services"}],
        }},
        {"type": "web_search_call", "status": "completed", "action": {"type": "open_page", "url": "https://x"}},
        {"type": "message", "content": [{"type": "output_text", "text": "...", "annotations": [
            {"type": "url_citation", "url": "https://www.centraltexasfoodbank.org/get-help?utm_source=openai",
             "title": "Get Help", "start_index": 0, "end_index": 3},
            {"type": "url_citation", "url": "https://pantry.example.org/hours?utm_source=openai", "title": "Hours"},
        ]}]},
    ],
    "usage": {"input_tokens": 3000, "output_tokens": 400, "input_tokens_details": {"cached_tokens": 1000}},
}


def test_openai_response_parsing_collects_sources_and_citations():
    result = parse_response(OPENAI_RESPONSE, limit=10)
    assert [h.url for h in result.hits] == [
        "https://www.centraltexasfoodbank.org/get-help",
        "https://www.traviscountytx.gov/health-human-services",
        "https://pantry.example.org/hours",
    ]
    assert result.hits[2].engine == "openai:citation" and result.hits[2].title == "Hours"
    assert result.usage.search_calls == 1
    assert (result.usage.input_tokens, result.usage.cached_tokens, result.usage.output_tokens) == (3000, 1000, 400)


def test_openai_provider_request_shape():
    calls = []

    class Responses:
        async def create(self, **kwargs):
            calls.append(kwargs)
            return json.loads(json.dumps(OPENAI_RESPONSE), object_hook=lambda d: SimpleNamespace(**d))

    provider = OpenAIWebSearchProvider(api_key="", model="m", client=SimpleNamespace(responses=Responses()))
    result = asyncio.run(provider.search("food pantry", site="traviscountytx.gov", limit=2))
    [call] = calls
    assert call["tools"][0]["type"] == "web_search"
    assert call["tools"][0]["filters"] == {"allowed_domains": ["traviscountytx.gov"]}
    assert call["tool_choice"] == "required" and call["store"] is False
    assert call["include"] == ["web_search_call.action.sources"]
    assert "food pantry" in call["input"]
    assert len(result.hits) == 2  # limit applies


def test_make_provider_selects_by_setting():
    assert make_provider(job_settings(research_search_provider="searxng")).name == "searxng"
    assert make_provider(job_settings(research_search_provider="openai_web_search")).name == "openai"
    assert make_provider(job_settings(research_search_provider="", searxng_url="")).name == "openai"
    with pytest.raises(ValueError):
        job_settings(research_search_provider="bing").search_provider
    with pytest.raises(RuntimeError, match="SEARXNG_URL"):
        make_provider(job_settings(research_search_provider="searxng", searxng_url=""))


def test_select_urls_ranks_official_sources_and_applies_lists():
    hits = [SearchHit(url=u) for u in (
        "https://www.yelp.com/biz/pantry",
        "https://pantry.example.com/",
        "https://www.traviscountytx.gov/food",
        "https://foodbank.example.org/",
        "https://foodbank.example.org/other",
        "https://foodbank.example.org/third",
    )]
    urls, skipped = select_urls(hits, allowed_domains=[], place_domains=[], seed_urls=["https://seed.example.net/"],
                                limit=10, per_host=2)
    assert urls[0] == "https://seed.example.net/" and urls[1] == "https://www.traviscountytx.gov/food"
    assert "https://www.yelp.com/biz/pantry" not in urls
    assert {s["reason"] for s in skipped} == {"deny list", "per-host page cap"}
    only, _ = select_urls(hits, allowed_domains=["traviscountytx.gov"], place_domains=[], seed_urls=[],
                          limit=10, per_host=5)
    assert only == ["https://www.traviscountytx.gov/food"]
