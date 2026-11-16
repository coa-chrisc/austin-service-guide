"""OpenAI Responses API ``web_search`` tool as a search provider.

No search service to host. Each query is one Responses call with
``tools=[{"type": "web_search"}]``, ``tool_choice="required"`` and
``include=["web_search_call.action.sources"]``, ``store=False``. Hit URLs
come from the ``web_search_call`` items' ``action.sources`` and from the
``url_citation`` annotations on the message. The answer text is discarded:
the pipeline fetches each page itself and checks evidence against it.

Public web search and calls that touch our own data stay in separate
requests (OpenAI guidance): this call carries only the query.
"""

from __future__ import annotations

from typing import Any

from app.research.search import SearchHit, SearchResult, SearchUsage


def _get(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def parse_response(response: Any, limit: int) -> SearchResult:
    """Pull hit URLs and usage out of a Responses API result (object or dict)."""
    hits: list[SearchHit] = []
    seen: set[str] = set()
    calls = 0

    def add(url: Any, title: Any = "", engine: str = "") -> None:
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            return
        key = url.split("#", 1)[0]
        # web_search citations carry utm_source=openai; drop it for a clean URL.
        key = key.replace("?utm_source=openai", "").replace("&utm_source=openai", "")
        if key in seen or len(hits) >= limit:
            return
        seen.add(key)
        hits.append(SearchHit(url=key, title=str(title or "")[:300], engine=engine))

    for item in _get(response, "output", None) or []:
        kind = _get(item, "type")
        if kind == "web_search_call":
            action = _get(item, "action")
            if _get(action, "type") == "search":
                calls += 1
            for src in _get(action, "sources", None) or []:
                add(_get(src, "url"), _get(src, "title", ""), "openai:source")
        elif kind == "message":
            for part in _get(item, "content", None) or []:
                for ann in _get(part, "annotations", None) or []:
                    if _get(ann, "type") == "url_citation":
                        add(_get(ann, "url"), _get(ann, "title", ""), "openai:citation")

    usage = _get(response, "usage")
    details = _get(usage, "input_tokens_details")
    return SearchResult(hits=hits, usage=SearchUsage(
        input_tokens=int(_get(usage, "input_tokens", 0) or 0),
        cached_tokens=int(_get(details, "cached_tokens", 0) or 0),
        output_tokens=int(_get(usage, "output_tokens", 0) or 0),
        search_calls=max(calls, 1),
    ))


class OpenAIWebSearchProvider:
    name = "openai"

    def __init__(self, *, api_key: str, model: str, client: Any = None, country: str = "US") -> None:
        if client is None:
            if not api_key:
                raise RuntimeError("RESEARCH_SEARCH_PROVIDER=openai needs OPENAI_RESEARCH_API_KEY or OPENAI_API_KEY")
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key)
        self.client = client
        self.model = model
        self.country = country

    async def search(self, query: str, *, site: str | None = None, limit: int = 10) -> SearchResult:
        tool: dict[str, Any] = {
            "type": "web_search",
            "search_context_size": "low",
            "user_location": {"type": "approximate", "country": self.country},
        }
        if site:
            tool["filters"] = {"allowed_domains": [site]}
        response = await self.client.responses.create(
            model=self.model,
            instructions=(
                "You are a search tool. Run a web search for the query and list the most relevant official "
                "pages (government agencies and the nonprofit providers' own sites) with their URLs. "
                "Do not answer from memory."
            ),
            input=f"Search query: {query}",
            tools=[tool],
            tool_choice="required",
            include=["web_search_call.action.sources"],
            reasoning={"effort": "low"},
            max_output_tokens=2000,
            store=False,
        )
        return parse_response(response, limit)
