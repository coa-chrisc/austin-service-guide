"""Crisis precedence: detection, marking the session, the crisis reply, the plan lead.

A crisis found anywhere puts the crisis lines in front of the resident:

- a resident turn (typed, on-device voice, or a raw-audio transcript) that
  matches a phrase in ``crisis_phrases`` gets the scripted crisis reply
  (``crisis_turn``) before any model call, in live and scripted mode alike;
- the model calling ``get_crisis_resources``, or setting
  ``crisis_indicators`` through ``extract_profile``, marks the session the
  same way (``record_model_crisis``) and the reply carries the lines
  (``ensure_crisis_lines``);
- every plan, model-ordered or rules-ordered, leads with the crisis-direct
  services for the profile's crisis indicators (``lead_with_crisis``).

The crisis lines themselves come from code (988, 9-1-1, the National DV
Hotline) and the data pack's local lines; nothing here calls the model.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from functools import lru_cache

from app.models import (
    IntakeMessage,
    IntakePlan,
    IntakeSession,
    MessageRole,
    PlanItem,
    ResidentProfile,
    Service,
)
from app.services import catalog
from app.services.catalog_loader import local_crisis_lines
from app.services.crisis_phrases import (
    ACCENT_FOLDED,
    ACUTE_KINDS,
    COUNSELOR_REQUESTS,
    CRISIS_REPORTED,
    DANGER_NOT_FOLLOWED_BY,
    IMMEDIATE_DANGER,
    PHRASES,
    SAFETY_KINDS,
    WORD_BOUNDED,
)

#: IntakePlan.items holds at most this many steps.
MAX_PLAN_ITEMS = 20

# ── Matching ─────────────────────────────────────────────────────────

_DROP_AND_SPACE = str.maketrans({
    "'": None, "’": None, "‘": None, "ʼ": None,
    "-": " ", "‐": " ",
})
_ARABIC_FOLD = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ة": "ه", "ى": "ي", "ـ": None,
})
_ARABIC_MARKS_RE = re.compile("[ً-ٰٟ]")


def normalize(text: str, *, fold_accents: bool = False) -> str:
    """The form both phrases and resident text are matched in.

    NFKC, case-folded, apostrophes dropped, hyphens as spaces, Arabic letter
    variants folded, whitespace collapsed; with ``fold_accents`` also every
    combining mark removed (only used for en/es/fr matching).
    """
    t = unicodedata.normalize("NFKC", text).casefold().translate(_DROP_AND_SPACE)
    if fold_accents:
        t = unicodedata.normalize(
            "NFC",
            "".join(c for c in unicodedata.normalize("NFD", t) if not unicodedata.combining(c)),
        )
    t = _ARABIC_MARKS_RE.sub("", t.translate(_ARABIC_FOLD))
    return " ".join(t.split())


def _expand(phrases: Iterable[str], who: Iterable[str]) -> list[str]:
    out: list[str] = []
    for phrase in phrases:
        if "{who}" in phrase:
            out.extend(phrase.replace("{who}", w) for w in who)
        else:
            out.append(phrase)
    return out


@lru_cache(maxsize=1)
def _matchers() -> tuple[tuple[str, str, re.Pattern[str]], ...]:
    """(language, kind, compiled pattern) for every phrase list."""
    out: list[tuple[str, str, re.Pattern[str]]] = []
    for lang, table in PHRASES.items():
        fold = lang in ACCENT_FOLDED
        who = table.get("who", ())
        for kind in ACUTE_KINDS:
            phrases = {normalize(p, fold_accents=fold) for p in _expand(table.get(kind, ()), who)}
            if not phrases:
                continue
            body = "|".join(re.escape(p) for p in sorted(phrases, key=len, reverse=True))
            if lang in WORD_BOUNDED:
                pattern = rf"(?<!\w)(?:{body})(?!\w)"
                guard = DANGER_NOT_FOLLOWED_BY.get(lang)
                if kind == IMMEDIATE_DANGER and guard:
                    pattern += rf"(?! {re.escape(guard)}(?!\w))"
            else:
                pattern = f"(?:{body})"
            out.append((lang, kind, re.compile(pattern)))
    return tuple(out)


def scan(text: str) -> list[tuple[str, str]]:
    """Every (kind, language) whose phrase list matches ``text``."""
    plain = normalize(text)
    folded = normalize(text, fold_accents=True)
    return [
        (kind, lang)
        for lang, kind, pattern in _matchers()
        if pattern.search(folded if lang in ACCENT_FOLDED else plain)
    ]


def detect_crisis(text: str) -> list[str]:
    """Crisis kinds stated in ``text``, most urgent first; empty when none."""
    found = {kind for kind, _ in scan(text)}
    return [kind for kind in ACUTE_KINDS if kind in found]


def _is_counselor_request(text: str) -> bool:
    t = normalize(text, fold_accents=True)
    return any(t == normalize(b, fold_accents=True) for b in COUNSELOR_REQUESTS)


# ── Session state ────────────────────────────────────────────────────

def mark_crisis(profile: ResidentProfile, kinds: Iterable[str]) -> None:
    """Add crisis indicators to the profile, once each, in order."""
    for kind in kinds:
        if kind not in profile.crisis_indicators:
            profile.crisis_indicators.append(kind)


def safety_kinds(profile: ResidentProfile) -> list[str]:
    """The profile's crisis indicators that call for the crisis lines."""
    return [k for k in profile.crisis_indicators if k in SAFETY_KINDS]


