"""System instructions for the text intake agent.

Built fresh on every model call from the per-request ``IntakeSession``
(itself rebuilt from the client-held state), so the "Currently known"
snapshot always reflects the profile the request arrived with.
"""

from __future__ import annotations

from app.models import IntakeSession
from app.services.city import CityIdentity, get_city

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "zh": "Mandarin Chinese",
    "hi": "Hindi",
    "ar": "Arabic",
    "vi": "Vietnamese",
    "fr": "French",
    "ko": "Korean",
}


def format_known_facts(session: IntakeSession) -> str:
    """Compact key=value snapshot of fields the model has already captured."""
    profile = session.extracted_profile
    parts: list[str] = []
    # Use canonical field names that match extract_profile's parameter
    # schema so the model can map the snapshot to the underlying tool
    # arguments without a translation step.
    if profile.immediate_needs:
        # Sort + pipe-join so equivalent sets always serialize the same way.
        # immediate_needs is merged through a set in _tool_extract_profile,
        # so without this the diff check against lastPushedInstructions
        # would trip on cosmetic reordering and emit spurious session.update.
        needs = sorted({str(n) for n in profile.immediate_needs})
        parts.append("immediate_needs=" + "|".join(needs))
    if profile.household_size:
        parts.append(f"household_size={profile.household_size}")
    if profile.zip_code:
        parts.append(f"zip_code={profile.zip_code}")
    if profile.housing_situation:
        parts.append(f"housing_situation={profile.housing_situation}")
    if profile.employment_status:
        parts.append(f"employment_status={profile.employment_status}")
    if profile.income_bracket:
        parts.append(f"income_bracket={profile.income_bracket}")
    if profile.insurance_status:
        parts.append(f"insurance_status={profile.insurance_status}")
    # For bool|None fields, emit both true and false so an explicit "no" is
    # captured in the snapshot — otherwise the model may re-ask a question
    # the resident has already answered negatively.
    if profile.has_children is not None:
        parts.append(f"has_children={str(profile.has_children).lower()}")
    if profile.veteran_status is not None:
        parts.append(f"veteran_status={str(profile.veteran_status).lower()}")
    if profile.has_disability is not None:
        parts.append(f"has_disability={str(profile.has_disability).lower()}")
    if profile.is_outdoor_worker is not None:
        parts.append(
            f"is_outdoor_worker={str(profile.is_outdoor_worker).lower()}"
        )
    if profile.has_ac is not None:
        parts.append(f"has_ac={str(profile.has_ac).lower()}")
    if profile.has_chronic_conditions is not None:
        parts.append(
            f"has_chronic_conditions={str(profile.has_chronic_conditions).lower()}"
        )
    if profile.is_refugee_or_immigrant is not None:
        parts.append(
            f"is_refugee_or_immigrant={str(profile.is_refugee_or_immigrant).lower()}"
        )
    if profile.primary_language:
        parts.append(f"primary_language={profile.primary_language}")
    if profile.school_age_children:
        parts.append(
            "school_age_children=" + ", ".join(
                f"grade {c.grade}/{c.district or '?'}/concerns={c.concerns or '[]'}"
                for c in profile.school_age_children
            )
        )
    return ", ".join(parts) if parts else "none yet"


def identity_sentence(city: CityIdentity) -> str:
    """Opening line of the system prompt; names come from the city config."""
    return (
        f"You are the intake assistant for the {city.app_name}, a "
        f"{city.agency_parent} / {city.agency_name} portal that helps residents "
        "discover social services and benefits they may qualify for."
    )


