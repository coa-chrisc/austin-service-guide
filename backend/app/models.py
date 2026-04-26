"""Pydantic models for the Austin Service Guide API."""

from __future__ import annotations

from datetime import datetime, date
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


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


class Service(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    slug: str
    provider_name: str = ""
    description: str = ""
    eligibility_summary: str = ""
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


class IntakeSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    language: str = "en"
    conversation: list[IntakeMessage] = Field(default_factory=list)
    extracted_profile: ResidentProfile = Field(default_factory=ResidentProfile)
    status: IntakeStatus = IntakeStatus.in_progress
    matches: list[ServiceMatch] = Field(default_factory=list)
    risk_flags: list[RiskFlag] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Full Responses-API input items (user messages, assistant messages,
    # reasoning items, function_calls, function_call_outputs). Replayed
    # verbatim each turn so the model has its own tool-call history.
    responses_input: list[dict[str, Any]] = Field(default_factory=list)


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
    language: str = "en"


class IntakeMessageRequest(BaseModel):
    message: str
    language: str = "en"


class MapPin(BaseModel):
    id: str
    service_id: str
    name: str
    category: str
    latitude: float
    longitude: float


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
