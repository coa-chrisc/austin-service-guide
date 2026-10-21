"""Resident plan: ordered next steps built from the matched services.

Computed in the request that asks for it (POST /api/v1/intake/plan) and
returned to the browser to keep; nothing is cached on the server.
"""

from __future__ import annotations

import json
import logging

from app.config import get_settings
from app.models import IntakePlan, IntakeSession, MessageRole, PlanItem
from app.services.grounding import ground_service_ids
from app.services.matching import recommend_application_order

log = logging.getLogger(__name__)


def rules_plan(session: IntakeSession) -> IntakePlan:
    """Deterministic plan from the rules sequencer (no model call)."""
    if not session.matches:
        return IntakePlan()
    items = recommend_application_order(session.matches, session.extracted_profile)
    return IntakePlan(items=[PlanItem(**item) for item in items[:20]])


async def build_application_order(session: IntakeSession) -> IntakePlan:
    """Use the model to rank matches and write per-item reasons.

    Hands the model the recent conversation, the resident's extracted
    profile, and the candidate matches that the rules engine surfaced.
    The model picks 3–5, ranks them, and writes a per-item reason that
    cites the resident's actual words. Falls back to the deterministic
    rules sequencer if live AI is off, the call fails, or the output
    cannot be parsed.

    Service ids the model returns are grounded against the catalog and
    restricted to the candidate list; names and slugs come from the catalog.
    """
    matches = session.matches
    if not matches:
        return IntakePlan()

    settings = get_settings()

    def fallback() -> IntakePlan:
        return rules_plan(session)

    if not settings.use_live_ai:
        return fallback()

    profile = session.extracted_profile
    profile_lines = []
    if profile.immediate_needs:
        profile_lines.append(f"Stated needs: {', '.join(profile.immediate_needs)}")
    if profile.zip_code:
        profile_lines.append(f"Zip: {profile.zip_code}")
    if profile.housing_situation:
        profile_lines.append(f"Housing: {profile.housing_situation}")
    if profile.employment_status:
        profile_lines.append(f"Employment: {profile.employment_status}")
    if profile.income_bracket:
        profile_lines.append(f"Income: {profile.income_bracket}")
    if profile.insurance_status:
        profile_lines.append(f"Insurance: {profile.insurance_status}")
    if profile.has_children:
        profile_lines.append("Has children")
    if profile.veteran_status:
        profile_lines.append("Veteran")
    if profile.has_disability:
        profile_lines.append("Has disability")
    if profile.crisis_indicators:
        profile_lines.append(f"Crisis flags: {', '.join(profile.crisis_indicators)}")

    transcript_lines = []
    for m in session.conversation[-12:]:
        role = "Resident" if m.role == MessageRole.user else "Assistant"
        text = (m.content or "").strip().replace("\n", " ")
        if text:
            transcript_lines.append(f"{role}: {text[:400]}")

    candidate_lines = []
    by_id = {m.service.id: m for m in matches}
    for m in matches[:12]:
        svc = m.service
        primary_cat = svc.categories[0] if svc.categories else "other"
        summary = (svc.description or "").strip().replace("\n", " ")[:180]
        candidate_lines.append(
            f"- id={svc.id} | slug={svc.slug} | {svc.name} "
            f"({primary_cat}; cats={','.join(svc.categories)}; "
            f"score={m.match_score}) — {summary}"
        )

    prompt = (
        "You are sequencing the resident's next steps. From the candidate "
        "services below, pick 3–5, ordered by what this resident should "
        "do FIRST given what they actually said. Write one short reason "
        "per pick that ties back to the resident's own words or situation "
        "— do not use generic templates. Prioritize the urgent presenting "
        "concern over downstream coverage/insurance unless the resident "
        "explicitly asked about coverage.\n\n"
        "Then write a 1–2 sentence 'why this order' summary the resident "
        "will read at the top of their plan.\n\n"
        "Respond with JSON ONLY in this exact shape:\n"
        '{"summary": "<1-2 sentences>", "items": [{"service_id": "<id>", '
        '"reason": "<one short sentence>"}, ...]}\n'
        "Use service_id values exactly as listed. Order items by what to "
        "do first. Do not include any service_id not in the candidate list.\n\n"
        f"=== Resident profile ===\n{chr(10).join(profile_lines) or '(no profile fields yet)'}\n\n"
        f"=== Recent conversation ===\n{chr(10).join(transcript_lines) or '(no transcript)'}\n\n"
        f"=== Candidate services ===\n{chr(10).join(candidate_lines)}\n"
    )

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.responses.create(
            model=settings.openai_model,
            input=[{"role": "user", "content": prompt}],
            reasoning={"effort": settings.openai_reasoning_effort},
            text={"format": {"type": "json_object"}},
            max_output_tokens=2000,
            store=False,
        )
        raw = (response.output_text or "").strip()
        if not raw:
            return fallback()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("build_application_order: model returned non-JSON")
            return fallback()

        if not isinstance(data, dict):
            return fallback()
        items_in = data.get("items") if isinstance(data.get("items"), list) else []
        summary = str(data.get("summary") or "").strip()[:1200]
        grounded = set(ground_service_ids(
            (entry or {}).get("service_id") for entry in items_in if isinstance(entry, dict)
        ))

        seen: set[str] = set()
        items_out: list[dict] = []
        rank = 1
        for entry in items_in:
            if not isinstance(entry, dict):
                continue
            sid = entry.get("service_id")
            reason = str(entry.get("reason") or "").strip()[:600]
            match = by_id.get(sid) if sid in grounded else None
            if not match or sid in seen or not reason:
                continue
            seen.add(sid)
            svc = match.service
            primary_cat = svc.categories[0] if svc.categories else "other"
            items_out.append(PlanItem(
                rank=rank,
                service_id=svc.id,
                service_slug=svc.slug,
                service_name=svc.name,
                category=primary_cat[:64],
                reason=reason,
            ))
            rank += 1
            if rank > 5:
                break

        if not items_out:
            return fallback()

        return IntakePlan(summary=summary, items=items_out, ai_generated=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("build_application_order failed (%s); using rules fallback", type(exc).__name__)
        return fallback()