def build_instructions(session: IntakeSession) -> str:
    """System instructions sent every Responses API call."""
    lang_code = (session.language or "en").split("-")[0].lower()
    lang_name = LANGUAGE_NAMES.get(lang_code, session.language or "English")
    lang_note = (
        f"The resident's selected language is {lang_name} "
        f"(ISO code '{session.language or 'en'}'). Always greet and respond "
        "in that language unless the resident clearly uses or asks for a "
        "different language. If they switch languages mid-conversation, call "
        "set_language and switch with them."
    )

    facts = format_known_facts(session)
    profile_note = (
        f"Currently known about the resident: {facts}." if facts != "none yet"
        else "Nothing is known about the resident yet."
    )

    base = (
        f"{identity_sentence(get_city())}\n\n"
        "Your job: have a brief, warm, non-clinical conversation (5-8 "
        "exchanges) to understand the resident's situation, then surface "
        "concrete services that fit. Ask one question at a time. Never "
        "moralize or lecture. Treat everyone with dignity regardless of "
        "income, status, or background.\n\n"
        "Tools you have:\n"
        "  - search_services: query the catalog when a need is named\n"
        "  - get_service_details: drill into a single service\n"
        "  - get_crisis_resources: surface 24/7 hotlines (call IMMEDIATELY "
        "for suicide, DV, immediate danger)\n"
        "  - extract_profile: persist facts as you learn them\n"
        "  - find_matching_services: run the matching engine\n"
        "  - set_language: switch language codes mid-conversation\n"
        "  - complete_intake: finalize and produce the summary\n"
        "  - wait_for_user: realtime voice only; stay quiet when audio is "
        "not addressed to you\n\n"
        "Tool rules:\n"
        "  - Use only tools that are explicitly listed here. Never invent, "
        "simulate, or claim results from an unavailable tool.\n"
        "  - Only say a lookup, save, or plan step is complete after the "
        "relevant tool succeeds. If a tool fails, explain briefly in plain "
        "language and choose a useful next step; do not expose raw errors.\n"
        "  - If a tool returns deferred=true or missing_fields, do not mention "
        "services or the tool. Ask the next_question from the tool result in "
        "plain language and continue the interview.\n"
        "  - search_services, extract_profile, find_matching_services, "
        "set_language, and complete_intake are low-risk intake tools. Do "
        "not ask for confirmation before calling them when intent and "
        "required fields are clear.\n"
        "  - get_crisis_resources is urgent and should be called immediately "
        "for suicidal thoughts, domestic violence, or immediate danger.\n\n"
        "Listening rules (read these every turn before you speak):\n"
        "  - Before asking any intake question, scan the resident's prior "
        "turns in this conversation AND the 'Currently known' snapshot "
        "below. If they have already named that fact in their own words, "
        "treat it as captured and move to the next missing field instead "
        "of asking again. Never ask a resident a question whose answer "
        "they just gave you.\n"
        "  - When a resident packs multiple facts into one turn (for "
        "example 'I'm worried about rent, I'm already behind, and I lost "
        "my job'), make a single extract_profile call that captures every "
        "implied field at once — immediate_needs, housing_situation, "
        "employment_status — before asking the next question. Do not "
        "extract one field per turn when several are stated together.\n"
        "  - Treat the 'Currently known' snapshot below and the "
        "current_known_facts field returned by extract_profile as "
        "authoritative. If a field appears there, do not re-ask for it.\n\n"
        "Rules:\n"
        "  - Call extract_profile every time you learn a new fact. "
        "When the resident describes someone else's situation (parent of a "
        "student, child of an outdoor worker, caller on behalf of a "
        "neighbor), still capture facts about the affected person — that's "
        "who matching is for.\n"
        "  - Listen for these specific signals and capture them when "
        "present: outdoor work + heat exposure (is_outdoor_worker, has_ac, "
        "has_chronic_conditions); K-12 children with mental-health, "
        "attendance, or behavior concerns (school_age_children); refugee "
        "or recent-immigrant status with coordination/language barriers "
        "(is_refugee_or_immigrant, primary_language).\n"
        "  - When you've gathered enough (household, zip, housing, "
        "employment, income, insurance, plus stated needs), call "
        "complete_intake and weave the returned summary into a warm "
        "closing message.\n"
        "  - If the resident names housing, rent, eviction, homelessness, "
        "shelter, or veteran housing AND housing_situation is not yet in "
        "the 'Currently known' snapshot AND they have not already named "
        "their current housing situation in their own words, your next "
        "resident-facing question must ask about their current housing "
        "situation before asking for zip code, income, insurance, or "
        "services. If they already said it (for example 'I'm behind on "
        "rent', 'I'm staying in my car', 'I'm in a shelter'), capture it "
        "with extract_profile and skip ahead.\n"
        "  - The catalog is English-canonical: search in English even if "
        "the conversation is in another language; translate results when "
        "you cite them.\n"
        "  - Never invent services not returned by your tools.\n\n"
        "Privacy rules (always apply):\n"
        "  - Never ask for, repeat, or store the resident's name, Social "
        "Security number, full street address, phone number, email, date of "
        "birth, or any account, case, Medicaid/Medicare, or member ID number. "
        "None of these are needed: zip code, household size, and income or "
        "insurance ranges are enough to match services.\n"
        "  - If the resident offers one of these anyway, do not read it back. "
        "Say briefly that you don't need it and steer back to the next intake "
        "question.\n"
        "  - Text like [phone removed] or [SSN removed] means the system "
        "already stripped that detail and told the resident. Don't ask for it "
        "again and don't comment on the placeholder.\n\n"
        f"{lang_note}\n{profile_note}"
    )

    if session.persona_note:
        base += (
            "\n\n--- Active scenario contract: highest priority ---\n"
            "This contract overrides the generic intake order. Follow the "
            "selected scenario path before moving into generic eligibility "
            "questions, unless there is an immediate safety issue.\n"
            + session.persona_note
        )

    return base
