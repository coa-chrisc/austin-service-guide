"""Convert between the client-held ``IntakeState`` and a per-request session.

The browser owns the intake state and sends it with every request. Treat
it as untrusted: by the time it reaches here it has passed schema
validation (sizes, roles, profile fields). This module then

- re-runs PII redaction on every message (full rules for resident turns,
  the catalog-safe subset for assistant turns),
- grounds matched service ids and plan items against the catalog, re-reading
  names and slugs from the catalog rather than trusting the client,
- derives the scenario/persona prompt note from ``entry_source`` on the
  server, and recomputes risk flags from the profile.

``state_from_session`` bounds the outgoing state to the same limits so a
round trip always validates.
"""

from __future__ import annotations

import re

from app.models import (
    MAX_BUTTON_CHARS,
    MAX_BUTTONS,
    MAX_MATCHED_IDS,
    MAX_MESSAGE_CHARS,
    MAX_PROFILE_LIST,
    MAX_PROFILE_LIST_ITEM,
    MAX_PROFILE_TEXT,
    MAX_SCHOOL_CHILDREN,
    MAX_STATE_MESSAGES,
    IntakeMessage,
    IntakePlan,
    IntakeSession,
    IntakeState,
    IntakeStatus,
    MessageRole,
    PlanItem,
    ResidentProfile,
    SchoolAgeChild,
    ServiceMatch,
    StateMessage,
)
from app.services import catalog
from app.services.grounding import ground_service_ids
from app.services.life_events import life_event_context
from app.services.matching import assess_risks, match_services
from app.services.pii import ASSISTANT_KINDS, redact

_LANGUAGE_RE = re.compile(r"^[a-z]{2,3}(-[a-z0-9]{2,8})?$")
_FALLBACK_REASONING = "Potential match based on profile"


def normalize_language(code: str | None, default: str = "en") -> str:
    """Lower-cased language tag, or ``default`` when it isn't one."""
    value = (code or "").strip().lower()
    return value if _LANGUAGE_RE.match(value) else default


def persona_note_for(entry_source: str) -> str:
    """Prompt note for a life-event or persona entry, derived server-side."""
    if entry_source.startswith("life-event:"):
        return life_event_context(entry_source[len("life-event:"):])
    if entry_source.startswith("persona:"):
        from app.services.personas import get_persona

        persona = get_persona(entry_source[len("persona:"):])
        return persona.persona_note if persona else ""
    return ""


def hydrate_matches(profile: ResidentProfile, service_ids: list[str]) -> list[ServiceMatch]:
    """Catalog ``ServiceMatch`` objects for grounded ids, in the given order.

    Confidence and reasoning come from the rules engine for the profile;
    an id the engine no longer ranks gets a neutral low-confidence entry.
    """
    ids = ground_service_ids(service_ids)
    if not ids:
        return []
    ranked = {m.service.id: m for m in match_services(profile)}
    matches: list[ServiceMatch] = []
    for sid in ids:
        match = ranked.get(sid)
        if match is None:
            service = catalog.get_service_by_id(sid)
            if service is None:
                continue
            match = ServiceMatch(
                service=service,
                match_confidence="low",
                match_reasoning=_FALLBACK_REASONING,
            )
        matches.append(match)
    return matches


def _redact_message(role: str, text: str) -> str:
    if role == "user":
        return redact(text).text
    return redact(text, kinds=ASSISTANT_KINDS, keep=catalog.get_service_emails()).text


def _redact_profile(profile: ResidentProfile) -> ResidentProfile:
    """Run the resident redaction rules over every free-text profile value."""
    data = profile.model_dump()
    for key, value in data.items():
        if isinstance(value, str) and value:
            data[key] = redact(value).text
        elif key == "school_age_children":
            for child in value:
                child["grade"] = redact(child["grade"]).text
                child["district"] = redact(child["district"]).text
                child["concerns"] = [redact(c).text for c in child["concerns"]]
        elif isinstance(value, list):
            data[key] = [redact(v).text if isinstance(v, str) else v for v in value]
    return ResidentProfile.model_validate(data)


