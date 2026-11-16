"""Plan step: the model proposes a coverage plan (category x jurisdiction
level -> search queries) and the place's likely official domains. The plan
is stored and shown; with RESEARCH_REQUIRE_PLAN_APPROVAL a reviewer approves
or trims it before any page is fetched."""

from __future__ import annotations

from typing import Any

from app.research.llm import Usage, obj, structured_call

LEVELS = ["city", "county", "state", "federal", "nonprofit"]


def place_label(place: dict) -> str:
    bits = [place.get("city"), place.get("county"), place.get("state")]
    return ", ".join(b for b in bits if b) + " (United States)"


def plan_schema(categories: list[str]) -> dict:
    return obj({
        "queries": {"type": "array", "items": obj({
            "query": {"type": "string"},
            "category": {"type": "string", "enum": categories},
            "level": {"type": "string", "enum": LEVELS},
            "rationale": {"type": "string"},
        })},
        "official_domains": {"type": "array", "items": {"type": "string"}},
        "expected_sources": {"type": "array", "items": {"type": "string"}},
    })


INSTRUCTIONS = (
    "You plan web research for a public-services directory. Staff will review every result; nothing is "
    "published automatically. Propose specific web search queries that find official pages of services "
    "residents of the place can use: government agencies and established nonprofits that state who they "
    "serve, where, when and how to contact them. Prefer queries that name the place. Do not include personal "
    "names. official_domains lists bare domains (example.gov) you expect for the place's city and county "
    "governments; expected_sources lists organisations or agencies you expect to find. Keep rationales short."
)


async def make_plan(client: Any, settings: Any, params: dict, categories: dict[str, str], max_queries: int) -> tuple[dict, Usage]:
    chosen = params.get("categories") or list(categories)
    levels = params.get("levels") or LEVELS
    topic = params.get("topic") or ""
    lines = [
        f"Place: {place_label(params['place'])}",
        f"Topic focus: {topic}" if topic else "Topic focus: none (cover the categories below)",
        "Categories (slug: name): " + "; ".join(f"{c}: {categories.get(c, c)}" for c in chosen),
        "Jurisdiction levels: " + ", ".join(levels),
        f"Propose at most {max_queries} queries in total, the most useful first.",
    ]
    data, usage = await structured_call(
        client,
        model=settings.openai_research_model,
        effort=settings.openai_research_reasoning_effort,
        instructions=INSTRUCTIONS,
        input_text="\n".join(lines),
        name="research_plan",
        schema=plan_schema(chosen),
        max_output_tokens=8000,
    )
    queries = [
        {k: str(q.get(k, ""))[:300] for k in ("query", "category", "level", "rationale")}
        for q in data.get("queries", [])
        if isinstance(q, dict) and q.get("query") and q.get("category") in chosen and q.get("level") in levels
    ][:max_queries]
    domains = [str(d).lower().strip().removeprefix("www.")[:100] for d in data.get("official_domains", []) if d][:20]
    sources = [str(s)[:200] for s in data.get("expected_sources", [])][:40]
    return {"queries": queries, "official_domains": domains, "expected_sources": sources}, usage