def record_model_crisis(session: IntakeSession, values: object, *, reported: bool = False) -> bool:
    """Mark the session for a crisis the model reported through a tool.

    ``values`` is the model's kind (a string) or kinds (a list); anything
    that is not an acute kind is ignored. ``reported`` means the model
    asked for the crisis lines, so the session is marked even when it gave
    no usable kind. Returns whether the session is now marked by this call.
    """
    items = values if isinstance(values, list) else [values]
    kinds = [k for k in ACUTE_KINDS if k in items]
    if not kinds and reported:
        kinds = [CRISIS_REPORTED]
    mark_crisis(session.extracted_profile, kinds)
    return bool(kinds)


# ── The crisis reply ─────────────────────────────────────────────────

_TEXT = {
    "en": {
        "danger_first": "**If you are in immediate danger, call 9-1-1 now.**",
        "opening": "I hear you, and I want you to know that help is available right now.",
        "danger": "**If you are in immediate danger, call 9-1-1.**",
        "lines_intro": "Here are crisis resources available 24/7:",
        "988": "- **988 Suicide & Crisis Lifeline** — Call or text **988**",
        "dv": "- **National DV Hotline** — **1-800-799-7233**",
        "closing": (
            "You don't have to go through this alone. Would you like to continue "
            "finding services, or would you prefer to connect with a crisis counselor?"
        ),
        "buttons": ["Connect with crisis counselor", "Continue finding services"],
        "footer_intro": "If you are in immediate danger, call **9-1-1**. Crisis lines, 24/7:",
    },
    "es": {
        "danger_first": "**Si estás en peligro inmediato, llama al 9-1-1 ahora.**",
        "opening": "Te escucho, y quiero que sepas que hay ayuda disponible ahora mismo.",
        "danger": "**Si estás en peligro inmediato, llama al 9-1-1.**",
        "lines_intro": "Estos recursos de crisis están disponibles las 24 horas:",
        "988": (
            "- **988 Línea de Prevención del Suicidio y Crisis** — Llama o envía "
            "un mensaje de texto al **988** (oprime 2 para español)"
        ),
        "dv": "- **Línea Nacional contra la Violencia Doméstica** — **1-800-799-7233**",
        "closing": (
            "No tienes que pasar por esto a solas. ¿Quieres seguir buscando "
            "servicios o prefieres hablar con un consejero de crisis?"
        ),
        "buttons": ["Hablar con un consejero de crisis", "Seguir buscando servicios"],
        "footer_intro": "Si estás en peligro inmediato, llama al **9-1-1**. Líneas de crisis, 24 horas:",
    },
}


def _reply_language(session: IntakeSession, hit_langs: Iterable[str] = ()) -> str:
    """Spanish for a Spanish session or a Spanish-only phrase hit; else English."""
    langs = set(hit_langs)
    if (session.language or "").split("-")[0] == "es" or ("es" in langs and "en" not in langs):
        return "es"
    return "en"


def _line_items(lang: str) -> list[str]:
    t = _TEXT[lang]
    local = local_crisis_lines("mental_health") + local_crisis_lines("domestic_violence")
    return [t["988"], *(f"- **{r.name}** — **{r.phone}**" for r in local), t["dv"]]


def crisis_response(
    session: IntakeSession,
    kinds: Iterable[str] = (),
    lang: str | None = None,
) -> IntakeMessage:
    """Append and return the scripted crisis reply with every crisis line."""
    lang = lang or _reply_language(session)
    t = _TEXT[lang]
    danger = IMMEDIATE_DANGER in set(kinds)
    parts = [t["danger_first"], t["opening"]] if danger else [t["opening"], t["danger"]]
    content = "\n\n".join([*parts, t["lines_intro"], "\n".join(_line_items(lang)), t["closing"]])
    msg = IntakeMessage(
        role=MessageRole.assistant,
        content=content,
        crisis_detected=True,
        suggested_buttons=list(t["buttons"]),
        progress_percent=0,
    )
    session.conversation.append(msg)
    return msg


