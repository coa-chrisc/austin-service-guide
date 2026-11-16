"""The search interface the research pipeline uses, and hit ranking.

``SearchProvider.search(query, *, site=None, limit=10) -> list[SearchHit]``.
Two providers ship (``RESEARCH_SEARCH_PROVIDER``):

- ``searxng``: a private, self-hosted SearXNG (``SEARXNG_URL``). Queries stay
  on your infrastructure; no per-query fee; upstream engines can rate-limit
  server IPs.
- ``openai`` (alias ``openai_web_search``): the Responses API ``web_search``
  tool. Nothing to host; queries go to OpenAI; each search call has a fee.

Either way the pipeline fetches the pages itself for evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import urlsplit


@dataclass
class SearchHit:
    url: str
    title: str = ""
    snippet: str = ""
    engine: str = ""


@dataclass
class SearchUsage:
    """Cost-relevant usage a provider incurred (OpenAI only)."""

    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    search_calls: int = 0


@dataclass
class SearchResult:
    hits: list[SearchHit] = field(default_factory=list)
    usage: SearchUsage = field(default_factory=SearchUsage)
    # (engine, error) pairs for upstream engines that failed (SearXNG only).
    unresponsive: list[tuple[str, str]] = field(default_factory=list)


class SearchProvider(Protocol):
    name: str

    async def search(self, query: str, *, site: str | None = None, limit: int = 10) -> SearchResult: ...


def make_provider(settings) -> SearchProvider:  # noqa: ANN001 — JobSettings
    if settings.search_provider == "searxng":
        from app.research.providers.searxng import SearxngProvider

        if not settings.searxng_url:
            raise RuntimeError("RESEARCH_SEARCH_PROVIDER=searxng needs SEARXNG_URL")
        return SearxngProvider(settings.searxng_url)
    from app.research.providers.openai_search import OpenAIWebSearchProvider

    return OpenAIWebSearchProvider(
        api_key=settings.research_api_key,
        model=settings.openai_research_model,
    )


# ── The site: operator ───────────────────────────────────────────

_DOMAIN = r"((?:[a-z0-9-]{1,63}\.)+[a-z]{2,63})"
# Planner output seen in real runs: "site.example.gov food pantry".
_LEADING_SITE_DOT = re.compile(r"^site\." + _DOMAIN + r"(?=\s|$)", re.I)
_SITE = re.compile(r"(?:^|\s)site:" + _DOMAIN + r"(?=\s|$)", re.I)


def normalize_query(query: str) -> str:
    """Collapse whitespace and turn a leading ``site.<domain>`` token into
    ``site:<domain>``. Only a token naming a dotted domain is rewritten."""
    query = " ".join(str(query or "").split())
    return _LEADING_SITE_DOT.sub(lambda m: "site:" + m.group(1).lower(), query, count=1)


def split_site(query: str) -> tuple[str, str | None]:
    """``(query without its site: operator, domain or None)``.

    The domain goes to the provider as a filter (SearXNG re-adds the
    operator; OpenAI web search uses ``filters.allowed_domains``). Only the
    first operator is taken; one that is not a bare domain stays as text."""
    query = normalize_query(query)
    match = _SITE.search(query)
    if not match:
        return query, None
    rest = " ".join((query[:match.start()] + " " + query[match.end():]).split())
    return rest, match.group(1).lower().removeprefix("www.")


# ── Ranking ──────────────────────────────────────────────────────────

# Aggregators, people-search, social media, link farms, user-generated
# content: never fetched.
DENY_DOMAINS = {
    "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "linkedin.com", "youtube.com",
    "pinterest.com", "reddit.com", "nextdoor.com", "yelp.com", "yellowpages.com", "mapquest.com",
    "whitepages.com", "spokeo.com", "beenverified.com", "truepeoplesearch.com", "fastpeoplesearch.com",
    "radaris.com", "manta.com", "bbb.org", "chamberofcommerce.com", "superpages.com", "foursquare.com",
    "tripadvisor.com", "glassdoor.com", "indeed.com", "wikipedia.org", "quora.com", "medium.com",
    "foodpantries.org", "shelterlistings.org", "needhelppayingbills.com", "freefood.org", "homelessshelterdirectory.org",
    "findhelp.org", "auntbertha.com", "google.com", "bing.com", "duckduckgo.com", "amazon.com",
}


def host_of(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def domain_matches(host: str, domains: set[str] | list[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def keep_on_site(hits: list[SearchHit], site: str | None) -> tuple[list[SearchHit], int]:
    """``(hits on the site or a subdomain of it, number dropped)``.

    Upstream engines do not all honour ``site:`` (SearXNG's bing returned
    unrelated pages for it), so a site-restricted search is checked here."""
    if not site:
        return hits, 0
    kept = [h for h in hits if domain_matches(host_of(h.url), [site])]
    return kept, len(hits) - len(kept)


def rank(host: str, place_domains: list[str]) -> int:
    """Lower is better: .gov/.us, the place's own domains, .org, the rest."""
    if host.endswith(".gov") or host.endswith(".us") or host.endswith(".mil"):
        return 0
    if domain_matches(host, place_domains):
        return 1
    if host.endswith(".org") or host.endswith(".edu"):
        return 2
    return 3


def select_urls(
    hits: list[SearchHit],
    *,
    allowed_domains: list[str],
    place_domains: list[str],
    seed_urls: list[str],
    limit: int,
    per_host: int,
) -> tuple[list[str], list[dict]]:
    """Choose which pages to fetch. Returns (urls, skipped[{url, reason}])."""
    chosen: list[str] = []
    skipped: list[dict] = []
    seen: set[str] = set()
    candidates: list[tuple[int, int, str]] = []
    for i, url in enumerate(seed_urls):
        candidates.append((-1, i, url))
    for i, hit in enumerate(hits):
        host = host_of(hit.url)
        if not host or not hit.url.startswith(("http://", "https://")):
            continue
        if domain_matches(host, DENY_DOMAINS):
            skipped.append({"url": hit.url, "reason": "deny list"})
            continue
        if allowed_domains and not domain_matches(host, allowed_domains):
            skipped.append({"url": hit.url, "reason": "not on the allowlist"})
            continue
        candidates.append((rank(host, place_domains), i, hit.url))
    per: dict[str, int] = {}
    for _r, _i, url in sorted(candidates):
        key = url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        host = host_of(url)
        if per.get(host, 0) >= per_host:
            skipped.append({"url": url, "reason": "per-host page cap"})
            continue
        if len(chosen) >= limit:
            break
        per[host] = per.get(host, 0) + 1
        chosen.append(url)
    return chosen, skipped


