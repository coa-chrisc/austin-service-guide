"""Service catalog routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.catalog import (
    get_all_services,
    get_categories,
    get_crisis_resources,
    get_life_events,
    get_map_pins,
    get_service_by_id,
    get_service_by_slug,
)

router = APIRouter(prefix="/api/v1", tags=["services"])


@router.get("/services")
async def list_services(
    category: Optional[str] = Query(None, description="Filter by category slug"),
    search: Optional[str] = Query(None, description="Search query"),
    zip_code: Optional[str] = Query(None, description="Center zip code for radius filter"),
    radius: float = Query(10.0, description="Radius in miles from zip_code center"),
    status: Optional[str] = Query(None, description="Filter by service status"),
    open_now: bool = Query(False, description="Only services with at least one location open right now"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Return a paginated, filterable list of services."""
    result = get_all_services(
        category=category,
        search=search,
        zip_code=zip_code,
        radius=radius,
        status=status,
        open_now=open_now,
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


@router.get("/services/{slug}")
async def get_service(slug: str):
    """Return full details for a single service by slug or id."""
    svc = get_service_by_slug(slug) or get_service_by_id(slug)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return svc.model_dump()


@router.get("/categories")
async def list_categories():
    """Return all service categories with counts."""
    cats = get_categories()
    return [c.model_dump() for c in cats]


@router.get("/life-events")
async def list_life_events():
    """Return all life event cards."""
    events = get_life_events()
    return [e.model_dump() for e in events]


@router.get("/map/services")
async def map_pins(
    categories: Optional[str] = Query(None, description="Comma-separated category slugs"),
    south: Optional[float] = Query(None),
    north: Optional[float] = Query(None),
    west: Optional[float] = Query(None),
    east: Optional[float] = Query(None),
):
    """Return lightweight map pin data for service locations."""
    cat_list = [c.strip() for c in categories.split(",")] if categories else None
    bounds = None
    if all(v is not None for v in [south, north, west, east]):
        bounds = {"south": south, "north": north, "west": west, "east": east}

    pins = get_map_pins(categories=cat_list, bounds=bounds)
    return [p.model_dump() for p in pins]


@router.get("/crisis-resources")
async def list_crisis_resources(
    language: Optional[str] = Query(None, description="Filter by language code"),
):
    """Return emergency/crisis contact resources."""
    resources = get_crisis_resources(language=language)
    return [r.model_dump() for r in resources]
