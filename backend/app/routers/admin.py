"""Admin console routes.

All routes work without real authentication for the demo.  A header-check
pattern (X-Staff-Role) is included so the frontend can set it, but it is
not enforced.
"""

from __future__ import annotations

import math
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Query, Request

from app.models import Service
from app.services.catalog import (
    create_service,
    delete_service,
    get_all_services,
    get_service_by_id,
    update_service,
)
from app.services.seed_data import (
    DEMO_RESIDENTS,
    DEMO_STAFF,
    generate_analytics_overview,
    generate_audit_log,
    generate_demand_map,
    generate_demographics_data,
    generate_eligibility_rules,
    generate_equity_data,
    generate_language_usage,
    generate_partner_gaps,
    generate_reports,
    generate_service_demand,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ── Helper ────────────────────────────────────────────────────────────

def _check_staff_role(x_staff_role: str | None) -> str:
    """Return the role (or default 'viewer').  In a real app this would
    validate a JWT and enforce RBAC."""
    return x_staff_role or "viewer"


# ── Residents ─────────────────────────────────────────────────────────

@router.get("/residents")
async def list_residents(
    search: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    zip_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    x_staff_role: Optional[str] = Header(None),
):
    """Return paginated list of demo residents."""
    _check_staff_role(x_staff_role)
    residents = list(DEMO_RESIDENTS)

    if search:
        q = search.lower()
        residents = [
            r for r in residents
            if q in r.name.lower() or q in r.email.lower()
        ]
    if language:
        residents = [r for r in residents if r.language == language]
    if zip_code:
        residents = [r for r in residents if r.zip_code == zip_code]

    total = len(residents)
    total_pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "items": [r.model_dump() for r in residents[start:end]],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/residents/{resident_id}")
async def get_resident(
    resident_id: str,
    x_staff_role: Optional[str] = Header(None),
):
    """Return detail for a single demo resident including their matches."""
    _check_staff_role(x_staff_role)
    resident = next((r for r in DEMO_RESIDENTS if r.id == resident_id), None)
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    # Generate matches for this resident
    from app.services.matching import assess_risks, calculate_benefits, match_services

    matches = match_services(resident.profile)
    risks = assess_risks(resident.profile)
    benefits = calculate_benefits(resident.profile, matches)

    return {
        "resident": resident.model_dump(),
        "matches": [m.model_dump() for m in matches],
        "risk_flags": [r.model_dump() for r in risks],
        "benefits_estimate": benefits,
    }


# ── Services CRUD ─────────────────────────────────────────────────────

@router.get("/services")
async def admin_list_services(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    x_staff_role: Optional[str] = Header(None),
):
    """Admin service list (includes inactive)."""
    _check_staff_role(x_staff_role)
    result = get_all_services(
        category=category,
        search=search,
        status=status or None,  # Include all statuses if not filtered
        page=page,
        page_size=page_size,
    )
    return {
        "items": [s.model_dump() for s in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
    }


@router.post("/services", status_code=201)
async def admin_create_service(
    body: dict[str, Any],
    x_staff_role: Optional[str] = Header(None),
):
    """Create a new service."""
    _check_staff_role(x_staff_role)
    body.setdefault("id", str(uuid4()))
    svc = Service(**body)
    created = create_service(svc)
    return created.model_dump()


@router.patch("/services/{service_id}")
async def admin_update_service(
    service_id: str,
    body: dict[str, Any],
    x_staff_role: Optional[str] = Header(None),
):
    """Partial update a service."""
    _check_staff_role(x_staff_role)
    updated = update_service(service_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Service not found")
    return updated.model_dump()


@router.delete("/services/{service_id}")
async def admin_delete_service(
    service_id: str,
    x_staff_role: Optional[str] = Header(None),
):
    """Soft-delete a service (set status to inactive)."""
    _check_staff_role(x_staff_role)
    ok = delete_service(service_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"status": "deleted", "service_id": service_id}


# ── Analytics ─────────────────────────────────────────────────────────

@router.get("/analytics/overview")
async def analytics_overview(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_analytics_overview()


@router.get("/analytics/demographics")
async def analytics_demographics(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_demographics_data()


@router.get("/analytics/services")
async def analytics_services(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_service_demand()


@router.get("/analytics/languages")
async def analytics_languages(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_language_usage()


@router.get("/analytics/equity")
async def analytics_equity(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_equity_data()


@router.get("/analytics/demand-map")
async def analytics_demand_map(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_demand_map()


# ── Eligibility Rules ─────────────────────────────────────────────────

@router.get("/eligibility-rules")
async def eligibility_rules(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_eligibility_rules()


# ── Reports ───────────────────────────────────────────────────────────

@router.get("/reports")
async def reports(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_reports()


@router.get("/partner-gaps")
async def partner_gaps(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return generate_partner_gaps()


# ── Audit Log ─────────────────────────────────────────────────────────

@router.get("/audit-log")
async def audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    x_staff_role: Optional[str] = Header(None),
):
    _check_staff_role(x_staff_role)
    entries = generate_audit_log()
    total = len(entries)
    total_pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "items": [e.model_dump() for e in entries[start:end]],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ── Staff ─────────────────────────────────────────────────────────────

@router.get("/staff")
async def staff_list(x_staff_role: Optional[str] = Header(None)):
    _check_staff_role(x_staff_role)
    return [s.model_dump() for s in DEMO_STAFF]
