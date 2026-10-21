"""Pydantic models for the Austin Service Guide API."""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CostType(str, Enum):
    free = "free"
    sliding_scale = "sliding_scale"
    flat_fee = "flat_fee"
    insurance = "insurance"
    varies = "varies"


class ServiceStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    seasonal = "seasonal"


class IntakeStatus(str, Enum):
    in_progress = "in_progress"
    completed = "completed"
    abandoned = "abandoned"


class RiskSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class MessageRole(str, Enum):
    system = "system"
    assistant = "assistant"
    user = "user"


# ---------------------------------------------------------------------------
# Service models
# ---------------------------------------------------------------------------

class ServiceDocument(BaseModel):
    name: str
    description: str = ""
    is_required: bool = True


class ServiceLocation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    service_id: str = ""
    name: str
    address: str
    city: str = "Austin"
    state: str = "TX"
    zip_code: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    phone: str = ""
    is_primary: bool = False
    hours: dict[str, str] = Field(default_factory=dict)
    hours_verified: bool = False


# Closed vocabulary for Service.eligibility_requires — hard eligibility gates
# the matching engine checks against the resident profile. Every listed gate
# must be satisfied (AND). Semantics live in app/services/eligibility.py and
# are documented in app/data/README.md.
EligibilityGate = Literal[
    "veteran",
    "homeless_or_unstable_housing",
    "refugee_or_immigrant",
    "disability",
    "older_adult",
    "older_adult_or_disability",
    "has_children",
    "youth",
    "other_criteria",
]


