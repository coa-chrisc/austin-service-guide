"""AI service for the guided intake conversation.

In DEMO_MODE (default) or when no Azure OpenAI key is configured, uses a
scripted conversation flow that simulates an intelligent intake assistant.
When Azure OpenAI is available, uses the real API.
"""

from __future__ import annotations

import json
import re
from typing import Any
from uuid import uuid4

from app.config import get_settings
from app.models import (
    IntakeMessage,
    IntakeSession,
    IntakeStatus,
    MessageRole,
    ResidentProfile,
)
from app.services.matching import assess_risks, calculate_benefits, match_services


# ── In-memory session store ───────────────────────────────────────────

_sessions: dict[str, IntakeSession] = {}

# ── Demo conversation steps ──────────────────────────────────────────

_DEMO_STEPS = [
    # Step 0 — Greeting (sent on start)
    {
        "message": (
            "Welcome to the Austin Service Guide! I'm here to help you find "
            "city and community services that fit your needs. This conversation "
            "is confidential and takes about 3-5 minutes.\n\n"
            "What brings you here today? Are you looking for help with something "
            "specific, or would you like me to walk you through a few questions?"
        ),
        "buttons": ["Walk me through it", "I need help with food", "I need healthcare", "I need housing help", "I lost my job"],
        "progress": 0,
        "extract": {},
    },
    # Step 1 — Household
    {
        "message": (
            "Thank you for sharing that. Let me ask a few quick questions so I "
            "can find the best resources for you.\n\n"
            "First, how many people are in your household, including yourself?"
        ),
        "buttons": ["Just me", "2 people", "3-4 people", "5 or more"],
        "progress": 15,
        "extract": {"_process_initial_need": True},
    },
    # Step 2 — Zip code
    {
        "message": "Got it. What zip code do you live in? This helps me find services near you.",
        "buttons": ["78741", "78702", "78745", "78753", "78758", "Other"],
        "progress": 30,
        "extract": {"_process_household": True},
    },
    # Step 3 — Housing situation
    {
        "message": (
            "Thanks! Now, what best describes your current housing situation?"
        ),
        "buttons": ["I rent", "I own my home", "Staying with friends/family", "Currently without housing", "Other"],
        "progress": 40,
        "extract": {"_process_zip": True},
    },
    # Step 4 — Employment
    {
        "message": "And what's your current employment situation?",
        "buttons": ["Working full-time", "Working part-time", "Currently unemployed", "Retired", "Unable to work"],
        "progress": 50,
        "extract": {"_process_housing": True},
    },
    # Step 5 — Income
    {
        "message": (
            "Approximately what is your household's total monthly income? "
            "This helps determine which programs you may qualify for."
        ),
        "buttons": ["Under $1,000", "$1,000-$2,000", "$2,000-$3,500", "$3,500-$5,000", "Over $5,000", "Prefer not to say"],
        "progress": 60,
        "extract": {"_process_employment": True},
    },
    # Step 6 — Insurance
    {
        "message": "Do you currently have health insurance?",
        "buttons": ["Yes, through employer", "Medicaid", "Medicare", "ACA Marketplace", "No insurance", "Not sure"],
        "progress": 70,
        "extract": {"_process_income": True},
    },
    # Step 7 — Additional needs
    {
        "message": (
            "Almost done! Are there any other areas where you could use help? "
            "Select all that apply, or type your own."
        ),
        "buttons": [
            "Childcare", "Legal help", "Transportation", "Mental health",
            "Disability services", "Senior services", "None of these",
        ],
        "progress": 85,
        "extract": {"_process_insurance": True},
    },
    # Step 8 — Complete (generated dynamically)
]


# ── Extraction helpers ────────────────────────────────────────────────

def _extract_household_size(text: str) -> int | None:
    t = text.lower().strip()
    if "just me" in t or t == "1":
        return 1
    if "2" in t:
        return 2
    m = re.search(r"(\d+)", t)
    if m:
        return int(m.group(1))
    if "3" in t or "4" in t or "3-4" in t:
        return 4
    if "5" in t or "more" in t:
        return 6
    return None


def _extract_zip(text: str) -> str:
    m = re.search(r"\b(78\d{3})\b", text)
    return m.group(1) if m else ""


def _extract_housing(text: str) -> str:
    t = text.lower()
    if "rent" in t:
        return "renting"
    if "own" in t:
        return "own_home"
    if "friend" in t or "family" in t or "staying" in t or "couch" in t:
        return "unstable"
    if "without" in t or "homeless" in t or "shelter" in t:
        return "homeless"
    return "other"