def _ground_plan(plan: IntakePlan | None, matched_ids: set[str]) -> IntakePlan | None:
    """Keep plan items that name a matched catalog service; names from the catalog."""
    if plan is None:
        return None
    allowed = set(ground_service_ids(item.service_id for item in plan.items)) & matched_ids
    items: list[PlanItem] = []
    for source in plan.items:
        service = (
            catalog.get_service_by_id(source.service_id)
            or catalog.get_service_by_slug(source.service_id)
        )
        if service is None or service.id not in allowed:
            continue
        allowed.discard(service.id)
        category = source.category
        if category not in service.categories and category != "other":
            category = service.categories[0] if service.categories else "other"
        items.append(PlanItem(
            rank=len(items) + 1,
            service_id=service.id,
            service_slug=service.slug,
            service_name=service.name[:300],
            category=category[:64],
            reason=redact(source.reason, kinds=ASSISTANT_KINDS).text[:600],
        ))
    summary = redact(plan.summary, kinds=ASSISTANT_KINDS).text[:1200]
    return IntakePlan(summary=summary, items=items, ai_generated=plan.ai_generated)


def session_from_state(state: IntakeState) -> IntakeSession:
    """Build the per-request working session from validated client state."""
    profile = _redact_profile(state.profile)
    conversation = [
        IntakeMessage(
            role=MessageRole(msg.role),
            content=_redact_message(msg.role, msg.content),
            suggested_buttons=list(msg.suggested_buttons),
            progress_percent=msg.progress_percent,
            is_complete=msg.is_complete,
            crisis_detected=msg.crisis_detected,
        )
        for msg in state.conversation
    ]
    status = IntakeStatus(state.status)
    matches = hydrate_matches(profile, list(state.matched_service_ids))
    return IntakeSession(
        language=normalize_language(state.language),
        conversation=conversation,
        extracted_profile=profile,
        status=status,
        matches=matches,
        risk_flags=assess_risks(profile) if status == IntakeStatus.completed else [],
        entry_source=state.entry_source,
        persona_note=persona_note_for(state.entry_source),
        scripted_turns_skipped=state.scripted_turns_skipped,
        plan=_ground_plan(state.plan, {m.service.id for m in matches}),
    )


def _clip(value: str, limit: int) -> str:
    return value[:limit]


def _bounded_profile(profile: ResidentProfile) -> ResidentProfile:
    data = profile.model_dump()
    for key, value in data.items():
        if isinstance(value, str):
            data[key] = _clip(value, MAX_PROFILE_TEXT)
        elif key == "school_age_children":
            data[key] = [
                SchoolAgeChild(
                    grade=_clip(child["grade"], MAX_PROFILE_LIST_ITEM),
                    district=_clip(child["district"], MAX_PROFILE_LIST_ITEM),
                    concerns=[_clip(c, MAX_PROFILE_LIST_ITEM) for c in child["concerns"]][:MAX_PROFILE_LIST],
                ).model_dump()
                for child in value[:MAX_SCHOOL_CHILDREN]
            ]
        elif isinstance(value, list):
            # Keep the most recent entries (e.g. repeated crisis indicators).
            data[key] = [
                _clip(v, MAX_PROFILE_LIST_ITEM) if isinstance(v, str) else v
                for v in value[-MAX_PROFILE_LIST:]
            ]
    if data["household_size"] is not None:
        data["household_size"] = max(0, min(50, int(data["household_size"])))
    return ResidentProfile.model_validate(data)


def _state_message(msg: IntakeMessage) -> StateMessage:
    return StateMessage(
        role=msg.role.value,
        content=_clip(msg.content, MAX_MESSAGE_CHARS),
        suggested_buttons=[_clip(b, MAX_BUTTON_CHARS) for b in msg.suggested_buttons[:MAX_BUTTONS]],
        progress_percent=max(0, min(100, msg.progress_percent)),
        is_complete=msg.is_complete,
        crisis_detected=msg.crisis_detected,
    )


def state_from_session(session: IntakeSession) -> IntakeState:
    """Serialize the working session back into bounded client state."""
    visible = [m for m in session.conversation if m.role in (MessageRole.user, MessageRole.assistant)]
    return IntakeState(
        language=normalize_language(session.language),
        status=session.status.value,
        conversation=[_state_message(m) for m in visible[-MAX_STATE_MESSAGES:]],
        profile=_bounded_profile(session.extracted_profile),
        entry_source=session.entry_source,
        scripted_turns_skipped=max(-50, min(MAX_STATE_MESSAGES, session.scripted_turns_skipped)),
        matched_service_ids=[m.service.id for m in session.matches][:MAX_MATCHED_IDS],
        plan=session.plan,
    )
