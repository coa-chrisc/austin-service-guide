"""Optional model step (``IMPORT_USE_MODEL``, off by default).

Sends the reduced, filtered rows in batches to the Responses API with no tools
and a strict JSON schema, and asks for four things code could not decide:
hours as a day map, a combined address split into parts, category slugs from
the pack's list, and eligibility gates from the closed vocabulary. Every
accepted value is marked as a suggestion on the draft.

What the model receives per row: a row reference, the service and provider
names, description, eligibility and cost text, the hours text and the
unsplit address, all after the column and value filters and after the
resident-PII redaction in ``app/services/pii.py``. It never receives phone
numbers, emails, websites, the file name or any dropped column.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import weakref
from dataclasses import dataclass, field
from typing import Any

from app.config import Settings
from app.services.ai import _openai_client
from app.services.hours import _parse_range
from app.services.partner_import.hours_text import DAYS
from app.services.partner_import.to_drafts import RowDraft
from app.services.partner_import.vocab import STATE_CODES
from app.services.pii import PLACEHOLDERS, redact

log = logging.getLogger(__name__)

GATES = ["veteran", "homeless_or_unstable_housing", "refugee_or_immigrant", "disability", "older_adult",
         "older_adult_or_disability", "has_children", "youth", "other_criteria"]
BATCH_ROWS = 25
# Model batches in flight across all imports in this process (not per request).
CONCURRENCY = 4
# The inline (in-request) path stops here; larger lists need the worker (#18).
INLINE_MAX_ROWS = 200
OUTPUT_TOKENS_PER_ROW = 250
# The per-call output ceiling (reasoning tokens count against it too).
MAX_OUTPUT_TOKENS = OUTPUT_TOKENS_PER_ROW * BATCH_ROWS + 4000
REASONING_EFFORT = "low"
# Prices for the worst-case cost check, not billing: set these to your contract's prices.
USD_PER_MTOK_INPUT = 5.0
USD_PER_MTOK_OUTPUT = 40.0

# One semaphore per event loop (in practice one per process), shared by every request.
_GATES: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = weakref.WeakKeyDictionary()


def _batch_gate() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    gate = _GATES.get(loop)
    if gate is None:
        gate = _GATES[loop] = asyncio.Semaphore(CONCURRENCY)
    return gate
_ZIP_RE = re.compile(r"\d{5}(-\d{4})?")
_ADDRESS_KINDS = tuple(k for k in PLACEHOLDERS if k != "address")

INSTRUCTIONS = (
    "You normalise rows from an agency's partner list into catalog fields. You receive JSON rows. "
    "For each row return one object with the same ref.\n"
    "- hours: only when hours_text is given. A map of monday..sunday to 'H:MM AM - H:MM PM' for days it is open, "
    "'Open 24 hours' when it is open all day, or null when closed or not stated. One range per day; for a split "
    "day give the outer range. Return null for hours when hours_text is empty or cannot be read.\n"
    "- address: only when address_text is given. Split it into street, city, two-letter state and ZIP; null when "
    "it cannot be split.\n"
    "- categories: up to 3 slugs from the allowed list that describe the service; empty when unsure.\n"
    "- eligibility_requires: gates from the allowed list only when the text clearly restricts who can use the "
    "service; 'open to all, priority for X' is not a gate. Empty when unsure.\n"
    "Use only facts in the row. Never invent phone numbers, names or addresses."
)


@dataclass
class ModelOutcome:
    used: bool = False
    note: str = ""
    rows_sent: int = 0
    estimated_usd: float = 0.0
    applied: dict[int, list[str]] = field(default_factory=dict)


def _schema(category_slugs: list[str]) -> dict[str, Any]:
    nullable_str = {"type": ["string", "null"]}
    hours = {
        "type": "object", "additionalProperties": False, "required": DAYS,
        "properties": {d: nullable_str for d in DAYS},
    }
    address = {
        "type": "object", "additionalProperties": False, "required": ["street", "city", "state", "zip_code"],
        "properties": {k: nullable_str for k in ("street", "city", "state", "zip_code")},
    }
    row = {
        "type": "object", "additionalProperties": False,
        "required": ["ref", "hours", "address", "categories", "eligibility_requires"],
        "properties": {
            "ref": {"type": "string"},
            "hours": {"anyOf": [hours, {"type": "null"}]},
            "address": {"anyOf": [address, {"type": "null"}]},
            "categories": {"type": "array", "items": {"type": "string", "enum": category_slugs or ["none"]}},
            "eligibility_requires": {"type": "array", "items": {"type": "string", "enum": GATES}},
        },
    }
    return {"type": "object", "additionalProperties": False, "required": ["rows"],
            "properties": {"rows": {"type": "array", "items": row}}}


def row_payload(draft: RowDraft) -> dict[str, str]:
    """What the model sees for one row: redacted text fields, no contact details."""
    svc = draft.service

    def clean(text: str) -> str:
        return redact(text or "").text

    return {
        "ref": str(draft.row),
        "name": clean(svc.get("name", "")),
        "provider_name": clean(svc.get("provider_name", "")),
        "description": clean(svc.get("description", "")),
        "eligibility": clean(svc.get("eligibility_summary", "")) if "eligibility_summary" not in draft.suggestions else "",
        "cost": clean(svc.get("cost", "")),
        "category_text": clean(draft.category_text),
        "hours_text": clean(draft.hours_text) if not draft.hours_confident else "",
        "address_text": redact(draft.address_text, kinds=_ADDRESS_KINDS).text if draft.address_text else "",
    }


def estimate_usd(batches: list[str], schema: dict) -> float:
    """Worst-case cost: every call uses its full output ceiling, and input is
    counted at one token per character (an upper bound for any script)."""
    fixed = len(INSTRUCTIONS) + len(json.dumps(schema))
    tokens_in = sum(fixed + len(b) for b in batches)
    tokens_out = len(batches) * MAX_OUTPUT_TOKENS
    return tokens_in / 1e6 * USD_PER_MTOK_INPUT + tokens_out / 1e6 * USD_PER_MTOK_OUTPUT


async def suggest(rows: list[RowDraft], category_slugs: list[str], settings: Settings) -> ModelOutcome:
    outcome = ModelOutcome()
    if len(rows) > INLINE_MAX_ROWS:
        outcome.note = (f"The model step was skipped: {len(rows)} rows is over the in-request limit of "
                        f"{INLINE_MAX_ROWS}. Import a shorter list, or run it with a background worker.")
        return outcome
    schema = _schema(category_slugs)
    by_ref = {str(r.row): r for r in rows}
    payloads = [row_payload(r) for r in rows]
    batches = [json.dumps({"allowed_categories": category_slugs, "rows": payloads[i:i + BATCH_ROWS]}, ensure_ascii=False)
               for i in range(0, len(payloads), BATCH_ROWS)]
    outcome.estimated_usd = round(estimate_usd(batches, schema), 4)
    if outcome.estimated_usd > settings.import_max_cost_usd:
        outcome.note = (f"The model step was skipped: its worst-case cost (${outcome.estimated_usd:.2f}) is over "
                        f"IMPORT_MAX_COST_USD (${settings.import_max_cost_usd:.2f}).")
        return outcome

    client = _openai_client()
    gate = _batch_gate()

    async def run(batch: str) -> list[dict]:
        async with gate:
            response = await client.responses.create(
                model=settings.openai_model,
                instructions=INSTRUCTIONS,
                input=[{"role": "user", "content": batch}],
                reasoning={"effort": REASONING_EFFORT},
                text={"format": {"type": "json_schema", "name": "partner_rows", "strict": True, "schema": schema}},
                max_output_tokens=MAX_OUTPUT_TOKENS,
                store=False,
            )
            data = json.loads(response.output_text or "{}")
            return data.get("rows", []) if isinstance(data, dict) else []

    results = await asyncio.gather(*(run(b) for b in batches), return_exceptions=True)
    failed = 0
    for result in results:
        if isinstance(result, BaseException):
            failed += 1
            continue
        for item in result:
            draft = by_ref.get(str(item.get("ref"))) if isinstance(item, dict) else None
            if draft is not None:
                applied = _apply(draft, item, set(category_slugs))
                if applied:
                    outcome.applied[draft.row] = applied
    if failed:
        log.warning("partner import model step: %d of %d batches failed", failed, len(batches))
    outcome.used = failed < len(batches)
    outcome.rows_sent = len(rows)
    outcome.note = (f"The model suggested values for {len(outcome.applied)} of {len(rows)} rows."
                    + (f" {failed} batch(es) failed; those rows have code-only drafts." if failed else ""))
    return outcome


def _apply(draft: RowDraft, item: dict, category_slugs: set[str]) -> list[str]:
    applied: list[str] = []
    loc = draft.location
    hours = item.get("hours")
    if loc is not None and draft.hours_text and not draft.hours_confident and isinstance(hours, dict):
        clean = {d: v.strip() for d, v in hours.items()
                 if d in DAYS and isinstance(v, str) and v.strip() and _parse_range(v.strip()) is not None}
        if clean:
            loc["hours"] = clean
            draft.suggestions.add("locations/0/hours")
            draft.flags.pop("hours_unparsed", None)
            applied.append("hours")
    address = item.get("address")
    if loc is not None and draft.address_text and isinstance(address, dict):
        parts = {k: (address.get(k) or "").strip() for k in ("street", "city", "state", "zip_code")}
        if (parts["street"] and parts["city"] and parts["state"] in STATE_CODES
                and _ZIP_RE.fullmatch(parts["zip_code"])):
            loc.update({"address": parts["street"][:300], "city": parts["city"][:100],
                        "state": parts["state"], "zip_code": parts["zip_code"]})
            draft.suggestions.update({f"locations/0/{k}" for k in ("address", "city", "state", "zip_code")})
            draft.flags.pop("address_unsplit", None)
            draft.flags.pop("state_assumed", None)
            applied.append("address")
    cats = [c for c in item.get("categories") or [] if c in category_slugs][:3]
    if cats and not draft.service.get("categories"):
        draft.service["categories"] = list(dict.fromkeys(cats))
        draft.suggestions.add("categories")
        draft.flags.pop("category_missing", None)
        applied.append("categories")
    gates = [g for g in item.get("eligibility_requires") or [] if g in GATES]
    if gates:
        draft.service["eligibility_requires"] = list(dict.fromkeys(gates))
        draft.suggestions.add("eligibility_requires")
        applied.append("eligibility_requires")
    if applied:
        draft.flag("model_suggested")
    return applied