def _extract_employment(text: str) -> str:
    t = text.lower()
    if "full" in t:
        return "full-time"
    if "part" in t:
        return "part-time"
    if "unemployed" in t or "looking" in t or "not working" in t:
        return "unemployed"
    if "retire" in t:
        return "retired"
    if "unable" in t or "disabled" in t or "disability" in t:
        return "disabled"
    return "unemployed"


def _extract_income(text: str) -> str:
    t = text.lower()
    if "under" in t or "less" in t or "$1,000" in t and "2" not in t:
        return "$0-$10,000"
    if "1,000" in t and "2,000" in t:
        return "$10,000-$20,000"
    if "2,000" in t or "2,500" in t or "3,500" in t:
        return "$20,000-$30,000"
    if "3,500" in t or "5,000" in t:
        return "$40,000-$50,000"
    if "over" in t or "5,000" in t:
        return "$60,000-$80,000"
    if "prefer" in t:
        return ""
    return "$20,000-$30,000"


def _extract_insurance(text: str) -> str:
    t = text.lower()
    if "employer" in t:
        return "employer"
    if "medicaid" in t:
        return "medicaid"
    if "medicare" in t:
        return "medicare"
    if "marketplace" in t or "aca" in t:
        return "marketplace"
    if "no " in t or "uninsured" in t or "none" in t or "don't" in t:
        return "uninsured"
    return "unknown"


def _extract_initial_needs(text: str) -> list[str]:
    t = text.lower()
    needs: list[str] = []
    mapping = {
        "food": ["food", "hungry", "groceries", "eat", "snap", "nutrition"],
        "healthcare": ["health", "medical", "doctor", "clinic", "sick", "dental"],
        "housing": ["housing", "rent", "apartment", "shelter", "evict", "homeless"],
        "employment": ["job", "work", "employ", "career", "lost my job", "laid off"],
        "childcare": ["childcare", "daycare", "child care", "babysit", "preschool"],
        "utilities": ["utility", "utilities", "electric", "water", "bill"],
        "legal": ["legal", "lawyer", "court"],
        "transportation": ["transport", "bus", "ride"],
        "mental health": ["mental", "counseling", "therapy", "depress", "anxiety"],
    }
    for need, keywords in mapping.items():
        if any(kw in t for kw in keywords):
            needs.append(need)

    if "walk" in t and "through" in t:
        pass  # General — no specific need yet

    return needs


def _extract_additional_needs(text: str) -> list[str]:
    t = text.lower()
    needs: list[str] = []
    if "child" in t:
        needs.append("childcare")
    if "legal" in t:
        needs.append("legal")
    if "transport" in t or "bus" in t:
        needs.append("transportation")
    if "mental" in t or "counseling" in t:
        needs.append("healthcare")
    if "disab" in t:
        needs.append("disability")
    if "senior" in t or "elder" in t or "aging" in t:
        needs.append("senior")
    return needs


# ── Session management ───────────────────────────────────────────────

async def start_session(language: str = "en") -> IntakeSession:
    """Create a new intake session and return the greeting."""
    session = IntakeSession(language=language)
    step = _DEMO_STEPS[0]
    greeting = IntakeMessage(
        role=MessageRole.assistant,
        content=step["message"],
        suggested_buttons=step["buttons"],
        progress_percent=step["progress"],
    )
    session.conversation.append(greeting)
    _sessions[session.id] = session
    return session


async def process_message(session_id: str, user_text: str, language: str = "en") -> IntakeMessage:
    """Process a user message and return the assistant's response."""
    session = _sessions.get(session_id)
    if not session:
        return IntakeMessage(
            role=MessageRole.assistant,
            content="Session not found. Please start a new conversation.",
            is_complete=True,
        )

    settings = get_settings()

    # Record the user message
    session.conversation.append(IntakeMessage(
        role=MessageRole.user,
        content=user_text,
    ))

    # Check for crisis keywords
    crisis_detected = _check_crisis(user_text)
    if crisis_detected:
        session.extracted_profile.crisis_indicators.append(crisis_detected)

    # Determine which step we're on based on conversation length
    # (user messages only, excluding the greeting)
    user_msg_count = sum(1 for m in session.conversation if m.role == MessageRole.user)

    if crisis_detected == "immediate_danger":
        return _crisis_response(session)

    # Use demo flow
    if settings.demo_mode or not settings.has_azure_openai:
        return await _demo_flow(session, user_text, user_msg_count)
    else:
        return await _azure_flow(session, user_text)


