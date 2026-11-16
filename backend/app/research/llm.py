"""Structured-output Responses API calls for research, with usage and cost.

Every call passes ``store=False`` (which is not zero data retention).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass
class Usage:
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    search_calls: int = 0

    def add(self, other: "Usage") -> None:
        self.input_tokens += other.input_tokens
        self.cached_tokens += other.cached_tokens
        self.output_tokens += other.output_tokens
        self.search_calls += other.search_calls


def cost_usd(usage: Usage, settings: Any) -> float:
    """List-price estimate from usage (prices are settings; check them)."""
    uncached = max(usage.input_tokens - usage.cached_tokens, 0)
    return round(
        uncached / 1e6 * settings.research_price_input_per_m
        + usage.cached_tokens / 1e6 * settings.research_price_cached_input_per_m
        + usage.output_tokens / 1e6 * settings.research_price_output_per_m
        + usage.search_calls * settings.research_price_web_search_call,
        6,
    )


def usage_of(response: Any) -> Usage:
    usage = getattr(response, "usage", None)
    details = getattr(usage, "input_tokens_details", None)
    return Usage(
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        cached_tokens=int(getattr(details, "cached_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
    )


class ModelOutputError(RuntimeError):
    pass


async def structured_call(
    client: Any,
    *,
    model: str,
    effort: str,
    instructions: str,
    input_text: str,
    name: str,
    schema: dict,
    max_output_tokens: int,
) -> tuple[dict, Usage]:
    """One Responses call with a strict JSON schema and no tools."""
    response = await client.responses.create(
        model=model,
        instructions=instructions,
        input=input_text,
        reasoning={"effort": effort},
        text={"format": {"type": "json_schema", "name": name, "schema": schema, "strict": True}},
        max_output_tokens=max_output_tokens,
        store=False,
    )
    usage = usage_of(response)
    text = getattr(response, "output_text", "") or ""
    try:
        data = json.loads(text)
    except ValueError as exc:
        status = getattr(response, "status", "")
        raise ModelOutputError(f"model output was not JSON (status {status})") from exc
    if not isinstance(data, dict):
        raise ModelOutputError("model output was not an object")
    return data, usage


def nullable(schema: dict) -> dict:
    """Strict mode has no optional keys: optional means nullable."""
    out = dict(schema)
    t = out.get("type")
    if isinstance(t, str):
        out["type"] = [t, "null"]
    if "enum" in out:
        out["enum"] = [*out["enum"], None]
    return out


def obj(properties: dict) -> dict:
    return {"type": "object", "additionalProperties": False, "properties": properties, "required": list(properties)}
