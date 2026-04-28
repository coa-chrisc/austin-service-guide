"""Realistic seed data for the Austin Service Guide demo.

All addresses, phone numbers, and coordinates reference real publicly-known
Austin-area social-service organizations.  Data is for **demonstration only**
and may not reflect current hours, eligibility, or availability.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta

from app.models import (
    AuditLogEntry,
    CrisisResource,
    DailySessionCount,
    DemographicBucket,
    DemoResident,
    EquityBucket,
    LanguageUsageItem,
    LifeEvent,
    ResidentProfile,
    SchoolAgeChild,
    Service,
    ServiceCategory,
    ServiceDemandItem,
    ServiceDocument,
    ServiceLocation,
    ServiceStatus,
    StaffMember,
)


# ── Catalog data lives in YAML ────────────────────────────────────────
# CATEGORIES / SERVICES / LIFE_EVENTS / CRISIS_RESOURCES are loaded from
# ``app/data/*.yaml`` at first access.  Edit those files (or
# ``scripts/dump_catalog_to_yaml.py`` to regenerate) — do not re-add the
# Python literals here.  See ``app/services/catalog_loader.py``.

from app.services.catalog_loader import (  # noqa: E402
    CATEGORIES,
    CRISIS_RESOURCES,
    LIFE_EVENTS,
    SERVICES,
)

# Integrity guard: every service category slug must exist in CATEGORIES.
_KNOWN_CATEGORY_SLUGS = {c.slug for c in CATEGORIES}
_BAD = [
    (s.slug, c)
    for s in SERVICES
    for c in s.categories
    if c not in _KNOWN_CATEGORY_SLUGS
]
assert not _BAD, f"Unknown category slugs in seed data: {_BAD[:5]}"



# ── Demo Residents ────────────────────────────────────────────────────

_TODAY = date.today()

def _date_str(days_ago: int) -> str:
    return (_TODAY - timedelta(days=days_ago)).isoformat()


DEMO_RESIDENTS: list[DemoResident] = [
    DemoResident(id="res-01", name="Maria Garcia", email="maria.garcia@example.com",
        zip_code="78741", language="es", household_size=4,
        profile=ResidentProfile(age_range="30-39", household_size=4, zip_code="78741",
            housing_situation="renting", employment_status="part-time",
            income_bracket="$20,000-$30,000", insurance_status="uninsured",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["food", "healthcare", "childcare"],
            languages_spoken=["es", "en"]),
        matched_services_count=8, saved_services=["svc-ctfb", "svc-commcare", "svc-wic"],
        signup_date=_date_str(45), last_active=_date_str(1)),
    DemoResident(id="res-02", name="James Washington", email="james.w@example.com",
        zip_code="78702", language="en", household_size=1,
        profile=ResidentProfile(age_range="50-59", household_size=1, zip_code="78702",
            housing_situation="homeless", employment_status="unemployed",
            income_bracket="$0-$10,000", insurance_status="medicaid",
            has_children=False, veteran_status=True, has_disability=True,
            immediate_needs=["housing", "healthcare", "food"],
            languages_spoken=["en"],
            crisis_indicators=["homelessness"]),
        matched_services_count=12, saved_services=["svc-mlf", "svc-agiforum", "svc-integral"],
        signup_date=_date_str(30), last_active=_date_str(0)),
    DemoResident(id="res-03", name="Linh Nguyen", email="linh.n@example.com",
        zip_code="78753", language="vi", household_size=5,
        profile=ResidentProfile(age_range="40-49", household_size=5, zip_code="78753",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$30,000-$40,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["childcare", "education"],
            languages_spoken=["vi", "en"]),
        matched_services_count=5, saved_services=["svc-headstart"],
        signup_date=_date_str(20), last_active=_date_str(3)),
    DemoResident(id="res-04", name="Robert Miller", email="r.miller@example.com",
        zip_code="78745", language="en", household_size=2,
        profile=ResidentProfile(age_range="70-79", household_size=2, zip_code="78745",
            housing_situation="own_home", employment_status="retired",
            income_bracket="$20,000-$30,000", insurance_status="medicare",
            has_children=False, veteran_status=True, has_disability=False,
            immediate_needs=["senior", "transportation"],
            languages_spoken=["en"]),
        matched_services_count=6, saved_services=["svc-mow", "svc-age", "svc-capmetro"],
        signup_date=_date_str(60), last_active=_date_str(5)),
    DemoResident(id="res-05", name="Fatima Al-Hassan", email="fatima.ah@example.com",
        zip_code="78758", language="ar", household_size=6,
        profile=ResidentProfile(age_range="30-39", household_size=6, zip_code="78758",
            housing_situation="renting", employment_status="unemployed",
            income_bracket="$10,000-$20,000", insurance_status="uninsured",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["food", "healthcare", "immigration", "employment"],
            languages_spoken=["ar", "en"]),
        matched_services_count=10, saved_services=["svc-ctfb", "svc-raices", "svc-commcare"],
        signup_date=_date_str(15), last_active=_date_str(0)),
    DemoResident(id="res-06", name="Chen Wei", email="chen.w@example.com",
        zip_code="78748", language="zh", household_size=3,
        profile=ResidentProfile(age_range="60-69", household_size=3, zip_code="78748",
            housing_situation="renting", employment_status="retired",
            income_bracket="$10,000-$20,000", insurance_status="medicaid",
            has_children=False, veteran_status=False, has_disability=True,
            immediate_needs=["senior", "healthcare", "food"],
            languages_spoken=["zh", "en"]),
        matched_services_count=7, saved_services=["svc-mow", "svc-age"],
        signup_date=_date_str(40), last_active=_date_str(2)),
    DemoResident(id="res-07", name="Sarah Johnson", email="sarah.j@example.com",
        zip_code="78704", language="en", household_size=3,
        profile=ResidentProfile(age_range="30-39", household_size=3, zip_code="78704",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$40,000-$50,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["childcare"],
            languages_spoken=["en"]),
        matched_services_count=4, saved_services=["svc-headstart", "svc-parks"],
        signup_date=_date_str(25), last_active=_date_str(7)),
    DemoResident(id="res-08", name="Miguel Torres", email="m.torres@example.com",
        zip_code="78721", language="es", household_size=1,
        profile=ResidentProfile(age_range="20-29", household_size=1, zip_code="78721",
            housing_situation="unstable", employment_status="unemployed",
            income_bracket="$0-$10,000", insurance_status="uninsured",
            has_children=False, veteran_status=False, has_disability=False,
            immediate_needs=["housing", "employment", "food"],
            languages_spoken=["es", "en"],
            crisis_indicators=["housing_instability"]),
        matched_services_count=9, saved_services=["svc-lifeworks", "svc-caritas", "svc-wfsa"],
        signup_date=_date_str(10), last_active=_date_str(0)),
    DemoResident(id="res-09", name="Dorothy Williams", email="d.williams@example.com",
        zip_code="78723", language="en", household_size=1,
        profile=ResidentProfile(age_range="80+", household_size=1, zip_code="78723",
            housing_situation="own_home", employment_status="retired",
            income_bracket="$10,000-$20,000", insurance_status="medicare",
            has_children=False, veteran_status=False, has_disability=True,
            immediate_needs=["senior", "food", "transportation"],
            languages_spoken=["en"]),
        matched_services_count=6, saved_services=["svc-mow", "svc-age", "svc-capmetro"],
        signup_date=_date_str(55), last_active=_date_str(4)),
    DemoResident(id="res-10", name="Ahmed Patel", email="a.patel@example.com",
        zip_code="78757", language="hi", household_size=4,
        profile=ResidentProfile(age_range="40-49", household_size=4, zip_code="78757",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$50,000-$60,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["education", "childcare"],
            languages_spoken=["hi", "en"]),
        matched_services_count=3, saved_services=["svc-headstart"],
        signup_date=_date_str(18), last_active=_date_str(10)),
    DemoResident(id="res-11", name="Jessica Martinez", email="j.martinez@example.com",
        zip_code="78741", language="es", household_size=2,
        profile=ResidentProfile(age_range="20-29", household_size=2, zip_code="78741",
            housing_situation="renting", employment_status="part-time",
            income_bracket="$10,000-$20,000", insurance_status="uninsured",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["healthcare", "food", "childcare"],
            languages_spoken=["es", "en"],
            crisis_indicators=["domestic_violence"]),
        matched_services_count=11, saved_services=["svc-safe", "svc-wic", "svc-commcare"],
        signup_date=_date_str(8), last_active=_date_str(0)),
    DemoResident(id="res-12", name="David Kim", email="d.kim@example.com",
        zip_code="78704", language="ko", household_size=2,
        profile=ResidentProfile(age_range="30-39", household_size=2, zip_code="78704",
            housing_situation="renting", employment_status="unemployed",
            income_bracket="$20,000-$30,000", insurance_status="cobra",
            has_children=False, veteran_status=False, has_disability=False,
            immediate_needs=["employment", "healthcare"],
            languages_spoken=["ko", "en"]),
        matched_services_count=5, saved_services=["svc-wfsa", "svc-goodwill"],
        signup_date=_date_str(12), last_active=_date_str(1)),
    DemoResident(id="res-13", name="Patricia Brown", email="p.brown@example.com",
        zip_code="78745", language="en", household_size=5,
        profile=ResidentProfile(age_range="40-49", household_size=5, zip_code="78745",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$30,000-$40,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["utilities", "food"],
            languages_spoken=["en"]),
        matched_services_count=6, saved_services=["svc-cap", "svc-ctfb"],
        signup_date=_date_str(35), last_active=_date_str(6)),
    DemoResident(id="res-14", name="Anthony Davis", email="a.davis@example.com",
        zip_code="78702", language="en", household_size=1,
        profile=ResidentProfile(age_range="30-39", household_size=1, zip_code="78702",
            housing_situation="renting", employment_status="employed",
            income_bracket="$20,000-$30,000", insurance_status="uninsured",
            has_children=False, veteran_status=True, has_disability=True,
            immediate_needs=["veterans", "healthcare", "disability"],
            languages_spoken=["en"]),
        matched_services_count=8, saved_services=["svc-tcvs", "svc-commcare", "svc-easter"],
        signup_date=_date_str(22), last_active=_date_str(2)),
    DemoResident(id="res-15", name="Rosa Hernandez", email="r.hernandez@example.com",
        zip_code="78753", language="es", household_size=7,
        profile=ResidentProfile(age_range="50-59", household_size=7, zip_code="78753",
            housing_situation="renting", employment_status="part-time",
            income_bracket="$20,000-$30,000", insurance_status="uninsured",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["food", "healthcare", "utilities", "immigration"],
            languages_spoken=["es"]),
        matched_services_count=10, saved_services=["svc-ctfb", "svc-wic", "svc-cap", "svc-raices"],
        signup_date=_date_str(28), last_active=_date_str(1)),
    DemoResident(id="res-16", name="William Thompson", email="w.thompson@example.com",
        zip_code="78758", language="en", household_size=1,
        profile=ResidentProfile(age_range="60-69", household_size=1, zip_code="78758",
            housing_situation="renting", employment_status="disabled",
            income_bracket="$10,000-$20,000", insurance_status="ssdi_medicare",
            has_children=False, veteran_status=True, has_disability=True,
            immediate_needs=["disability", "housing", "food", "transportation"],
            languages_spoken=["en"]),
        matched_services_count=9, saved_services=["svc-easter", "svc-capmetro", "svc-mow"],
        signup_date=_date_str(50), last_active=_date_str(3)),
    DemoResident(id="res-17", name="Amina Osei", email="a.osei@example.com",
        zip_code="78721", language="fr", household_size=3,
        profile=ResidentProfile(age_range="30-39", household_size=3, zip_code="78721",
            housing_situation="renting", employment_status="unemployed",
            income_bracket="$0-$10,000", insurance_status="uninsured",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["immigration", "employment", "food", "healthcare"],
            languages_spoken=["fr", "en"]),
        matched_services_count=11, saved_services=["svc-raices", "svc-ctfb", "svc-commcare"],
        signup_date=_date_str(5), last_active=_date_str(0)),
    DemoResident(id="res-18", name="Thomas Anderson", email="t.anderson@example.com",
        zip_code="78748", language="en", household_size=4,
        profile=ResidentProfile(age_range="40-49", household_size=4, zip_code="78748",
            housing_situation="own_home", employment_status="full-time",
            income_bracket="$60,000-$80,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["childcare"],
            languages_spoken=["en"]),
        matched_services_count=2, saved_services=["svc-parks"],
        signup_date=_date_str(14), last_active=_date_str(12)),
    DemoResident(id="res-19", name="Elena Volkov", email="e.volkov@example.com",
        zip_code="78704", language="en", household_size=1,
        profile=ResidentProfile(age_range="20-29", household_size=1, zip_code="78704",
            housing_situation="unstable", employment_status="gig_economy",
            income_bracket="$10,000-$20,000", insurance_status="uninsured",
            has_children=False, veteran_status=False, has_disability=False,
            immediate_needs=["housing", "healthcare", "employment"],
            languages_spoken=["en"],
            crisis_indicators=["housing_instability"]),
        matched_services_count=8, saved_services=["svc-foundation", "svc-commcare", "svc-wfsa"],
        signup_date=_date_str(7), last_active=_date_str(0)),
    DemoResident(id="res-20", name="Carlos Reyes", email="c.reyes@example.com",
        zip_code="78741", language="es", household_size=3,
        profile=ResidentProfile(age_range="30-39", household_size=3, zip_code="78741",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$30,000-$40,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["food", "utilities"],
            languages_spoken=["es", "en"]),
        matched_services_count=5, saved_services=["svc-ctfb", "svc-cap"],
        signup_date=_date_str(32), last_active=_date_str(4)),
    DemoResident(id="res-21", name="Grace Okafor", email="g.okafor@example.com",
        zip_code="78723", language="en", household_size=2,
        profile=ResidentProfile(age_range="30-39", household_size=2, zip_code="78723",
            housing_situation="renting", employment_status="part-time",
            income_bracket="$20,000-$30,000", insurance_status="marketplace",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["childcare", "employment"],
            languages_spoken=["en"]),
        matched_services_count=6, saved_services=["svc-headstart", "svc-wfsa"],
        signup_date=_date_str(19), last_active=_date_str(2)),
    DemoResident(id="res-22", name="Tran Van Duc", email="t.vanduc@example.com",
        zip_code="78753", language="vi", household_size=4,
        profile=ResidentProfile(age_range="50-59", household_size=4, zip_code="78753",
            housing_situation="renting", employment_status="employed",
            income_bracket="$30,000-$40,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["education", "food"],
            languages_spoken=["vi", "en"]),
        matched_services_count=4, saved_services=["svc-afn", "svc-ctfb"],
        signup_date=_date_str(27), last_active=_date_str(5)),
    DemoResident(id="res-23", name="Karen Mitchell", email="k.mitchell@example.com",
        zip_code="78757", language="en", household_size=1,
        profile=ResidentProfile(age_range="70-79", household_size=1, zip_code="78757",
            housing_situation="own_home", employment_status="retired",
            income_bracket="$20,000-$30,000", insurance_status="medicare",
            has_children=False, veteran_status=False, has_disability=True,
            immediate_needs=["senior", "disability", "transportation"],
            languages_spoken=["en"]),
        matched_services_count=7, saved_services=["svc-age", "svc-mow", "svc-capmetro", "svc-easter"],
        signup_date=_date_str(42), last_active=_date_str(1)),
    DemoResident(id="res-24", name="Juan Morales", email="j.morales@example.com",
        zip_code="78745", language="es", household_size=2,
        profile=ResidentProfile(age_range="20-29", household_size=2, zip_code="78745",
            housing_situation="renting", employment_status="unemployed",
            income_bracket="$10,000-$20,000", insurance_status="uninsured",
            has_children=False, veteran_status=False, has_disability=False,
            immediate_needs=["employment", "education", "food"],
            languages_spoken=["es", "en"]),
        matched_services_count=7, saved_services=["svc-capidea", "svc-goodwill", "svc-ctfb"],
        signup_date=_date_str(9), last_active=_date_str(0)),
    DemoResident(id="res-25", name="Margaret Chen", email="m.chen@example.com",
        zip_code="78748", language="zh", household_size=3,
        profile=ResidentProfile(age_range="40-49", household_size=3, zip_code="78748",
            housing_situation="own_home", employment_status="full-time",
            income_bracket="$60,000-$80,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["childcare", "education"],
            languages_spoken=["zh", "en"]),
        matched_services_count=3, saved_services=["svc-headstart"],
        signup_date=_date_str(16), last_active=_date_str(8)),
    DemoResident(id="res-26", name="Stephanie Reyes", email="s.reyes@example.com",
        zip_code="78753", language="en", household_size=3,
        profile=ResidentProfile(age_range="40-49", household_size=3, zip_code="78753",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$30,000-$40,000", insurance_status="employer",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["mental health", "schools"],
            languages_spoken=["en"],
            school_age_children=[
                SchoolAgeChild(grade="7", district="AISD", concerns=["anxiety", "attendance"]),
            ]),
        matched_services_count=4, saved_services=["svc-cis-central-tx", "svc-vida-clinic-schools"],
        signup_date=_date_str(11), last_active=_date_str(0)),
    DemoResident(id="res-27", name="DeShawn Perry", email="d.perry@example.com",
        zip_code="78724", language="en", household_size=4,
        profile=ResidentProfile(age_range="30-39", household_size=4, zip_code="78724",
            housing_situation="renting", employment_status="full-time",
            income_bracket="$20,000-$30,000", insurance_status="medicaid",
            has_children=True, veteran_status=False, has_disability=False,
            immediate_needs=["mental health", "schools"],
            languages_spoken=["en"],
            school_age_children=[
                SchoolAgeChild(grade="9", district="Manor ISD", concerns=["depression", "behavioral"]),
                SchoolAgeChild(grade="5", district="Manor ISD", concerns=[]),
            ]),
        matched_services_count=5, saved_services=["svc-cis-central-tx", "svc-integral"],
        signup_date=_date_str(6), last_active=_date_str(0)),
]


# ── Simulated Analytics ──────────────────────────────────────────────

def _generate_daily_sessions(days: int = 30) -> list[DailySessionCount]:
    """Generate realistic-looking daily session counts."""
    result = []
    base = 35
    for i in range(days, 0, -1):
        d = (_TODAY - timedelta(days=i)).isoformat()
        dow = (_TODAY - timedelta(days=i)).weekday()
        # Weekend dip
        noise = random.randint(-8, 12)
        weekend_mod = -15 if dow >= 5 else 0
        # Slight upward trend
        trend = int(i * -0.3)
        count = max(5, base + noise + weekend_mod - trend)
        result.append(DailySessionCount(date=d, count=count))
    return result


def generate_analytics_overview() -> dict:
    return {
        "total_sessions": 1_247,
        "total_residents": len(DEMO_RESIDENTS),
        "total_services": len(SERVICES),
        "avg_matches_per_session": 6.8,
        "completion_rate": 0.74,
        "crisis_detections": 23,
        "top_categories": [
            {"name": "Food Assistance", "count": 412},
            {"name": "Healthcare", "count": 389},
            {"name": "Housing", "count": 298},
            {"name": "Employment", "count": 234},
            {"name": "Utilities", "count": 178},
        ],
        "daily_sessions": [s.model_dump() for s in _generate_daily_sessions()],
    }


def generate_demographics_data() -> dict:
    return {
        "age_ranges": [
            {"label": "18-24", "count": 87, "percentage": 7.0},
            {"label": "25-34", "count": 312, "percentage": 25.0},
            {"label": "35-44", "count": 287, "percentage": 23.0},
            {"label": "45-54", "count": 199, "percentage": 16.0},
            {"label": "55-64", "count": 174, "percentage": 14.0},
            {"label": "65-74", "count": 125, "percentage": 10.0},
            {"label": "75+", "count": 63, "percentage": 5.0},
        ],
        "household_sizes": [
            {"label": "1 person", "count": 324, "percentage": 26.0},
            {"label": "2 people", "count": 275, "percentage": 22.0},
            {"label": "3 people", "count": 237, "percentage": 19.0},
            {"label": "4 people", "count": 212, "percentage": 17.0},
            {"label": "5+ people", "count": 199, "percentage": 16.0},
        ],
        "zip_codes": [
            {"label": "78741", "count": 198, "percentage": 15.9},
            {"label": "78753", "count": 162, "percentage": 13.0},
            {"label": "78758", "count": 148, "percentage": 11.9},
            {"label": "78745", "count": 137, "percentage": 11.0},
            {"label": "78702", "count": 124, "percentage": 9.9},
            {"label": "78721", "count": 112, "percentage": 9.0},
            {"label": "78723", "count": 98, "percentage": 7.9},
            {"label": "78704", "count": 89, "percentage": 7.1},
            {"label": "78748", "count": 87, "percentage": 7.0},
            {"label": "78757", "count": 92, "percentage": 7.4},
        ],
        "employment_statuses": [
            {"label": "Unemployed", "count": 374, "percentage": 30.0},
            {"label": "Part-time", "count": 262, "percentage": 21.0},
            {"label": "Full-time", "count": 237, "percentage": 19.0},
            {"label": "Retired", "count": 175, "percentage": 14.0},
            {"label": "Disabled", "count": 112, "percentage": 9.0},
            {"label": "Gig economy", "count": 87, "percentage": 7.0},
        ],
        "housing_situations": [
            {"label": "Renting", "count": 524, "percentage": 42.0},
            {"label": "Own home", "count": 274, "percentage": 22.0},
            {"label": "Unstable/couch-surfing", "count": 199, "percentage": 16.0},
            {"label": "Homeless", "count": 137, "percentage": 11.0},
            {"label": "Subsidized housing", "count": 113, "percentage": 9.0},
        ],
        "insurance_statuses": [
            {"label": "Uninsured", "count": 399, "percentage": 32.0},
            {"label": "Medicaid", "count": 262, "percentage": 21.0},
            {"label": "Employer", "count": 237, "percentage": 19.0},
            {"label": "Medicare", "count": 162, "percentage": 13.0},
            {"label": "Marketplace (ACA)", "count": 112, "percentage": 9.0},
            {"label": "Other", "count": 75, "percentage": 6.0},
        ],
    }


def generate_service_demand() -> list[dict]:
    return [
        {"service_name": "Central Texas Food Bank", "category": "Food Assistance", "match_count": 312, "trend": "up"},
        {"service_name": "CommUnity Care Health Centers", "category": "Healthcare", "match_count": 289, "trend": "up"},
        {"service_name": "SNAP Enrollment Assistance", "category": "Food Assistance", "match_count": 245, "trend": "stable"},
        {"service_name": "Customer Assistance Program (CAP)", "category": "Utilities", "match_count": 198, "trend": "up"},
        {"service_name": "Workforce Solutions Capital Area", "category": "Employment", "match_count": 187, "trend": "stable"},
        {"service_name": "Foundation Communities", "category": "Housing", "match_count": 176, "trend": "up"},
        {"service_name": "Austin Public Health WIC Program", "category": "Food / Healthcare", "match_count": 165, "trend": "stable"},
        {"service_name": "Integral Care", "category": "Healthcare", "match_count": 154, "trend": "up"},
        {"service_name": "Medicaid Enrollment Assistance", "category": "Healthcare", "match_count": 143, "trend": "stable"},
        {"service_name": "Capital Metro Transit", "category": "Transportation", "match_count": 132, "trend": "stable"},
        {"service_name": "SAFE Alliance", "category": "Emergency", "match_count": 89, "trend": "down"},
        {"service_name": "Texas RioGrande Legal Aid", "category": "Legal", "match_count": 78, "trend": "stable"},
        {"service_name": "Caritas of Austin", "category": "Housing / Food", "match_count": 67, "trend": "up"},
        {"service_name": "Goodwill Central Texas", "category": "Employment", "match_count": 56, "trend": "stable"},
        {"service_name": "RAICES Texas", "category": "Immigration", "match_count": 45, "trend": "up"},
    ]


def generate_language_usage() -> list[dict]:
    return [
        {"language_code": "en", "language_name": "English", "session_count": 749, "percentage": 60.0},
        {"language_code": "es", "language_name": "Spanish", "session_count": 324, "percentage": 26.0},
        {"language_code": "vi", "language_name": "Vietnamese", "session_count": 62, "percentage": 5.0},
        {"language_code": "zh", "language_name": "Chinese (Mandarin)", "session_count": 50, "percentage": 4.0},
        {"language_code": "ar", "language_name": "Arabic", "session_count": 25, "percentage": 2.0},
        {"language_code": "hi", "language_name": "Hindi", "session_count": 19, "percentage": 1.5},
        {"language_code": "ko", "language_name": "Korean", "session_count": 10, "percentage": 0.8},
        {"language_code": "fr", "language_name": "French", "session_count": 8, "percentage": 0.7},
    ]


def generate_equity_data() -> dict:
    return {
        "race_ethnicity": [
            {"label": "Hispanic/Latino", "portal_percentage": 38.0, "census_percentage": 33.0, "gap": 5.0},
            {"label": "White (non-Hispanic)", "portal_percentage": 28.0, "census_percentage": 48.0, "gap": -20.0},
            {"label": "Black/African American", "portal_percentage": 18.0, "census_percentage": 8.0, "gap": 10.0},
            {"label": "Asian", "portal_percentage": 10.0, "census_percentage": 8.0, "gap": 2.0},
            {"label": "Other/Multiracial", "portal_percentage": 6.0, "census_percentage": 3.0, "gap": 3.0},
        ],
        "income_levels": [
            {"label": "Below poverty", "portal_percentage": 42.0, "census_percentage": 14.0, "gap": 28.0},
            {"label": "Low income (100-200% FPL)", "portal_percentage": 30.0, "census_percentage": 12.0, "gap": 18.0},
            {"label": "Moderate (200-400% FPL)", "portal_percentage": 20.0, "census_percentage": 28.0, "gap": -8.0},
            {"label": "Above 400% FPL", "portal_percentage": 8.0, "census_percentage": 46.0, "gap": -38.0},
        ],
        "geographic": [
            {"label": "East Austin (78702, 78721, 78722, 78723)", "portal_percentage": 32.0, "census_percentage": 18.0, "gap": 14.0},
            {"label": "North Austin (78753, 78758)", "portal_percentage": 25.0, "census_percentage": 15.0, "gap": 10.0},
            {"label": "South Austin (78741, 78744, 78745)", "portal_percentage": 28.0, "census_percentage": 20.0, "gap": 8.0},
            {"label": "Central/West Austin", "portal_percentage": 8.0, "census_percentage": 25.0, "gap": -17.0},
            {"label": "Other Travis County", "portal_percentage": 7.0, "census_percentage": 22.0, "gap": -15.0},
        ],
        "language_access": [
            {"label": "English only", "portal_percentage": 60.0, "census_percentage": 62.0, "gap": -2.0},
            {"label": "Spanish", "portal_percentage": 26.0, "census_percentage": 28.0, "gap": -2.0},
            {"label": "Vietnamese", "portal_percentage": 5.0, "census_percentage": 2.0, "gap": 3.0},
            {"label": "Chinese languages", "portal_percentage": 4.0, "census_percentage": 2.5, "gap": 1.5},
            {"label": "Other", "portal_percentage": 5.0, "census_percentage": 5.5, "gap": -0.5},
        ],
        # Disparity alerts surface zips where match-rate has dropped
        # meaningfully below the citywide baseline. The 8-point sparkline
        # is the trailing 8-week match-rate series the frontend renders.
        "disparity_alerts": [
            {
                "zip": "78702",
                "council_district": "1",
                "label": "East Austin / Holly",
                "match_rate": 41.0,
                "baseline": 62.0,
                "delta": -21.0,
                "severity": "critical",
                "note": "Long-term residents reporting displacement pressure — match rate dropped 21pts in 6 weeks.",
                "sparkline": [60, 58, 56, 52, 49, 46, 43, 41],
            },
            {
                "zip": "78721",
                "council_district": "1",
                "label": "MLK / Rosewood",
                "match_rate": 47.0,
                "baseline": 62.0,
                "delta": -15.0,
                "severity": "high",
                "note": "Spanish-language sessions stalling at the income-eligibility step.",
                "sparkline": [61, 60, 58, 55, 53, 50, 48, 47],
            },
            {
                "zip": "78724",
                "council_district": "1",
                "label": "Colony Park",
                "match_rate": 49.0,
                "baseline": 62.0,
                "delta": -13.0,
                "severity": "high",
                "note": "K-12 mental-health flag rising; CIS partner coverage gap.",
                "sparkline": [60, 59, 57, 55, 53, 52, 50, 49],
            },
            {
                "zip": "78744",
                "council_district": "2",
                "label": "Dove Springs",
                "match_rate": 53.0,
                "baseline": 62.0,
                "delta": -9.0,
                "severity": "medium",
                "note": "Heat-vulnerable households climbing; cooling-center awareness lagging.",
                "sparkline": [60, 60, 58, 57, 56, 55, 54, 53],
            },
        ],
    }


# ── Audit Log ─────────────────────────────────────────────────────────

def generate_audit_log() -> list[AuditLogEntry]:
    return [
        AuditLogEntry(id="aud-01", timestamp=_date_str(0) + "T14:32:00Z", actor="admin@austin.gov",
            action="update", resource_type="service", resource_id="svc-commcare",
            details="Updated hours for East Austin Health Center"),
        AuditLogEntry(id="aud-02", timestamp=_date_str(1) + "T10:15:00Z", actor="admin@austin.gov",
            action="create", resource_type="service", resource_id="svc-new-01",
            details="Added new service: COVID-19 Vaccination Clinic"),
        AuditLogEntry(id="aud-03", timestamp=_date_str(2) + "T09:45:00Z", actor="supervisor@austin.gov",
            action="review", resource_type="resident", resource_id="res-02",
            details="Reviewed high-risk case — referred to housing coordinator"),
        AuditLogEntry(id="aud-04", timestamp=_date_str(3) + "T16:20:00Z", actor="admin@austin.gov",
            action="update", resource_type="service", resource_id="svc-ctfb",
            details="Updated mobile pantry schedule for Dove Springs"),
        AuditLogEntry(id="aud-05", timestamp=_date_str(4) + "T11:00:00Z", actor="data@austin.gov",
            action="export", resource_type="analytics", resource_id="",
            details="Exported monthly equity report"),
        AuditLogEntry(id="aud-06", timestamp=_date_str(5) + "T13:10:00Z", actor="supervisor@austin.gov",
            action="flag", resource_type="session", resource_id="sess-128",
            details="Flagged session for quality review — crisis protocol triggered"),
        AuditLogEntry(id="aud-07", timestamp=_date_str(6) + "T08:30:00Z", actor="admin@austin.gov",
            action="deactivate", resource_type="service", resource_id="svc-seasonal-01",
            details="Deactivated seasonal cooling center (end of summer)"),
        AuditLogEntry(id="aud-08", timestamp=_date_str(7) + "T15:45:00Z", actor="staff@austin.gov",
            action="update", resource_type="service", resource_id="svc-safe",
            details="Updated SAFE Alliance contact information"),
    ]


# ── Staff ─────────────────────────────────────────────────────────────

DEMO_STAFF: list[StaffMember] = [
    StaffMember(id="staff-01", name="Sarah Chen", email="s.chen@austin.gov",
        role="admin", department="Health & Human Services", last_login=_date_str(0), is_active=True),
    StaffMember(id="staff-02", name="Marcus Johnson", email="m.johnson@austin.gov",
        role="supervisor", department="Health & Human Services", last_login=_date_str(0), is_active=True),
    StaffMember(id="staff-03", name="Elena Rodriguez", email="e.rodriguez@austin.gov",
        role="staff", department="Community Services", last_login=_date_str(1), is_active=True),
    StaffMember(id="staff-04", name="David Park", email="d.park@austin.gov",
        role="data_analyst", department="Innovation Office", last_login=_date_str(0), is_active=True),
    StaffMember(id="staff-05", name="Linda Thompson", email="l.thompson@austin.gov",
        role="viewer", department="City Council - District 3", last_login=_date_str(3), is_active=True),
    StaffMember(id="staff-06", name="Robert Garcia", email="r.garcia@austin.gov",
        role="staff", department="Equity Office", last_login=_date_str(2), is_active=True),
]


# ── Eligibility Rules ────────────────────────────────────────────────

def generate_eligibility_rules() -> list[dict]:
    return [
        {
            "id": "rule-snap-income",
            "name": "SNAP Income Limit (130% FPL)",
            "category": "food",
            "criteria": "Household monthly gross income ≤ 130% of Federal Poverty Level",
            "services": ["SNAP Benefits", "WIC", "Central Texas Food Bank"],
            "hits_30d": 412,
            "is_active": True,
            "last_updated": _date_str(7),
        },
        {
            "id": "rule-medicaid-adult",
            "name": "Texas Medicaid — Adult",
            "category": "healthcare",
            "criteria": "Pregnant, parent of minor, or disabled; income ≤ 138% FPL",
            "services": ["Texas Medicaid", "CommUnityCare Sliding Scale"],
            "hits_30d": 287,
            "is_active": True,
            "last_updated": _date_str(14),
        },
        {
            "id": "rule-childcare-ccs",
            "name": "Child Care Subsidy (Workforce Solutions)",
            "category": "childcare",
            "criteria": "Working/in school + child < 13 + income ≤ 85% State Median",
            "services": ["Workforce Solutions Child Care"],
            "hits_30d": 156,
            "is_active": True,
            "last_updated": _date_str(21),
        },
        {
            "id": "rule-rental-erap",
            "name": "Emergency Rental Assistance",
            "category": "housing",
            "criteria": "At risk of homelessness + income ≤ 80% AMI + COVID/economic hardship",
            "services": ["Travis County ERAP", "City of Austin RENT"],
            "hits_30d": 198,
            "is_active": True,
            "last_updated": _date_str(3),
        },
        {
            "id": "rule-veteran-vha",
            "name": "VA Healthcare Enrollment",
            "category": "veterans",
            "criteria": "Honorable discharge + minimum service requirement",
            "services": ["Austin VA Outpatient Clinic", "Veterans Crisis Line"],
            "hits_30d": 64,
            "is_active": True,
            "last_updated": _date_str(45),
        },
        {
            "id": "rule-utility-liheap",
            "name": "LIHEAP Utility Assistance",
            "category": "utilities",
            "criteria": "Income ≤ 150% FPL + responsible for utility bill",
            "services": ["Travis County LIHEAP", "Austin Energy Plus 1"],
            "hits_30d": 142,
            "is_active": True,
            "last_updated": _date_str(10),
        },
        {
            "id": "rule-senior-65",
            "name": "Senior Services (65+)",
            "category": "senior",
            "criteria": "Age ≥ 65 + Travis County resident",
            "services": ["Meals on Wheels Central Texas", "AGE of Central Texas"],
            "hits_30d": 89,
            "is_active": True,
            "last_updated": _date_str(30),
        },
        {
            "id": "rule-disability-ssdi",
            "name": "Disability Support Services",
            "category": "disability",
            "criteria": "Documented disability per SSA criteria",
            "services": ["VR Services", "Easter Seals Central Texas"],
            "hits_30d": 51,
            "is_active": True,
            "last_updated": _date_str(60),
        },
        {
            "id": "rule-immigration-eligible",
            "name": "Immigration-Eligible Programs",
            "category": "immigration",
            "criteria": "Lawful Permanent Resident OR qualifying status (refugee/asylee/VAWA)",
            "services": ["Catholic Charities Immigration Legal", "American Gateways"],
            "hits_30d": 73,
            "is_active": True,
            "last_updated": _date_str(18),
        },
        {
            "id": "rule-crisis-override",
            "name": "Crisis Override (No Eligibility Check)",
            "category": "emergency",
            "criteria": "Crisis indicators detected — bypass normal eligibility checks",
            "services": ["988 Lifeline", "SAFE Alliance", "Front Steps Shelter"],
            "hits_30d": 23,
            "is_active": True,
            "last_updated": _date_str(2),
        },
        {
            "id": "rule-cap-funding-ymca",
            "name": "YMCA Financial Assistance (capped)",
            "category": "childcare",
            "criteria": "Sliding fee + capacity available (currently full Q2)",
            "services": ["YMCA of Austin"],
            "hits_30d": 12,
            "is_active": False,
            "last_updated": _date_str(5),
        },
    ]


# ── Demand map (geographic intensity) ────────────────────────────────

def generate_demand_map() -> list[dict]:
    # heat_intensity / heat_vulnerable_sessions reflect a simplified Austin
    # heat-vulnerability picture (urban heat island + low tree canopy + lower
    # AC penetration) — eastern crescent zips skew highest.
    return [
        {"zip": "78741", "lat": 30.2161, "lng": -97.7222, "sessions": 184,
         "top_categories": ["housing", "food", "healthcare"], "intensity": "high",
         "heat_intensity": "high", "heat_vulnerable_sessions": 47},
        {"zip": "78744", "lat": 30.1797, "lng": -97.7510, "sessions": 168,
         "top_categories": ["food", "childcare", "employment"], "intensity": "high",
         "heat_intensity": "high", "heat_vulnerable_sessions": 51},
        {"zip": "78758", "lat": 30.3835, "lng": -97.7000, "sessions": 142,
         "top_categories": ["healthcare", "immigration", "food"], "intensity": "high",
         "heat_intensity": "high", "heat_vulnerable_sessions": 33},
        {"zip": "78753", "lat": 30.3680, "lng": -97.6770, "sessions": 131,
         "top_categories": ["food", "childcare", "housing"], "intensity": "high",
         "heat_intensity": "high", "heat_vulnerable_sessions": 29},
        {"zip": "78745", "lat": 30.2080, "lng": -97.8000, "sessions": 118,
         "top_categories": ["healthcare", "utilities", "food"], "intensity": "medium",
         "heat_intensity": "medium", "heat_vulnerable_sessions": 18},
        {"zip": "78704", "lat": 30.2455, "lng": -97.7642, "sessions": 95,
         "top_categories": ["housing", "healthcare", "legal"], "intensity": "medium",
         "heat_intensity": "low", "heat_vulnerable_sessions": 6},
        {"zip": "78702", "lat": 30.2638, "lng": -97.7186, "sessions": 88,
         "top_categories": ["housing", "food", "employment"], "intensity": "medium",
         "heat_intensity": "medium", "heat_vulnerable_sessions": 22},
        {"zip": "78751", "lat": 30.3097, "lng": -97.7224, "sessions": 71,
         "top_categories": ["healthcare", "housing", "education"], "intensity": "medium",
         "heat_intensity": "low", "heat_vulnerable_sessions": 4},
        {"zip": "78724", "lat": 30.3090, "lng": -97.6450, "sessions": 64,
         "top_categories": ["food", "transportation", "employment"], "intensity": "medium",
         "heat_intensity": "medium", "heat_vulnerable_sessions": 19},
        {"zip": "78754", "lat": 30.3470, "lng": -97.6580, "sessions": 58,
         "top_categories": ["childcare", "food", "housing"], "intensity": "low",
         "heat_intensity": "medium", "heat_vulnerable_sessions": 11},
        {"zip": "78617", "lat": 30.1830, "lng": -97.6320, "sessions": 47,
         "top_categories": ["transportation", "food", "healthcare"], "intensity": "low",
         "heat_intensity": "high", "heat_vulnerable_sessions": 16},
        {"zip": "78722", "lat": 30.2876, "lng": -97.7050, "sessions": 41,
         "top_categories": ["healthcare", "education", "housing"], "intensity": "low",
         "heat_intensity": "medium", "heat_vulnerable_sessions": 9},
        {"zip": "78701", "lat": 30.2700, "lng": -97.7400, "sessions": 38,
         "top_categories": ["emergency", "legal", "healthcare"], "intensity": "low",
         "heat_intensity": "low", "heat_vulnerable_sessions": 3},
        {"zip": "78723", "lat": 30.3120, "lng": -97.6780, "sessions": 35,
         "top_categories": ["food", "healthcare", "childcare"], "intensity": "low",
         "heat_intensity": "medium", "heat_vulnerable_sessions": 8},
    ]


# ── Partner coordination gaps ────────────────────────────────────────

def generate_partner_gaps() -> dict:
    """Surface 'referred but not connected' rates by partner.

    Each partner shows: total referrals, connections (resident reached or
    services started), the gap (referrals minus connections), and a small
    set of the resident-side reasons coordinators logged.
    """
    partners = [
        {
            "partner": "Refugee Services of Texas",
            "category": "refugee",
            "referrals": 47,
            "connections": 19,
            "gap": 28,
            "primary_languages": ["ar", "fa", "ps"],
            "top_reasons": [
                "Phone number disconnected (15)",
                "Voicemail full / no callback (8)",
                "Resident moved zips (3)",
                "Caseload temporarily closed (2)",
            ],
            "trend": [42, 41, 38, 35, 32, 30, 29, 28],
        },
        {
            "partner": "Multicultural Refugee Coalition",
            "category": "refugee",
            "referrals": 31,
            "connections": 18,
            "gap": 13,
            "primary_languages": ["ar", "sw", "fr"],
            "top_reasons": [
                "Working hours conflict with resident's job (6)",
                "Transportation to north Austin office (4)",
                "Childcare needed during intake (2)",
                "Resident requested woman case worker (1)",
            ],
            "trend": [16, 17, 16, 15, 14, 14, 13, 13],
        },
        {
            "partner": "iACT Multifaith Food Pantry",
            "category": "food",
            "referrals": 56,
            "connections": 41,
            "gap": 15,
            "primary_languages": ["ar", "fa", "es"],
            "top_reasons": [
                "Hours don't fit resident schedule (7)",
                "First-visit registration unclear (4)",
                "No transportation to north Austin (3)",
                "Halal stock-out reported (1)",
            ],
            "trend": [22, 21, 19, 18, 17, 16, 15, 15],
        },
        {
            "partner": "Communities In Schools of Central Texas",
            "category": "schools",
            "referrals": 38,
            "connections": 24,
            "gap": 14,
            "primary_languages": ["en", "es"],
            "top_reasons": [
                "Campus is not a CIS partner site (6)",
                "Parent consent form not returned (4)",
                "Site coordinator caseload full (3)",
                "Family declined after initial outreach (1)",
            ],
            "trend": [17, 17, 16, 16, 15, 15, 14, 14],
        },
    ]
    total_referrals = sum(p["referrals"] for p in partners)
    total_connections = sum(p["connections"] for p in partners)
    total_gap = total_referrals - total_connections
    return {
        "totals": {
            "referrals": total_referrals,
            "connections": total_connections,
            "gap": total_gap,
            "connection_rate": round(total_connections / total_referrals, 3),
        },
        "partners": partners,
    }


# ── Reports ──────────────────────────────────────────────────────────

def generate_reports() -> list[dict]:
    return [
        {
            "id": "rpt-monthly-overview",
            "title": "Monthly Service Overview",
            "description": "Sessions, completions, top services, and crisis flags for the past 30 days.",
            "category": "Operations",
            "format": "PDF",
            "row_count": 1,
            "last_run": _date_str(1) + "T07:00:00Z",
            "schedule": "Monthly (1st of month, 7am)",
            "owner": "data@austin.gov",
        },
        {
            "id": "rpt-equity-quarterly",
            "title": "Quarterly Equity Report",
            "description": "Portal demographics vs. Census; access gaps by ZIP, language, and income.",
            "category": "Equity",
            "format": "PDF + CSV",
            "row_count": 412,
            "last_run": _date_str(7) + "T07:00:00Z",
            "schedule": "Quarterly",
            "owner": "equity@austin.gov",
        },
        {
            "id": "rpt-service-demand",
            "title": "Service Demand by ZIP",
            "description": "Session counts and top requested categories per ZIP code, ranked.",
            "category": "Analytics",
            "format": "CSV",
            "row_count": 187,
            "last_run": _date_str(0) + "T07:00:00Z",
            "schedule": "Daily (7am)",
            "owner": "data@austin.gov",
        },
        {
            "id": "rpt-language-access",
            "title": "Language Access Summary",
            "description": "Sessions by language, language switches, and untranslated query log.",
            "category": "Equity",
            "format": "CSV",
            "row_count": 92,
            "last_run": _date_str(2) + "T07:00:00Z",
            "schedule": "Weekly (Mondays)",
            "owner": "equity@austin.gov",
        },
        {
            "id": "rpt-crisis-flags",
            "title": "Crisis Flag Audit",
            "description": "All sessions where crisis protocol was triggered, with resolution status.",
            "category": "Operations",
            "format": "CSV",
            "row_count": 23,
            "last_run": _date_str(0) + "T07:00:00Z",
            "schedule": "Daily (7am)",
            "owner": "supervisor@austin.gov",
        },
        {
            "id": "rpt-eligibility-hits",
            "title": "Eligibility Rule Hit Counts",
            "description": "Which eligibility rules fire most often, and which never fire (candidates for review).",
            "category": "Catalog",
            "format": "CSV",
            "row_count": 11,
            "last_run": _date_str(3) + "T07:00:00Z",
            "schedule": "Weekly (Wednesdays)",
            "owner": "data@austin.gov",
        },
        {
            "id": "rpt-staff-activity",
            "title": "Staff Activity Log",
            "description": "Edits, reviews, and exports by staff member and department.",
            "category": "System",
            "format": "CSV",
            "row_count": 248,
            "last_run": _date_str(1) + "T07:00:00Z",
            "schedule": "Weekly (Mondays)",
            "owner": "admin@austin.gov",
        },
        {
            "id": "rpt-partner-gaps",
            "title": "Partner Coordination Gaps",
            "description": "Referrals that did not result in a connection, grouped by partner — surfaces handoff failures across refugee, food, and schools partners.",
            "category": "Equity",
            "format": "PDF + CSV",
            "row_count": 4,
            "last_run": _date_str(0) + "T07:00:00Z",
            "schedule": "Weekly (Mondays)",
            "owner": "equity@austin.gov",
        },
        {
            "id": "rpt-incomplete-sessions",
            "title": "Incomplete Sessions",
            "description": "Sessions abandoned mid-intake, with last question reached.",
            "category": "Operations",
            "format": "CSV",
            "row_count": 76,
            "last_run": _date_str(0) + "T07:00:00Z",
            "schedule": "Daily (7am)",
            "owner": "supervisor@austin.gov",
        },
    ]