def _check_crisis(text: str) -> str:
    """Check for crisis keywords. Returns crisis type or empty string."""
    t = text.lower()
    if any(w in t for w in ["kill myself", "suicide", "want to die", "end my life", "self-harm"]):
        return "suicidal_ideation"
    if any(w in t for w in ["hitting me", "beats me", "abusing me", "domestic violence", "he hurts", "she hurts", "afraid of my partner"]):
        return "domestic_violence"
    if any(w in t for w in ["in danger", "not safe", "threatened", "going to hurt me"]):
        return "immediate_danger"
    return ""


def _crisis_response(session: IntakeSession) -> IntakeMessage:
    """Return an immediate crisis response."""
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


async def _demo_flow(session: IntakeSession, user_text: str, step_num: int) -> IntakeMessage:
    """Handle the scripted demo conversation flow."""
    profile = session.extracted_profile

    # Process extraction based on step
    if step_num == 1:
        # They answered the greeting — extract initial needs
        needs = _extract_initial_needs(user_text)
        if needs:
            profile.immediate_needs = list(set(profile.immediate_needs + needs))
    elif step_num == 2:
        # Household size
        hs = _extract_household_size(user_text)
        if hs:
            profile.household_size = hs
            profile.has_children = hs >= 3  # heuristic
    elif step_num == 3:
        # Zip code
        z = _extract_zip(user_text)
        if z:
            profile.zip_code = z
    elif step_num == 4:
        # Housing
        profile.housing_situation = _extract_housing(user_text)
    elif step_num == 5:
        # Employment
        profile.employment_status = _extract_employment(user_text)
    elif step_num == 6:
        # Income
        profile.income_bracket = _extract_income(user_text)
    elif step_num == 7:
        # Insurance
        profile.insurance_status = _extract_insurance(user_text)
    elif step_num >= 8:
        # Additional needs
        additional = _extract_additional_needs(user_text)
        profile.immediate_needs = list(set(profile.immediate_needs + additional))

        # Complete the intake
        return await _complete_intake(session)

    # Return next step
    if step_num < len(_DEMO_STEPS):
        step = _DEMO_STEPS[step_num]
        msg = IntakeMessage(
            role=MessageRole.assistant,
            content=step["message"],
            suggested_buttons=step.get("buttons", []),
            progress_percent=step.get("progress", 0),
        )
        session.conversation.append(msg)
        return msg
    else:
        # Past all steps — complete
        return await _complete_intake(session)


async def _complete_intake(session: IntakeSession) -> IntakeMessage:
    """Run matching and return the completion message."""
    profile = session.extracted_profile
    profile.languages_spoken = [session.language] if session.language != "en" else ["en"]

    # Run matching
    matches = match_services(profile)
    risks = assess_risks(profile)
    benefits = calculate_benefits(profile, matches)

    session.matches = matches
    session.risk_flags = risks
    session.status = IntakeStatus.completed

    # Build summary message
    match_count = len(matches)
    high_matches = [m for m in matches if m.match_confidence == "high"]

    lines = [
        f"Great news! Based on what you've told me, I found **{match_count} services** that may be able to help you.",
    ]

    if benefits.get("total_monthly_value", 0) > 0:
        lines.append(
            f"\n**Estimated monthly benefit value: ${benefits['total_monthly_value']:,.0f}/month** "
            f"(${benefits['total_annual_value']:,.0f}/year)"
        )

    if high_matches:
        lines.append("\nHere are your top matches:\n")
        for i, m in enumerate(high_matches[:5], 1):
            lines.append(f"**{i}. {m.service.name}** — {m.match_reasoning}")

    if risks:
        critical = [r for r in risks if r.severity.value in ("critical", "high")]
        if critical:
            lines.append(
                "\n> **Important:** I've identified some urgent needs. "
                "A case worker may reach out to connect you with additional support."
            )

    lines.append("\nClick **View Full Results** to see all your matches with details on how to apply.")

    msg = IntakeMessage(
        role=MessageRole.assistant,
        content="\n".join(lines),
        progress_percent=100,
        is_complete=True,
        suggested_buttons=["View Full Results", "Start Over"],
    )
    session.conversation.append(msg)
    return msg


