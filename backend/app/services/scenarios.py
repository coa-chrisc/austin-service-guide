"""Scenario follow-up questions and the backend crisis safety net."""

from __future__ import annotations

import re

from app.models import IntakeMessage, IntakeSession, MessageRole
from app.services.life_events import canonical_life_event_slug, session_life_event_slug
from app.services.tools import estimate_progress


def _text_mentions_housing_status(text: str) -> bool:
    t = text.lower()
    return any(
        token in t
        for token in (
            "behind on rent",
            "eviction",
            "evict",
            "renting",
            "rent ",
            "staying",
            "shelter",
            "car",
            "homeless",
            "unhoused",
            "couch",
            "temporary",
            "no place",
            "nowhere",
        )
    )


def _text_mentions_household_count(text: str) -> bool:
    t = text.lower()
    if re.search(r"\b\d+\b", t):
        return True
    return any(word in t for word in ("just me", "alone", "two", "three", "four", "five", "six", "seven", "eight"))


def scenario_first_followup(session: IntakeSession, user_text: str) -> IntakeMessage | None:
    """Keep life-event sessions on their scenario path for the first answer."""
    slug = canonical_life_event_slug(session_life_event_slug(session))
    if not slug:
        return None

    # process_message already appended the current user turn to conversation.
    user_turns = [m for m in session.conversation if m.role == MessageRole.user]
    if len(user_turns) != 1:
        return None

    text = user_text.lower()
    question_by_slug = {
        "lost-job": (
            "What has been hit the hardest since the job change: rent, food, "
            "utilities, health insurance, finding work, or something else?"
        ),
        "need-food": (
            "How many people are in your household, including you?"
            if not _text_mentions_household_count(user_text)
            else "Do you need food today, help applying for SNAP, or both?"
        ),
        "housing-crisis": (
            "What is your housing situation right now — are you in a place but "
            "behind on rent, staying somewhere temporary, or without housing?"
            if not _text_mentions_housing_status(user_text)
            else "What zip code or area are you staying in right now?"
        ),
        "new-baby": (
            "Is the baby expected soon or already born, and what kind of support "
            "would help most first: WIC, healthcare, baby supplies, or childcare?"
        ),
        "need-healthcare": (
            "Is this care urgent today, or are you looking for ongoing clinic "
            "care, coverage, prescriptions, dental, or something else?"
        ),
        "mental-health": (
            "Is this support for you or someone else, and are you looking for "
            "counseling, crisis support, school support, or peer support?"
        ),
        "senior-help": (
            "What support is needed most: meals, transportation, personal care, "
            "healthcare, benefits, home safety, or caregiver respite?"
        ),
        "retiring": (
            "What are you trying to plan for first: healthcare, meals, "
            "transportation, benefits, social support, or caregiving?"
        ),
        "veteran-transition": (
            "What kind of veteran support is most urgent right now: housing, "
            "VA benefits, healthcare, job help, or documents/navigation?"
            if not any(word in text for word in ("housing", "place", "live", "shelter", "homeless", "car", "rent"))
            else (
                "What is your housing situation right now — are you in a place "
                "but behind on rent, staying somewhere temporary, or without housing?"
                if not _text_mentions_housing_status(user_text)
                else "What zip code or area are you staying in right now?"
            )
        ),
        "new-to-austin": (
            "What do you need help setting up first: healthcare, food, "
            "transportation, school, utilities, housing, or documents?"
        ),
        "legal-trouble": (
            "Do the papers mention a deadline, hearing date, eviction, "
            "protective order/family safety issue, immigration matter, or "
            "benefits issue?"
        ),
        "child-care": (
            "How old is the child, and what days or hours do you need care to cover?"
        ),
        "back-to-school": (
            "What kind of program are you looking for: GED, adult education, "
            "ESL, college help, job training, or school support for a child?"
        ),
        "young-adult": (
            "What are you trying to handle first: housing, job, school, "
            "healthcare, transportation, or basic needs?"
        ),
        "aging-parent": (
            "What kind of support does your parent need most right now: meals, "
            "rides, personal care, medical care, respite, home safety, or benefits?"
        ),
        "divorce": (
            "What kind of help do you need first: legal aid, counseling, "
            "housing, childcare, or financial support?"
        ),
        "family-death": (
            "What help is most needed right now: grief support, legal paperwork, "
            "benefits, food, housing, or immediate expenses?"
        ),
        "new-disability": (
            "What has become hardest to manage: healthcare, benefits, assistive "
            "devices, transportation, work, housing accessibility, or legal support?"
        ),
        "unsafe-situation": (
            "Are you in immediate danger right now, or do you need help finding "
            "safe shelter, legal support, counseling, or housing?"
        ),
        "healthspan": (
            "What is making that goal hardest right now: cost, time, stress, "
            "transportation, health issues, or not knowing where to start?"
        ),
    }
    if slug == "lost-job":
        if any(word in text for word in ("rent", "evict", "housing", "shelter", "homeless")):
            # Housing already described: let the main flow ask what's still unknown.
            if _text_mentions_housing_status(user_text):
                return None
            question = (
                "What is your housing situation right now — are you in a place "
                "but behind on rent, staying somewhere temporary, or without housing?"
            )
        elif any(word in text for word in ("food", "groceries", "kids", "children", "snap")):
            question = "How many people are in your household, including you?"
        elif any(word in text for word in ("insurance", "health coverage", "healthcare")):
            question = (
                "Do you have health insurance right now, or did you lose coverage "
                "with the job change?"
            )
        else:
            question = question_by_slug.get(slug)
    elif slug == "back-to-school" and any(word in text for word in ("ged", "hse", "high school")):
        question = (
            "Are you looking for GED classes, test prep, or help paying for the "
            "exam, and do you need evening or daytime options?"
        )
    elif slug == "new-disability" and any(word in text for word in ("work", "job", "injured", "injury")):
        question = (
            "Do you need help with healthcare, disability benefits, job or "
            "workplace support, transportation, or income while you recover?"
        )
    else:
        question = question_by_slug.get(slug)
    if not question:
        return None

    msg = IntakeMessage(
        role=MessageRole.assistant,
        content=question,
        progress_percent=estimate_progress(session.extracted_profile),
    )
    session.conversation.append(msg)
    return msg


