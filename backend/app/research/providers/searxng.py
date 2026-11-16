"""Private SearXNG instance as a search provider.

``SEARXNG_URL`` (on Railway ``http://searxng.railway.internal:8080``) comes
only from the environment and is the one internal address the worker calls.
It does not go through the SSRF fetcher, and nothing a user or a web page
supplies can change it. The instance must enable the ``json`` format
(``deploy/railway/searxng/settings.yml``).
"""

from __future__ import annotations

import logging

import httpx

from app.research.search import SearchHit, SearchResult

logger = logging.getLogger(__name__)


class SearxngProvider:
    name = "searxng"

    def __init__(self, base_url: str, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self._transport = transport

    async def search(self, query: str, *, site: str | None = None, limit: int = 10) -> SearchResult:
        q = f"{query} site:{site}" if site else query
        params = {"q": q, "format": "json", "categories": "general", "language": "en-US", "pageno": 1, "safesearch": 1}
        async with httpx.AsyncClient(transport=self._transport, timeout=20.0, trust_env=False) as client:
            response = await client.get(f"{self.base_url}/search", params=params)
            response.raise_for_status()
            data = response.json()
        hits = []
        for item in data.get("results", []):
            url = item.get("url") or ""
            if not url.startswith(("http://", "https://")):
                continue
            hits.append(SearchHit(
                url=url,
                title=str(item.get("title") or "")[:300],
                snippet=str(item.get("content") or "")[:500],
                engine=str(item.get("engine") or ""),
            ))
            if len(hits) >= limit:
                break
        unresponsive = data.get("unresponsive_engines") or []
        if unresponsive:
            logger.info("searxng: %d results, unresponsive engines: %s", len(hits), unresponsive)
        return SearchResult(hits=hits)
