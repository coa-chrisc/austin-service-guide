"""In-memory service catalog store.

Loaded from seed_data at application startup.  Provides search, filtering,
and CRUD operations for the service directory.
"""

from __future__ import annotations

import math
from typing import Any

from app.models import (
    CrisisResource,
    LifeEvent,
    MapPin,
    Service,
    ServiceCategory,
    ServiceLocation,
)
from app.services.hours import is_open_now, next_open_label, service_open_now


# ── Module-level stores (populated by ``load_seed_data``) ─────────────

_services: dict[str, Service] = {}        # keyed by id
_services_by_slug: dict[str, Service] = {}
_categories: dict[str, ServiceCategory] = {}
_life_events: list[LifeEvent] = []
_crisis_resources: list[CrisisResource] = []


# ── Bootstrap ─────────────────────────────────────────────────────────

def load_seed_data() -> None:
    """Import seed data and populate the in-memory stores."""
    from app.services.seed_data import (
        CATEGORIES,
        CRISIS_RESOURCES,
        LIFE_EVENTS,
        SERVICES,
    )

    _services.clear()
    _services_by_slug.clear()
    _categories.clear()
    _life_events.clear()
    _crisis_resources.clear()

    for cat in CATEGORIES:
        _categories[cat.id] = cat.model_copy()

    for svc in SERVICES:
        _services[svc.id] = svc
        _services_by_slug[svc.slug] = svc

    # Compute per-category counts
    for cat in _categories.values():
        cat.service_count = sum(
            1 for s in _services.values()
            if cat.slug in s.categories and s.status != "inactive"
        )

    _life_events.extend(LIFE_EVENTS)
    _crisis_resources.extend(CRISIS_RESOURCES)


# ── Haversine helper ──────────────────────────────────────────────────

def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in miles between two lat/lon points."""
    R = 3958.8  # Earth radius in miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Fuzzy text matching ───────────────────────────────────────────────

def _text_match(query: str, text: str) -> bool:
    """Case-insensitive substring / token match."""
    q = query.lower()
    t = text.lower()
    # Full substring match
    if q in t:
        return True
    # Token overlap
    q_tokens = set(q.split())
    t_tokens = set(t.split())
    if q_tokens & t_tokens:
        return True
    return False


# ── Query functions ───────────────────────────────────────────────────

def get_all_services(
    *,
    category: str | None = None,
    search: str | None = None,
    zip_code: str | None = None,
    radius: float = 10.0,
    status: str | None = None,
    open_now: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """Return paginated, filtered service list."""
    results = list(_services.values())

    if status:
        results = [s for s in results if s.status.value == status]
    else:
        # By default exclude inactive
        results = [s for s in results if s.status != "inactive"]

    if category:
        results = [s for s in results if category in s.categories]

    if search:
        results = [
            s for s in results
            if _text_match(search, s.name)
            or _text_match(search, s.description)
            or _text_match(search, s.provider_name)
            or _text_match(search, s.eligibility_summary)
            or any(_text_match(search, c) for c in s.categories)
        ]

    if zip_code:
        # Approximate center for Austin zip codes
        zip_centers: dict[str, tuple[float, float]] = {
            "78701": (30.2700, -97.7430), "78702": (30.2590, -97.7160),
            "78704": (30.2400, -97.7620), "78705": (30.2920, -97.7410),
            "78721": (30.2710, -97.6900), "78722": (30.2830, -97.7160),
            "78723": (30.3020, -97.6920), "78724": (30.2900, -97.6300),
            "78741": (30.2270, -97.7290), "78744": (30.1700, -97.7400),
            "78745": (30.2000, -97.8000), "78748": (30.1700, -97.8200),
            "78751": (30.3090, -97.7260), "78752": (30.3240, -97.7100),
            "78753": (30.3700, -97.6800), "78754": (30.3630, -97.6550),
            "78757": (30.3550, -97.7370), "78758": (30.3900, -97.7090),
        }
        center = zip_centers.get(zip_code)
        if center:
            def _within_radius(svc: Service) -> bool:
                for loc in svc.locations:
                    if loc.latitude and loc.longitude:
                        if _haversine_miles(center[0], center[1], loc.latitude, loc.longitude) <= radius:
                            return True
                return False
            results = [s for s in results if _within_radius(s)]

    if open_now:
        results = [s for s in results if service_open_now(s.locations)]

    total = len(results)
    total_pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "items": results[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def get_service_by_slug(slug: str) -> Service | None:
    return _services_by_slug.get(slug)


def get_service_by_id(service_id: str) -> Service | None:
    return _services.get(service_id)


def get_categories() -> list[ServiceCategory]:
    return list(_categories.values())


def search_services(
    query: str,
    category: str | None = None,
    zip_code: str | None = None,
    radius: float = 10.0,
) -> list[Service]:
    result = get_all_services(
        search=query, category=category, zip_code=zip_code,
        radius=radius, page=1, page_size=100,
    )
    return result["items"]


def get_map_pins(
    categories: list[str] | None = None,
    bounds: dict[str, float] | None = None,
) -> list[MapPin]:
    """Return lightweight map pin data for all service locations."""
    pins: list[MapPin] = []
    for svc in _services.values():
        if svc.status == "inactive":
            continue
        if categories and not any(c in svc.categories for c in categories):
            continue
        primary_cat = svc.categories[0] if svc.categories else "other"
        for loc in svc.locations:
            if not loc.latitude or not loc.longitude:
                continue
            if bounds:
                if (loc.latitude < bounds.get("south", -90)
                    or loc.latitude > bounds.get("north", 90)
                    or loc.longitude < bounds.get("west", -180)
                    or loc.longitude > bounds.get("east", 180)):
                    continue
            open_state = is_open_now(loc) if loc.hours else None
            pins.append(MapPin(
                id=loc.id,
                service_id=svc.id,
                name=svc.name,
                category=primary_cat,
                latitude=loc.latitude,
                longitude=loc.longitude,
                open_now=open_state,
                next_open=next_open_label(loc) if open_state is False else None,
            ))
    return pins


def get_life_events() -> list[LifeEvent]:
    return list(_life_events)


def get_crisis_resources(language: str | None = None) -> list[CrisisResource]:
    if language:
        return [r for r in _crisis_resources if language in r.languages]
    return list(_crisis_resources)


# ── Admin CRUD ────────────────────────────────────────────────────────

def create_service(service: Service) -> Service:
    _services[service.id] = service
    _services_by_slug[service.slug] = service
    # Update category counts
    for cat in _categories.values():
        cat.service_count = sum(
            1 for s in _services.values()
            if cat.slug in s.categories and s.status != "inactive"
        )
    return service


def update_service(service_id: str, updates: dict[str, Any]) -> Service | None:
    svc = _services.get(service_id)
    if not svc:
        return None
    data = svc.model_dump()
    data.update(updates)
    updated = Service(**data)
    # Replace in stores
    _services[service_id] = updated
    _services_by_slug[updated.slug] = updated
    for cat in _categories.values():
        cat.service_count = sum(
            1 for s in _services.values()
            if cat.slug in s.categories and s.status != "inactive"
        )
    return updated


def delete_service(service_id: str) -> bool:
    """Soft-delete: set status to inactive."""
    svc = _services.get(service_id)
    if not svc:
        return False
    svc.status = "inactive"
    for cat in _categories.values():
        cat.service_count = sum(
            1 for s in _services.values()
            if cat.slug in s.categories and s.status != "inactive"
        )
    return True
