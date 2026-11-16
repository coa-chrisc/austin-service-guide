"""Admin console routes.

Read routes (GET) are open: they serve synthetic demo data (fake residents,
generated analytics) plus the public service catalog, and expose no real
resident information. The X-Staff-Role header is read but not enforced.

Write routes (POST/PATCH/DELETE on /services, and the matching-rules and
eligibility routes in ``admin_pack``) change the live catalog that
residents are matched against, so they require an ``X-Admin-Token`` header
equal to the ``ADMIN_API_TOKEN`` setting. With no token configured, writes
are refused. This is a shared-secret stopgap for the demo, not staff
authentication; production needs real identity (Entra ID) and RBAC.

Writes are validated against the data-pack contract (``catalog_write``) and
held in this process's memory only: they are lost on restart and, on a
multi-instance host, seen only by the instance that took them.
"""

from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.routers import admin_pack
from app.routers.admin_auth import require_admin_token, require_in_memory_edits
from app.services import catalog_write
from app.services.catalog import get_all_services, get_service_by_id, service_record
from app.services.seed_data import (
    generate_analytics_overview,
    generate_audit_log,
    generate_demand_map,
    generate_demographics_data,
    generate_equity_data,
    generate_language_usage,
    generate_partner_gaps,
    generate_reports,
    generate_service_demand,
    get_demo_residents,
    get_demo_staff,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ── Helper ────────────────────────────────────────────────────────────

def _check_staff_role(x_staff_role: str | None) -> str:
    """Return the role (or default 'viewer').  In a real app this would
    validate a JWT and enforce RBAC."""
    return x_staff_role or "viewer"


_WRITE_GUARDS = [Depends(require_admin_token), Depends(require_in_memory_edits)]


def _rejected(exc: catalog_write.WriteRejected) -> HTTPException:
    """409 (id/slug conflict) or 422, detail shaped like FastAPI's: [{type, loc, msg}]."""
    return HTTPException(status_code=exc.status, detail=exc.errors)


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
    residents = list(get_demo_residents())

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
    resident = next((r for r in get_demo_residents() if r.id == resident_id), None)
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


@router.get("/services/{service_id}")
async def admin_get_service(service_id: str, x_staff_role: Optional[str] = Header(None)):
    """One service with every field, including ``sources`` (any status)."""
    _check_staff_role(x_staff_role)
    svc = get_service_by_id(service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return service_record(svc)


@router.post("/services", status_code=201, dependencies=_WRITE_GUARDS)
async def admin_create_service(
    body: catalog_write.ServiceCreate,  # type: ignore[valid-type]
    x_staff_role: Optional[str] = Header(None),
):
    """Create a service. 409 when the id or slug is taken; 422 when the record
    breaks the data-pack contract (unknown category, zero coordinates ...)."""
    _check_staff_role(x_staff_role)
    try:
        created = catalog_write.create(body)
    except catalog_write.WriteRejected as exc:
        raise _rejected(exc) from exc
    return service_record(created)


@router.patch("/services/{service_id}", dependencies=_WRITE_GUARDS)
async def admin_update_service(
    service_id: str,
    body: catalog_write.ServiceUpdate,  # type: ignore[valid-type]
    x_staff_role: Optional[str] = Header(None),
):
    """Partial update. The id cannot change; unknown keys are a 422."""
    _check_staff_role(x_staff_role)
    try:
        updated = catalog_write.update(service_id, body)
    except catalog_write.WriteRejected as exc:
        raise _rejected(exc) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Service not found")
    return service_record(updated)


@router.delete("/services/{service_id}", dependencies=_WRITE_GUARDS)
async def admin_delete_service(
    service_id: str,
    x_staff_role: Optional[str] = Header(None),
):
    """Soft-delete a service (set status to inactive)."""
    _check_staff_role(x_staff_role)
    try:
        ok = catalog_write.deactivate(service_id)
    except catalog_write.WriteRejected as exc:
        raise _rejected(exc) from exc
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
    return [s.model_dump() for s in get_demo_staff()]


# Eligibility, matching rules, pack schemas and export (admin_pack.py).
router.include_router(admin_pack.router)