async def _azure_flow(session: IntakeSession, user_text: str) -> IntakeMessage:
    """Use Azure OpenAI for the conversation (when configured)."""
    settings = get_settings()

    try:
        from openai import AsyncAzureOpenAI

        client = AsyncAzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_key,
            api_version="2024-06-01",
        )

        system_prompt = _build_system_prompt(session)
        messages = [{"role": "system", "content": system_prompt}]
        for m in session.conversation:
            if m.role == MessageRole.system:
                continue
            messages.append({
                "role": m.role.value,
                "content": m.content,
            })

        tools = _build_tools()

        response = await client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=messages,
            tools=tools,
            temperature=0.7,
            max_tokens=800,
        )

        choice = response.choices[0]
        assistant_content = choice.message.content or ""

        # Handle tool calls (profile extraction, matching)
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                if tc.function.name == "extract_profile":
                    args = json.loads(tc.function.arguments)
                    _apply_profile_extraction(session, args)
                elif tc.function.name == "complete_intake":
                    return await _complete_intake(session)

        # Determine progress heuristic based on profile completeness
        progress = _estimate_progress(session.extracted_profile)

        msg = IntakeMessage(
            role=MessageRole.assistant,
            content=assistant_content,
            progress_percent=progress,
        )
        session.conversation.append(msg)
        return msg

    except Exception as e:
        # Fallback to demo mode on error
        user_msg_count = sum(1 for m in session.conversation if m.role == MessageRole.user)
        return await _demo_flow(session, user_text, user_msg_count)


def _build_system_prompt(session: IntakeSession) -> str:
    lang_note = ""
    if session.language != "en":
        lang_note = f"\nThe user prefers to communicate in language code '{session.language}'. Respond in that language."

    return f"""You are a friendly, empathetic intake assistant for the Austin Service Guide — a City of Austin portal that helps residents discover social services and benefits they may qualify for.

Your goal is to have a brief, warm conversation (5-8 exchanges) to understand the resident's situation and needs. You need to learn:
1. What brought them here / immediate needs
2. Household size
3. Zip code
4. Housing situation
5. Employment status
6. Approximate income range
7. Insurance status
8. Any additional needs

Guidelines:
- Be warm, non-judgmental, and conversational — not clinical
- Ask one question at a time
- Offer suggested button responses when appropriate
- If the person mentions a crisis (DV, suicidal ideation, immediate danger), immediately provide crisis resources
- When you have enough information, call the complete_intake function
- Use the extract_profile function to save profile data as you learn it
{lang_note}"""


def _build_tools() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "extract_profile",
                "description": "Save extracted profile information from the conversation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "household_size": {"type": "integer"},
                        "zip_code": {"type": "string"},
                        "housing_situation": {"type": "string"},
                        "employment_status": {"type": "string"},
                        "income_bracket": {"type": "string"},
                        "insurance_status": {"type": "string"},
                        "has_children": {"type": "boolean"},
                        "veteran_status": {"type": "boolean"},
                        "has_disability": {"type": "boolean"},
                        "immediate_needs": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "complete_intake",
                "description": "Complete the intake when enough profile information has been gathered",
                "parameters": {"type": "object", "properties": {}},
            },
        },
    ]


def _apply_profile_extraction(session: IntakeSession, data: dict) -> None:
    profile = session.extracted_profile
    if "household_size" in data:
        profile.household_size = data["household_size"]
    if "zip_code" in data:
        profile.zip_code = data["zip_code"]
    if "housing_situation" in data:
        profile.housing_situation = data["housing_situation"]
    if "employment_status" in data:
        profile.employment_status = data["employment_status"]
    if "income_bracket" in data:
        profile.income_bracket = data["income_bracket"]
    if "insurance_status" in data:
        profile.insurance_status = data["insurance_status"]
    if "has_children" in data:
        profile.has_children = data["has_children"]
    if "veteran_status" in data:
        profile.veteran_status = data["veteran_status"]
    if "has_disability" in data:
        profile.has_disability = data["has_disability"]
    if "immediate_needs" in data:
        profile.immediate_needs = list(
            set(profile.immediate_needs + data["immediate_needs"])
        )


def _estimate_progress(profile: ResidentProfile) -> int:
    fields = [
        profile.household_size is not None,
        bool(profile.zip_code),
        bool(profile.housing_situation),
        bool(profile.employment_status),
        bool(profile.income_bracket),
        bool(profile.insurance_status),
        len(profile.immediate_needs) > 0,
    ]
    filled = sum(1 for f in fields if f)
    return min(90, int((filled / len(fields)) * 90))


# ── Public session access ────────────────────────────────────────────

def get_session(session_id: str) -> IntakeSession | None:
    return _sessions.get(session_id)