def crisis_turn(session: IntakeSession, text: str) -> IntakeMessage | None:
    """The crisis reply for a resident turn that states a crisis, else None.

    Marks the profile with every kind found. Tapping the crisis message's
    "connect with a counselor" button shows the lines again.
    """
    hits = scan(text)
    kinds = [k for k in ACUTE_KINDS if any(kind == k for kind, _ in hits)]
    if not kinds:
        if not _is_counselor_request(text):
            return None
        kinds = safety_kinds(session.extracted_profile) or [CRISIS_REPORTED]
    mark_crisis(session.extracted_profile, kinds)
    lang = _reply_language(session, (lang for _, lang in hits))
    return crisis_response(session, kinds, lang)


def ensure_crisis_lines(session: IntakeSession, text: str) -> str:
    """``text`` with the crisis lines appended unless it already gives 988."""
    if "988" in text:
        return text
    lang = _reply_language(session)
    footer = f"{_TEXT[lang]['footer_intro']}\n\n" + "\n".join(_line_items(lang))
    return f"{text}\n\n{footer}" if text.strip() else footer


def crisis_speech(session: IntakeSession) -> str:
    """Plain-text crisis message for the raw-audio voice model to read aloud."""
    danger = IMMEDIATE_DANGER in session.extracted_profile.crisis_indicators
    local = local_crisis_lines("mental_health") + local_crisis_lines("domestic_violence")
    lines = [
        "If you are in immediate danger, call 9-1-1 now." if danger
        else "Help is available right now. If you are in immediate danger, call 9-1-1.",
        "You can call or text 988, the Suicide and Crisis Lifeline, any time, day or night.",
        *(f"{r.name}: {r.phone}." for r in local),
        "The National Domestic Violence Hotline: 1-800-799-7233.",
        "These numbers are on your screen too. You don't have to go through this alone.",
        "When you're ready, I can keep helping you find services.",
    ]
    return " ".join(lines)


# ── The plan leads with crisis services ──────────────────────────────

def _crisis_services(profile: ResidentProfile) -> list[Service]:
    from app.services.matching import crisis_slugs

    services = (catalog.get_service_by_slug(slug) for slug in crisis_slugs(profile))
    return [svc for svc in services if svc is not None]


def _ensure_crisis_matches(session: IntakeSession, services: list[Service]) -> None:
    """Put the crisis-direct services at the front of the session's matches."""
    from app.services.matching import match_services

    crisis_ids = [svc.id for svc in services]
    current = {m.service.id: m for m in session.matches}
    missing = [sid for sid in crisis_ids if sid not in current]
    if missing:
        ranked = {m.service.id: m for m in match_services(session.extracted_profile)}
        current.update({sid: ranked[sid] for sid in missing if sid in ranked})
    lead = [current[sid] for sid in crisis_ids if sid in current]
    session.matches = [*lead, *(m for m in session.matches if m.service.id not in set(crisis_ids))]


def lead_with_crisis(session: IntakeSession, plan: IntakePlan) -> IntakePlan:
    """``plan`` with every crisis-direct service for the profile first.

    Runs after the model's pick and after the rules sequencer: a crisis
    service the model left out is added, one it ranked lower is moved up,
    and both join the session's matches so the plan survives the next
    request's grounding. Order follows the profile's crisis indicators.
    """
    from app.services.matching import SAFETY_SEQUENCE_REASON

    services = _crisis_services(session.extracted_profile)
    if not services:
        return plan
    _ensure_crisis_matches(session, services)
    matched = {m.service.id for m in session.matches}
    existing = {item.service_id: item for item in plan.items}
    lead: list[PlanItem] = []
    for svc in services:
        if svc.id not in matched:
            continue
        item = existing.get(svc.id)
        category = item.category if item else (
            "emergency" if "emergency" in svc.categories
            else (svc.categories[0] if svc.categories else "other")
        )
        lead.append(PlanItem(
            rank=1,  # renumbered below
            service_id=svc.id,
            service_slug=svc.slug,
            service_name=svc.name[:300],
            category=category[:64],
            reason=item.reason if item else SAFETY_SEQUENCE_REASON,
        ))
    lead_ids = {item.service_id for item in lead}
    ordered = [*lead, *(item for item in plan.items if item.service_id not in lead_ids)]
    items = [
        item.model_copy(update={"rank": n})
        for n, item in enumerate(ordered[:MAX_PLAN_ITEMS], start=1)
    ]
    return plan.model_copy(update={"items": items})