# ── Crisis detection (backend-side safety net) ──────────────────────

def check_crisis(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["kill myself", "suicide", "want to die", "end my life", "self-harm"]):
        return "suicidal_ideation"
    if any(w in t for w in ["hitting me", "beats me", "abusing me", "domestic violence", "he hurts", "she hurts", "afraid of my partner"]):
        return "domestic_violence"
    if any(w in t for w in ["in danger", "not safe", "threatened", "going to hurt me"]):
        return "immediate_danger"
    return ""


def crisis_response(session: IntakeSession) -> IntakeMessage:
    msg = IntakeMessage(
        role=MessageRole.assistant,
        content=(
            "I hear you, and I want you to know that help is available right now.\n\n"
            "**If you are in immediate danger, call 9-1-1.**\n\n"
            "Here are crisis resources available 24/7:\n\n"
            "- **988 Suicide & Crisis Lifeline** — Call or text **988**\n"
            "- **Integral Care Crisis Line** — **512-472-4357**\n"
            "- **SAFE Alliance (DV/SA)** — **512-267-7233**\n"
            "- **National DV Hotline** — **1-800-799-7233**\n\n"
            "You don't have to go through this alone. Would you like to continue "
            "finding services, or would you prefer to connect with a crisis counselor?"
        ),
        crisis_detected=True,
        suggested_buttons=["Connect with crisis counselor", "Continue finding services"],
        progress_percent=0,
    )
    session.conversation.append(msg)
    return msg
