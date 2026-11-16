"""Validated admin writes to the in-memory catalog and matching rules.

Every write builds the pack as it would look after the change (all services
plus categories and matching rules, as ``pack_validator`` reads them) and
runs the data-pack contract over it. A write is refused when it adds an
error the pack did not have before: an unknown category, a zero
coordinate, a crisis-direct service made inactive, and so on. Errors the
pack already had elsewhere do not block an unrelated edit.

Writes stay in this process's memory and are lost on restart (there is no
database yet); ``GET /api/v1/admin/pack/export`` downloads them as YAML.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, create_model

from app.models import Service, ServiceLocation, ServiceSource, ServiceStatus
from app.services import catalog, catalog_loader
from app.services.catalog_loader import MatchingRules
from app.services.pack_validator import SERVICES, validate_pack


class WriteRejected(Exception):
    """A write the contract or the catalog refuses. ``status`` is 409 or 422."""

    def __init__(self, status: int, errors: list[dict[str, Any]]) -> None:
        super().__init__(errors[0]["msg"] if errors else "rejected")
        self.status = status
        self.errors = errors


# ── Request bodies ───────────────────────────────────────────────────

class LocationIn(ServiceLocation):
    """A location in an admin write. ``id`` is generated when missing and
    ``service_id`` always comes from the parent service."""

    model_config = ConfigDict(extra="forbid")


def _service_fields(*, optional: bool) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for name, info in Service.model_fields.items():
        if name == "id":
            continue
        annotation = list[LocationIn] if name == "locations" else info.annotation
        if optional:
            fields[name] = (annotation | None, None)
        elif name == "sources":
            fields[name] = (list[ServiceSource], Field(default_factory=list))
        elif info.is_required():
            fields[name] = (annotation, ...)
        elif info.default_factory is not None:
            fields[name] = (annotation, Field(default_factory=info.default_factory))
        else:
            fields[name] = (annotation, info.default)
    return fields


_FORBID = ConfigDict(extra="forbid")

# Every Service field. ``id`` is optional on create (default ``svc-<slug>``)
# and absent on update, so PATCH cannot change it (an ``id`` key is a 422).
ServiceCreate: type[BaseModel] = create_model(
    "ServiceCreate",
    __config__=_FORBID,
    id=(str | None, Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$", max_length=100)),
    **_service_fields(optional=False),
)
ServiceUpdate: type[BaseModel] = create_model(
    "ServiceUpdate", __config__=_FORBID, **_service_fields(optional=True)
)


# ── The in-memory pack, as the validator and the export see it ──────

def service_file(service: Service | dict) -> str:
    slug = service["slug"] if isinstance(service, dict) else service.slug
    return f"{SERVICES}{slug}.yaml"


def export_record(service: Service) -> dict[str, Any]:
    """A service as its pack YAML file holds it: unset optional fields omitted."""
    data = service.model_dump(mode="json", exclude_none=True)
    if service.sources:
        data["sources"] = [s.model_dump(mode="json", exclude_defaults=True) for s in service.sources]
    if not data.get("verified_by"):
        data.pop("verified_by", None)
    return data


def rules_record(rules: MatchingRules) -> dict[str, Any]:
    return rules.model_dump(mode="json", exclude_none=True)


def pack_files(
    services: list[Service] | None = None,
    rules: MatchingRules | None = None,
) -> dict[str, Any]:
    """The editable part of the pack from memory: categories, services, rules."""
    services = catalog.all_services() if services is None else services
    rules = catalog_loader.load_matching_rules() if rules is None else rules
    files: dict[str, Any] = {
        "categories.yaml": [
            c.model_dump(mode="json", exclude={"service_count"}) for c in catalog.get_categories()
        ],
        "matching_rules.yaml": rules_record(rules),
    }
    for svc in services:
        files[service_file(svc)] = export_record(svc)
    return files


def _issue_key(issue: dict[str, str]) -> tuple[str, str, str, str]:
    return issue["file"], issue["path"], issue["code"], issue["message"]


def _loc(issue: dict[str, str], own_file: str) -> list[str | int]:
    if issue["file"] != own_file:
        return ["body"]
    return ["body", *(int(p) if p.isdigit() else p for p in issue["path"].split("/") if p)]


def check_new_errors(before: dict[str, Any], after: dict[str, Any], own_file: str) -> None:
    """Raise 422 with every error ``after`` has that ``before`` did not."""
    known = {_issue_key(i) for i in validate_pack(before)["errors"]}
    new = [i for i in validate_pack(after)["errors"] if _issue_key(i) not in known]
    if new:
        raise WriteRejected(422, [
            {
                "type": i["code"],
                "loc": _loc(i, own_file),
                "msg": i["message"] if i["file"] == own_file else f"{i['file']}: {i['message']}",
            }
            for i in new
        ])


def _validate_service(candidate: Service, replacing: Service | None) -> None:
    current = catalog.all_services()
    before = pack_files(current)
    others = [s for s in current if replacing is None or s.id != replacing.id]
    # The candidate goes last so a duplicate (location id, slug) is reported
    # against it rather than against the existing record.
    after = pack_files([*others, candidate])
    check_new_errors(before, after, service_file(candidate))


# ── Writes ───────────────────────────────────────────────────────────

def _conflict(exc: catalog.CatalogConflict) -> WriteRejected:
    return WriteRejected(409, [{"type": "conflict", "loc": ["body"], "msg": str(exc)}])


def _with_location_ids(data: dict[str, Any], taken: set[str]) -> dict[str, Any]:
    """Fill each location's ``service_id`` from the parent and give a missing
    ``id`` the pack convention ``loc-<slug>-<n>``."""
    n = 0
    locations = []
    for loc in data.get("locations") or []:
        loc = {**loc, "service_id": data["id"]}
        if not loc.get("id"):
            n += 1
            while f"loc-{data['slug']}-{n}" in taken:
                n += 1
            loc["id"] = f"loc-{data['slug']}-{n}"
            taken.add(loc["id"])
        locations.append(loc)
    data["locations"] = locations
    return data


def _location_ids(exclude_service: str | None = None) -> set[str]:
    return {
        loc.id for s in catalog.all_services() if s.id != exclude_service for loc in s.locations
    }


def _build(data: dict[str, Any]) -> Service:
    try:
        return Service.model_validate(data)
    except ValidationError as exc:
        raise WriteRejected(422, [
            {"type": e["type"], "loc": ["body", *e["loc"]], "msg": e["msg"]} for e in exc.errors()
        ]) from exc


def create(body: BaseModel) -> Service:
    data = body.model_dump(exclude_unset=True)
    data["id"] = data.get("id") or f"svc-{data['slug']}"
    if catalog.get_service_by_id(data["id"]) is not None:
        raise WriteRejected(409, [{"type": "conflict", "loc": ["body", "id"],
                                   "msg": f"a service with id {data['id']!r} already exists"}])
    owner = catalog.get_service_by_slug(data["slug"])
    if owner is not None:
        raise WriteRejected(409, [{"type": "conflict", "loc": ["body", "slug"],
                                   "msg": f"slug {data['slug']!r} is already used by {owner.name!r} ({owner.id})"}])
    candidate = _build(_with_location_ids(data, _location_ids()))
    _validate_service(candidate, None)
    try:
        return catalog.create_service(candidate)
    except catalog.CatalogConflict as exc:
        raise _conflict(exc) from exc


def update(service_id: str, body: BaseModel) -> Service | None:
    current = catalog.get_service_by_id(service_id)
    if current is None:
        return None
    updates = body.model_dump(exclude_unset=True)
    slug = updates.get("slug") or current.slug
    owner = catalog.get_service_by_slug(slug)
    if owner is not None and owner.id != service_id:
        raise WriteRejected(409, [{"type": "conflict", "loc": ["body", "slug"],
                                   "msg": f"slug {slug!r} is already used by {owner.name!r} ({owner.id})"}])
    data = {**catalog.service_record(current), **updates, "id": service_id}
    candidate = _build(_with_location_ids(data, _location_ids(exclude_service=service_id)))
    _validate_service(candidate, current)
    try:
        return catalog.replace_service(candidate)
    except catalog.CatalogConflict as exc:
        raise _conflict(exc) from exc


def deactivate(service_id: str) -> bool:
    current = catalog.get_service_by_id(service_id)
    if current is None:
        return False
    _validate_service(current.model_copy(update={"status": ServiceStatus.inactive}), current)
    return catalog.delete_service(service_id)


def set_rules(rules: MatchingRules) -> MatchingRules:
    """Validate and apply replacement matching rules in memory."""
    before = pack_files()
    after = {**before, "matching_rules.yaml": rules_record(rules)}
    check_new_errors(before, after, "matching_rules.yaml")
    catalog_loader.set_matching_rules(rules)
    return rules