class Service(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    slug: str
    provider_name: str = ""
    description: str = ""
    eligibility_summary: str = ""
    eligibility_requires: list[EligibilityGate] = Field(default_factory=list)
    how_to_apply: str = ""
    cost: str = ""
    cost_type: CostType = CostType.free
    website_url: str = ""
    phone: str = ""
    email: str = ""
    languages_offered: list[str] = Field(default_factory=lambda: ["en"])
    accessibility_features: list[str] = Field(default_factory=list)
    status: ServiceStatus = ServiceStatus.active
    categories: list[str] = Field(default_factory=list)
    locations: list[ServiceLocation] = Field(default_factory=list)
    documents: list[ServiceDocument] = Field(default_factory=list)


class ServiceCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    slug: str
    description: str = ""
    icon: str = ""
    color: str = ""
    service_count: int = 0


class LifeEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    slug: str
    description: str = ""
    icon: str = ""
    related_categories: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Intake / conversation models
# ---------------------------------------------------------------------------

class IntakeMessage(BaseModel):
    role: MessageRole
    content: str
    suggested_buttons: list[str] = Field(default_factory=list)
    progress_percent: int = 0
    is_complete: bool = False
    crisis_detected: bool = False


class SchoolAgeChild(BaseModel):
    grade: str = ""              # e.g. "7", "10", "K"
    district: str = ""           # e.g. "AISD", "Del Valle ISD"
    concerns: list[str] = Field(default_factory=list)  # e.g. ["anxiety", "attendance"]


class ResidentProfile(BaseModel):
    age_range: str = ""
    household_size: int | None = None
    zip_code: str = ""
    housing_situation: str = ""
    employment_status: str = ""
    income_bracket: str = ""
    insurance_status: str = ""
    has_children: bool | None = None
    veteran_status: bool | None = None
    has_disability: bool | None = None
    immediate_needs: list[str] = Field(default_factory=list)
    languages_spoken: list[str] = Field(default_factory=lambda: ["en"])
    crisis_indicators: list[str] = Field(default_factory=list)
    # Heat / outdoor-work signals
    is_outdoor_worker: bool | None = None
    has_ac: bool | None = None
    has_chronic_conditions: bool | None = None
    # Schools / mental health
    school_age_children: list[SchoolAgeChild] = Field(default_factory=list)
    # Refugee / food coordination
    is_refugee_or_immigrant: bool | None = None
    primary_language: str = ""           # ISO code; populated separately from languages_spoken


class RiskFlag(BaseModel):
    risk_type: str
    severity: RiskSeverity
    description: str
    contributing_factors: list[str] = Field(default_factory=list)
    prevention_services: list[str] = Field(default_factory=list)


class ServiceMatch(BaseModel):
    service: Service
    match_confidence: str = "high"  # high | medium | low
    match_reasoning: str = ""
    match_score: float = 0.0
    # Demo-only: tracks whether a referral has been completed by the partner.
    # "" | "connected" | "referred" | "no_response"
    referral_status: str = ""


class PlanItem(BaseModel):
    """One step of the resident's plan. Names/slugs are re-read from the catalog."""

    model_config = ConfigDict(extra="forbid")

    rank: int = Field(ge=1, le=50)
    service_id: str = Field(max_length=100)
    service_slug: str = Field(default="", max_length=200)
    service_name: str = Field(default="", max_length=300)
    category: str = Field(default="", max_length=64)
    reason: str = Field(default="", max_length=600)


class IntakePlan(BaseModel):
    """Ordered next steps built once the intake completes."""

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(default="", max_length=1200)
    items: list[PlanItem] = Field(default_factory=list, max_length=20)
    ai_generated: bool = False


class IntakeSession(BaseModel):
    """Per-request working copy of one resident's intake.

    Built from the client-held ``IntakeState`` at the start of a request and
    serialized back into one before the response returns. Never stored on
    the server (see ``app/services/intake_state.py``).
    """

    language: str = "en"
    conversation: list[IntakeMessage] = Field(default_factory=list)
    extracted_profile: ResidentProfile = Field(default_factory=ResidentProfile)
    status: IntakeStatus = IntakeStatus.in_progress
    # Catalog-hydrated from ``IntakeState.matched_service_ids``.
    matches: list[ServiceMatch] = Field(default_factory=list)
    # Recomputed from the profile; never taken from the client.
    risk_flags: list[RiskFlag] = Field(default_factory=list)
    # Where this intake originated. "" for organic, "life-event:<slug>",
    # or "persona:<persona_id>" for demo personas.
    entry_source: str = ""
    # Scenario/persona instructions appended to the system prompt. Derived
    # on the server from ``entry_source``; never taken from the client.
    persona_note: str = ""
    # User turns answered outside the scripted demo steps (crisis response,
    # life-event scenario follow-up). Subtracted when picking the next
    # scripted step so no question is skipped.
    scripted_turns_skipped: int = 0
    plan: IntakePlan | None = None


# ---------------------------------------------------------------------------
# Client-held intake state (the wire format)
# ---------------------------------------------------------------------------
#
# The browser keeps this in sessionStorage and sends it with every intake
# request; the server returns the updated copy and keeps nothing. Treat
# every field as untrusted input: the limits below are enforced by
# validation (422), the request body size by middleware (413), and
# app/services/intake_state.py re-redacts messages, re-grounds service ids
# against the catalog, and re-derives anything that reaches the prompt.

INTAKE_STATE_VERSION = 1
MAX_STATE_MESSAGES = 200
MAX_MESSAGE_CHARS = 10_000
MAX_BUTTONS = 12
MAX_BUTTON_CHARS = 200
MAX_PROFILE_TEXT = 200
MAX_PROFILE_LIST = 30
MAX_PROFILE_LIST_ITEM = 100
MAX_SCHOOL_CHILDREN = 15
MAX_MATCHED_IDS = 50

_LANGUAGE_PATTERN = r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$"
_ENTRY_SOURCE_PATTERN = r"^(|life-event:[a-z0-9-]{1,64}|persona:[A-Za-z0-9_-]{1,100})$"


class StateMessage(BaseModel):
    """A visible conversation turn. Only resident and assistant roles."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_MESSAGE_CHARS)
    suggested_buttons: list[Annotated[str, Field(max_length=MAX_BUTTON_CHARS)]] = Field(
        default_factory=list, max_length=MAX_BUTTONS
    )
    progress_percent: int = Field(default=0, ge=0, le=100)
    is_complete: bool = False
    crisis_detected: bool = False


def _check_profile_bounds(profile: ResidentProfile) -> ResidentProfile:
    for name, value in profile:
        if isinstance(value, str) and len(value) > MAX_PROFILE_TEXT:
            raise ValueError(f"profile.{name} is longer than {MAX_PROFILE_TEXT} characters")
        if isinstance(value, list):
            limit = MAX_SCHOOL_CHILDREN if name == "school_age_children" else MAX_PROFILE_LIST
            if len(value) > limit:
                raise ValueError(f"profile.{name} has more than {limit} items")
            for item in value:
                texts = (
                    [item.grade, item.district, *item.concerns]
                    if isinstance(item, SchoolAgeChild) else [item]
                )
                if isinstance(item, SchoolAgeChild) and len(item.concerns) > MAX_PROFILE_LIST:
                    raise ValueError(f"profile.{name} item has too many concerns")
                if any(len(str(t)) > MAX_PROFILE_LIST_ITEM for t in texts):
                    raise ValueError(f"profile.{name} item is too long")
    if profile.household_size is not None and not 0 <= profile.household_size <= 50:
        raise ValueError("profile.household_size must be between 0 and 50")
    return profile


class IntakeState(BaseModel):
    """Everything the intake flows need between requests, held by the browser."""

    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = INTAKE_STATE_VERSION
    language: str = Field(default="en", pattern=_LANGUAGE_PATTERN)
    status: Literal["in_progress", "completed"] = "in_progress"
    conversation: list[StateMessage] = Field(
        default_factory=list, max_length=MAX_STATE_MESSAGES
    )
    profile: ResidentProfile = Field(default_factory=ResidentProfile)
    entry_source: str = Field(default="", pattern=_ENTRY_SOURCE_PATTERN)
    scripted_turns_skipped: int = Field(default=0, ge=-50, le=MAX_STATE_MESSAGES)
    matched_service_ids: list[Annotated[str, Field(max_length=100)]] = Field(
        default_factory=list, max_length=MAX_MATCHED_IDS
    )
    plan: IntakePlan | None = None

    @field_validator("profile", mode="before")
    @classmethod
    def _profile_known_fields_only(cls, value: Any) -> Any:
        if isinstance(value, dict):
            unknown = set(value) - set(ResidentProfile.model_fields)
            if unknown:
                raise ValueError(f"unknown profile fields: {sorted(unknown)}")
            children = value.get("school_age_children")
            if isinstance(children, list):
                allowed = set(SchoolAgeChild.model_fields)
                for child in children:
                    if isinstance(child, dict) and set(child) - allowed:
                        raise ValueError("unknown school_age_children fields")
        return value

    @field_validator("profile")
    @classmethod
    def _profile_bounds(cls, value: ResidentProfile) -> ResidentProfile:
        return _check_profile_bounds(value)


# ---------------------------------------------------------------------------
# Demo resident (admin)
# ---------------------------------------------------------------------------

class DemoResident(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    email: str = ""
    zip_code: str = ""
    language: str = "en"
    household_size: int = 1
    profile: ResidentProfile = Field(default_factory=ResidentProfile)
    matched_services_count: int = 0
    saved_services: list[str] = Field(default_factory=list)
    signup_date: str = ""
    last_active: str = ""


# ---------------------------------------------------------------------------
# Analytics models (admin)
# ---------------------------------------------------------------------------

class DailySessionCount(BaseModel):
    date: str
    count: int


class AnalyticsOverview(BaseModel):
    total_sessions: int = 0
    total_residents: int = 0
    total_services: int = 0
    avg_matches_per_session: float = 0.0
    completion_rate: float = 0.0
    crisis_detections: int = 0
    top_categories: list[dict[str, Any]] = Field(default_factory=list)
    daily_sessions: list[DailySessionCount] = Field(default_factory=list)


class DemographicBucket(BaseModel):
    label: str
    count: int
    percentage: float = 0.0


class DemographicsData(BaseModel):
    age_ranges: list[DemographicBucket] = Field(default_factory=list)
    household_sizes: list[DemographicBucket] = Field(default_factory=list)
    zip_codes: list[DemographicBucket] = Field(default_factory=list)
    employment_statuses: list[DemographicBucket] = Field(default_factory=list)
    housing_situations: list[DemographicBucket] = Field(default_factory=list)
    insurance_statuses: list[DemographicBucket] = Field(default_factory=list)


class ServiceDemandItem(BaseModel):
    service_name: str
    category: str
    match_count: int
    trend: str = "stable"  # up | down | stable


class LanguageUsageItem(BaseModel):
    language_code: str
    language_name: str
    session_count: int
    percentage: float = 0.0


class EquityBucket(BaseModel):
    label: str
    portal_percentage: float
    census_percentage: float
    gap: float = 0.0


class EquityData(BaseModel):
    race_ethnicity: list[EquityBucket] = Field(default_factory=list)
    income_levels: list[EquityBucket] = Field(default_factory=list)
    geographic: list[EquityBucket] = Field(default_factory=list)
    language_access: list[EquityBucket] = Field(default_factory=list)


class AuditLogEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: str = ""
    actor: str = ""
    action: str = ""
    resource_type: str = ""
    resource_id: str = ""
    details: str = ""


class StaffMember(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    email: str
    role: str = "viewer"
    department: str = ""
    last_login: str = ""
    is_active: bool = True


# ---------------------------------------------------------------------------
# Request / response helpers
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


class IntakeStartRequest(BaseModel):
    language: str = Field(default="en", max_length=16)
    life_event: str | None = Field(default=None, max_length=64)
    focus: list[Annotated[str, Field(max_length=64)]] | None = Field(
        default=None, max_length=20
    )
    mode: Literal["text", "voice"] = "text"


class IntakeMessageRequest(BaseModel):
    state: IntakeState
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="", max_length=16)


class MapPin(BaseModel):
    id: str
    service_id: str
    name: str
    category: str
    latitude: float
    longitude: float
    open_now: bool | None = None
    next_open: str | None = None


class CrisisResource(BaseModel):
    name: str
    description: str
    phone: str
    available_24_7: bool = True
    languages: list[str] = Field(default_factory=lambda: ["en", "es"])


class BenefitsEstimate(BaseModel):
    total_monthly_value: float = 0.0
    total_annual_value: float = 0.0
    breakdown: list[dict[str, Any]] = Field(default_factory=list)
