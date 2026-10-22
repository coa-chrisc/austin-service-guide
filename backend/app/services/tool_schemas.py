"""Function-tool schemas shared by the text agent and Realtime voice."""

from __future__ import annotations

from typing import Any

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "search_services",
        "description": (
            "Keyword search the local service catalog. Use when the user "
            "describes a need so you can show concrete, relevant services. "
            "Always search in English (translate the user's words yourself "
            "if needed) — the catalog is English-canonical."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "English keywords or short phrase to search."},
                "category": {
                    "type": ["string", "null"],
                    "description": "Optional category slug filter, e.g. 'food', 'housing', 'healthcare'.",
                },
                "zip_code": {
                    "type": ["string", "null"],
                    "description": "Optional ZIP code to limit by proximity.",
                },
            },
            "required": ["query", "category", "zip_code"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_service_details",
        "description": "Return full details for one service by its slug.",
        "parameters": {
            "type": "object",
            "properties": {"slug": {"type": "string"}},
            "required": ["slug"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_crisis_resources",
        "description": (
            "Return 24/7 crisis hotlines (988, domestic violence, local crisis lines). "
            "Call this immediately when the user mentions suicidal thoughts, "
            "domestic violence, or being in danger."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "language": {
                    "type": ["string", "null"],
                    "description": "ISO language code to filter resources by language support.",
                }
            },
            "required": ["language"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "extract_profile",
        "description": (
            "Persist resident profile fields you've inferred from the "
            "conversation. Call this every time you learn a new fact "
            "(household size, zip, housing, income, etc.) so matching "
            "stays current. Pass only the fields you have evidence for."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "household_size": {"type": ["integer", "null"]},
                "zip_code": {"type": ["string", "null"]},
                "housing_situation": {
                    "type": ["string", "null"],
                    "description": "One of: renting, own_home, unstable, homeless, other.",
                },
                "employment_status": {
                    "type": ["string", "null"],
                    "description": "One of: full-time, part-time, unemployed, retired, disabled.",
                },
                "income_bracket": {
                    "type": ["string", "null"],
                    "description": "Bracket like '$0-$10,000' or '$20,000-$30,000'.",
                },
                "insurance_status": {
                    "type": ["string", "null"],
                    "description": "One of: employer, medicaid, medicare, marketplace, uninsured, unknown.",
                },
                "has_children": {"type": ["boolean", "null"]},
                "veteran_status": {"type": ["boolean", "null"]},
                "has_disability": {"type": ["boolean", "null"]},
                "immediate_needs": {
                    "type": ["array", "null"],
                    "items": {"type": "string"},
                    "description": "Lower-case English need keywords e.g. ['food', 'housing'].",
                },
                "is_outdoor_worker": {
                    "type": ["boolean", "null"],
                    "description": "True if the resident or someone in the household works primarily outdoors (construction, landscaping, agriculture, delivery on foot/bike, etc.).",
                },
                "has_ac": {
                    "type": ["boolean", "null"],
                    "description": "True if the home has working air conditioning.",
                },
                "has_chronic_conditions": {
                    "type": ["boolean", "null"],
                    "description": "True if the resident has chronic conditions that compound heat risk (cardiovascular, respiratory, diabetes, kidney, pregnancy, age 65+).",
                },
                "is_refugee_or_immigrant": {
                    "type": ["boolean", "null"],
                    "description": "True if the resident self-identifies as a refugee, asylee, or recent immigrant.",
                },
                "primary_language": {
                    "type": ["string", "null"],
                    "description": "ISO code of the resident's primary spoken language (e.g. 'es', 'ar', 'vi'). May differ from the conversation language.",
                },
                "school_age_children": {
                    "type": ["array", "null"],
                    "description": "K-12 children in the household. Populate when the resident mentions school, grade level, or concerns about a child.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "grade": {"type": "string", "description": "Grade level e.g. 'K', '7', '10'."},
                            "district": {"type": "string", "description": "School district e.g. 'AISD', 'Del Valle ISD'."},
                            "concerns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Lower-case concern tags e.g. ['anxiety', 'attendance', 'behavior', 'bullying'].",
                            },
                        },
                        "required": ["grade", "district", "concerns"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": [
                "household_size", "zip_code", "housing_situation",
                "employment_status", "income_bracket", "insurance_status",
                "has_children", "veteran_status", "has_disability",
                "immediate_needs",
                "is_outdoor_worker", "has_ac", "has_chronic_conditions",
                "is_refugee_or_immigrant", "primary_language",
                "school_age_children",
            ],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "find_matching_services",
        "description": (
            "Run the rules-based matching engine on the current resident "
            "profile and return ranked services. Use this once you have "
            "enough profile data to give meaningful recommendations."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False, "required": []},
        "strict": True,
    },
    {
        "type": "function",
        "name": "set_language",
        "description": (
            "Switch the conversation language when the user writes in or "
            "asks for a different language. Use ISO codes ('es', 'vi', "
            "'zh', 'ar', 'en', etc.). After calling this, continue in the "
            "new language."
        ),
        "parameters": {
            "type": "object",
            "properties": {"code": {"type": "string"}},
            "required": ["code"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "complete_intake",
        "description": (
            "Finalize the intake: runs matching + risk + benefit estimation "
            "on the current profile, marks the session complete, and "
            "returns a structured summary you should weave into a warm "
            "closing message that invites the user to view full results."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False, "required": []},
        "strict": True,
    },
    {
        "type": "function",
        "name": "wait_for_user",
        "description": (
            "Realtime voice only: call this when the latest audio should not "
            "receive a spoken response, such as silence, background noise, "
            "TV or hold audio, side conversation, or speech not addressed to "
            "the assistant. This ends the turn without speaking."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False, "required": []},
        "strict": True,
    },
]
