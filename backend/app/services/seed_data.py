"""Realistic seed data for the Civic Service Guide demo (Austin reference deployment).

All addresses, phone numbers, and coordinates reference real publicly-known
Austin-area social-service organizations.  Data is for **demonstration only**
and may not reflect current hours, eligibility, or availability.

The synthetic admin-console data (residents, analytics, audit log, ...) lives in
``admin_demo.yaml`` in the data pack; a pack without that file serves empty
admin demo views.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from app.models import (
    AuditLogEntry,
    DailySessionCount,
    DemoResident,
    StaffMember,
)
from app.services.data_pack import read_yaml


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


# ── Admin demo data (synthetic, from the data pack) ──────────────────

_TODAY = date.today()


def _date_str(days_ago: int) -> str:
    return (_TODAY - timedelta(days=days_ago)).isoformat()


@lru_cache(maxsize=1)
def _demo() -> dict[str, Any]:
    """``admin_demo.yaml`` from the data pack; empty when the pack omits it."""
    return read_yaml("admin_demo.yaml", required=False) or {}


def _items(key: str) -> list:
    return list(_demo().get(key) or [])


def _with_date(entry: dict, days_key: str, out_key: str, time: str = "") -> dict:
    """Replace ``<days_key>`` (days ago) with an ISO date (+ ``T<time>``) under ``out_key``."""
    entry = dict(entry)
    stamp = _date_str(entry.pop(days_key))
    entry[out_key] = f"{stamp}T{time}" if time else stamp
    return entry


@lru_cache(maxsize=1)
def get_demo_residents() -> list[DemoResident]:
    return [
        DemoResident(**_with_date(
            _with_date(r, "signup_days_ago", "signup_date"),
            "last_active_days_ago", "last_active"))
        for r in _items("residents")
    ]


@lru_cache(maxsize=1)
def get_demo_staff() -> list[StaffMember]:
    return [StaffMember(**_with_date(m, "last_login_days_ago", "last_login")) for m in _items("staff")]


# ── Simulated Analytics ──────────────────────────────────────────────

def _generate_daily_sessions(total: int, days: int = 30) -> list[DailySessionCount]:
    """Daily session counts for the ``days`` days before today, summing to ``total``.

    A fixed-seed shape (weekend dip, slight upward trend) scaled so the series
    agrees with the pack's ``total_sessions`` (largest-remainder rounding).
    """
    rng = random.Random(20240601)  # fixed seed: stable demo charts across reloads
    dates: list[date] = []
    weights: list[int] = []
    for i in range(days, 0, -1):
        d = _TODAY - timedelta(days=i)
        noise = rng.randint(-8, 12)
        weekend_mod = -15 if d.weekday() >= 5 else 0
        trend = int(i * -0.3)  # slight upward trend
        dates.append(d)
        weights.append(max(5, 35 + noise + weekend_mod - trend))
    scale = total / sum(weights)
    raw = [w * scale for w in weights]
    counts = [int(r) for r in raw]
    by_remainder = sorted(range(days), key=lambda k: raw[k] - counts[k], reverse=True)
    for k in by_remainder[: total - sum(counts)]:
        counts[k] += 1
    return [DailySessionCount(date=d.isoformat(), count=c) for d, c in zip(dates, counts)]


def generate_analytics_overview() -> dict:
    analytics = _demo().get("analytics") or {}
    total = analytics.get("total_sessions", 0)
    crisis_shown = analytics.get("crisis_resources_shown", 0)
    return {
        "total_sessions": total,
        "total_residents": len(get_demo_residents()),
        "total_services": len(SERVICES),
        "avg_matches_per_session": analytics.get("avg_matches_per_session", 0),
        "completion_rate": analytics.get("completion_rate", 0),
        "crisis_resources_shown": crisis_shown,
        "crisis_detections": crisis_shown,  # legacy name for the same count
        "crisis_weekly": analytics.get("crisis_weekly", []),
        "monthly_trend": analytics.get("monthly_trend", []),
        "highlights": analytics.get("highlights", []),
        "unmet_needs": analytics.get("unmet_needs", []),
        "top_categories": analytics.get("top_categories", []),
        "daily_sessions": (
            [s.model_dump() for s in _generate_daily_sessions(total)] if analytics else []
        ),
        # Geographic filter chips on the analytics page (id, label, zips).
        "council_districts": _items("council_districts"),
    }


_DEMOGRAPHIC_KEYS = (
    "age_ranges",
    "household_sizes",
    "zip_codes",
    "employment_statuses",
    "housing_situations",
    "insurance_statuses",
)
_EQUITY_KEYS = (
    "race_ethnicity",
    "income_levels",
    "geographic",
    "language_access",
    "disparity_alerts",
)


def generate_demographics_data() -> dict:
    demo = _demo().get("demographics") or {}
    return {k: demo.get(k, []) for k in _DEMOGRAPHIC_KEYS}


def generate_service_demand() -> list[dict]:
    return _items("service_demand")


def generate_language_usage() -> list[dict]:
    return _items("languages")


def generate_equity_data() -> dict:
    # disparity_alerts surface zips where match-rate has dropped meaningfully
    # below the baseline; each carries the trailing 8-week sparkline the
    # frontend renders.
    equity = _demo().get("equity") or {}
    return {k: equity.get(k, []) for k in _EQUITY_KEYS}


def generate_audit_log() -> list[AuditLogEntry]:
    entries = []
    for e in _items("audit_log"):
        e = dict(e)
        time = e.pop("time")
        entries.append(AuditLogEntry(**_with_date(e, "days_ago", "timestamp", time)))
    return entries


def generate_demand_map() -> list[dict]:
    # heat_intensity / heat_vulnerable_sessions are the pack's simplified
    # heat-vulnerability picture per ZIP.
    return _items("demand_map")


def generate_partner_gaps() -> dict:
    """Surface 'referred but not connected' rates by partner.

    Each partner shows: total referrals, connections (resident reached or
    services started), the gap (referrals minus connections), and a small
    set of the resident-side reasons coordinators logged.
    """
    partners = _items("partner_gaps")
    total_referrals = sum(p["referrals"] for p in partners)
    total_connections = sum(p["connections"] for p in partners)
    return {
        "totals": {
            "referrals": total_referrals,
            "connections": total_connections,
            "gap": total_referrals - total_connections,
            "connection_rate": (
                round(total_connections / total_referrals, 3) if total_referrals else 0.0
            ),
        },
        "partners": partners,
    }


def _last_scheduled_run(cadence: str) -> date | None:
    """The latest scheduled run strictly before today (never in the future)."""
    yesterday = _TODAY - timedelta(days=1)
    if cadence == "weekly":  # Mondays
        return yesterday - timedelta(days=yesterday.weekday())
    if cadence == "monthly":  # 1st of the month
        return yesterday.replace(day=1)
    if cadence == "quarterly":  # first day of the quarter
        return yesterday.replace(month=(yesterday.month - 1) // 3 * 3 + 1, day=1)
    return None  # on_demand: built when downloaded


def generate_reports() -> list[dict]:
    """Report catalog; ``last_run`` is a local wall time (no zone) or ""."""
    reports = []
    for r in _items("reports"):
        r = dict(r)
        run = _last_scheduled_run(r.get("cadence", "on_demand"))
        time = r.pop("run_time", "07:00")
        r["last_run"] = f"{run.isoformat()}T{time}:00" if run else ""
        reports.append(r)
    return reports
