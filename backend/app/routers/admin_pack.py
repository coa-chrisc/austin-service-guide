"""Admin routes for the real eligibility rules and the data pack (issue #20).

Included by ``admin.py`` under ``/api/v1/admin``.

  GET  /eligibility               the three rule layers the engine evaluates
  POST /eligibility/evaluate      every service's verdict for a synthetic profile
  POST /eligibility/impact        which personas gain or lose services under an edit
  PUT  /matching-rules            replace the local matching rules (in memory)
  GET  /pack/schemas              the data-pack contract (JSON Schemas)
  GET  /pack/export               the in-memory pack as a zip of YAML files
  POST /pack/export               the same, with staged (unapplied) edits

Reads are open like the other admin reads; they take synthetic input and
store or log nothing. Writes need ``X-Admin-Token``. ``PUT`` is refused in
``ADMIN_EDIT_MODE=export_only``; export is allowed in both modes.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import datetime, timezone
from typing import Any

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import EligibilityGate, ResidentProfile, SchoolAgeChild, Service, ServiceMatch
from app.routers.admin_auth import edit_mode, require_admin_token, require_in_memory_edits
from app.services import catalog, catalog_loader, catalog_write
from app.services.catalog_loader import MatchingRules
from app.services.data_pack import data_dir
from app.services.eligibility import describe_gates
from app.services.matching import (
    assess_risks,
    calculate_benefits,
    describe_engine,
    explain_matches,
)
from app.services.pack_validator import SERVICES, contract, schema_dir
from app.services.personas import _load_personas

router = APIRouter()

# Words in an eligibility summary that suggest a restriction. An ungated
# service whose summary has one is listed for review, never gated
# automatically ("open to all; priority for veterans" must stay ungated).
_RESTRICTIVE = re.compile(
    r"\b(must be|only|veterans?|ages?|seniors?|families with)\b", re.IGNORECASE
)
_MATCHED = ("crisis_direct", "matched", "check_eligibility")


# ── Request bodies ───────────────────────────────────────────────────

class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChildIn(SchoolAgeChild):
    model_config = ConfigDict(extra="forbid")


class ProfileIn(ResidentProfile):
    """A synthetic test profile. Unknown keys are refused."""

    model_config = ConfigDict(extra="forbid")

    immediate_needs: list[str] = Field(default_factory=list, max_length=30)
    languages_spoken: list[str] = Field(default_factory=lambda: ["en"], max_length=20)
    crisis_indicators: list[str] = Field(default_factory=list, max_length=10)
    school_age_children: list[ChildIn] = Field(default_factory=list, max_length=10)


_MAX_RULE_ENTRIES = 2000


class GateOverride(_Strict):
    eligibility_requires: list[EligibilityGate] = Field(max_length=9)


class Overrides(_Strict):
    """Unapplied edits: gate lists by service slug, and/or replacement rules."""

    services: dict[str, GateOverride] = Field(default_factory=dict, max_length=2000)
    matching_rules: MatchingRules | None = None

    @model_validator(mode="after")
    def _bounded_rules(self) -> "Overrides":
        # These routes need no token, so cap the work one request can cause.
        r = self.matching_rules
        if r is not None:
            entries = (
                len(r.high_heat_zips)
                + sum(len(v) for v in r.crisis_services.values())
                + sum(len(v) for v in r.prevention_services.values())
                + len(r.benefit_estimates)
                + sum(len(e.services) for e in r.benefit_estimates)
                + len(r.crisis_services)
                + len(r.prevention_services)
            )
            if entries > _MAX_RULE_ENTRIES:
                raise ValueError(f"matching_rules has more than {_MAX_RULE_ENTRIES} entries")
        return self


class EvaluateRequest(_Strict):
    profile: ProfileIn
    overrides: Overrides | None = None


class ImpactRequest(_Strict):
    overrides: Overrides


# ── Helpers ──────────────────────────────────────────────────────────

def _verified(svc: Service) -> bool:
    return bool(svc.last_verified_date and svc.verified_by)


def _apply(overrides: Overrides | None) -> tuple[list[Service], MatchingRules]:
    """Every catalog service and the rules, with the overrides applied (copies only)."""
    services = catalog.all_services()
    rules = catalog_loader.load_matching_rules()
    if overrides is None:
        return services, rules
    known = {s.slug for s in services}
    unknown = sorted(set(overrides.services) - known)
    if unknown:
        raise HTTPException(status_code=422, detail=[{
            "type": "unknown_service_slug", "loc": ["body", "overrides", "services", unknown[0]],
            "msg": f"no service with slug {unknown[0]!r}",
        }])
    services = [
        s.model_copy(update={"eligibility_requires": list(overrides.services[s.slug].eligibility_requires)})
        if s.slug in overrides.services else s
        for s in services
    ]
    return services, overrides.matching_rules or rules


def _active(services: list[Service]) -> list[Service]:
    return [s for s in services if s.status != "inactive"]


def _unresolved(rules: MatchingRules, slugs: set[str]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for indicator, listed in rules.crisis_services.items():
        out += [{"path": f"crisis_services/{indicator}", "slug": s} for s in listed if s not in slugs]
    for risk, entries in rules.prevention_services.items():
        out += [{"path": f"prevention_services/{risk}", "slug": e.service}
                for e in entries if e.service is not None and e.service not in slugs]
    for i, est in enumerate(rules.benefit_estimates):
        out += [{"path": f"benefit_estimates/{i}", "slug": s} for s in est.services if s not in slugs]
    return out


def _personas() -> list[dict[str, Any]]:
    return [
        {"id": p.id, "label": p.label, "language": p.language,
         "profile": p.seed_profile.model_dump(mode="json")}
        for p in _load_personas().values()
    ]


# ── Eligibility ──────────────────────────────────────────────────────

@router.get("/eligibility")
async def eligibility(x_staff_role: str | None = Header(None)):
    """Layer 1 (per-service gates), layer 2 (matching_rules.yaml) and layer 3
    (engine constants), all read from the loaded pack and the engine code."""
    services = catalog.all_services()
    rules = catalog_loader.load_matching_rules()
    gates = describe_gates()
    for gate in gates:
        gate["services"] = [s.slug for s in services if gate["id"] in s.eligibility_requires]
    return {
        "edit_mode": edit_mode(),
        "gates": gates,
        "services": [
            {
                "id": s.id,
                "slug": s.slug,
                "name": s.name,
                "status": s.status.value,
                "categories": list(s.categories),
                "eligibility_summary": s.eligibility_summary,
                "eligibility_requires": list(s.eligibility_requires),
                "verified": _verified(s),
                "restrictive_words": sorted(
                    {m.lower() for m in _RESTRICTIVE.findall(s.eligibility_summary)}
                ) if not s.eligibility_requires else [],
            }
            for s in services
        ],
        "categories": [{"slug": c.slug, "name": c.name} for c in catalog.get_categories()],
        "matching_rules": catalog_write.rules_record(rules),
        "rules_edited": rules != catalog_loader.load_pack_matching_rules(),
        "unresolved_slugs": _unresolved(rules, {s.slug for s in services}),
        "engine": describe_engine(),
        "personas": _personas(),
    }


@router.post("/eligibility/evaluate")
def evaluate(body: EvaluateRequest, x_staff_role: str | None = Header(None)):
    """The engine's verdict on every service for a synthetic profile, from the
    same code path as resident matching. ``overrides`` preview unapplied
    edits; nothing is written, stored or logged."""
    services, rules = _apply(body.overrides)
    profile = ResidentProfile.model_validate(body.profile.model_dump())
    rows = explain_matches(profile, services=_active(services), rules=rules)
    matches_for_benefits = _matches_from(rows, services)
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["outcome"]] = counts.get(row["outcome"], 0) + 1
    return {
        "outcomes": rows,
        "counts": counts,
        "risk_flags": [r.model_dump(mode="json") for r in assess_risks(profile, rules)],
        "benefits": calculate_benefits(profile, matches_for_benefits, rules),
    }


def _matches_from(rows: list[dict], services: list[Service]) -> list[ServiceMatch]:
    """The matched rows as ServiceMatch objects, for the benefit estimate."""
    by_slug = {s.slug: s for s in services}
    return [
        ServiceMatch(service=by_slug[r["slug"]], match_confidence=r["confidence"] or "low",
                     match_reasoning=r["reasoning"], match_score=r["score"] or 0.0)
        for r in rows if r["outcome"] in _MATCHED
    ]


@router.post("/eligibility/impact")
def impact(body: ImpactRequest, x_staff_role: str | None = Header(None)):
    """For each pack persona: services gained, lost, or moved between
    "matched" and "check eligibility" if the overrides were applied."""
    before_services, before_rules = _apply(None)
    after_services, after_rules = _apply(body.overrides)
    out = []
    for persona in _personas():
        profile = ResidentProfile.model_validate(persona["profile"])
        before = {r["slug"]: r for r in explain_matches(
            profile, services=_active(before_services), rules=before_rules) if r["outcome"] in _MATCHED}
        after = {r["slug"]: r for r in explain_matches(
            profile, services=_active(after_services), rules=after_rules) if r["outcome"] in _MATCHED}
        out.append({
            "persona_id": persona["id"],
            "label": persona["label"],
            "gained": [{"slug": s, "name": after[s]["name"], "outcome": after[s]["outcome"]}
                       for s in after if s not in before],
            "lost": [{"slug": s, "name": before[s]["name"], "outcome": before[s]["outcome"]}
                     for s in before if s not in after],
            "changed": [{"slug": s, "name": after[s]["name"], "before": before[s]["outcome"],
                         "after": after[s]["outcome"]}
                        for s in after if s in before and before[s]["outcome"] != after[s]["outcome"]],
        })
    return {"personas": out}


@router.put("/matching-rules", dependencies=[Depends(require_admin_token), Depends(require_in_memory_edits)])
async def put_matching_rules(body: MatchingRules, x_staff_role: str | None = Header(None)):
    """Replace the local matching rules in this process's memory. Validated
    against the contract (schema plus slug existence); lost on restart."""
    try:
        rules = catalog_write.set_rules(body)
    except catalog_write.WriteRejected as exc:
        raise HTTPException(status_code=exc.status, detail=exc.errors) from exc
    return {"matching_rules": catalog_write.rules_record(rules)}


# ── Pack contract and export ─────────────────────────────────────────

@router.get("/pack/schemas")
async def pack_schemas():
    """The data-pack contract: the schema index and every schema it names."""
    index = contract()
    files = [{k: v for k, v in e.items() if k != "validator"} for e in index["files"]]
    schemas = {
        e["schema"]: json.loads((schema_dir() / e["schema"]).read_text(encoding="utf-8"))
        for e in files
    }
    return {"contract_version": index.get("contract_version"), "files": files, "schemas": schemas}


def _yaml(data: Any) -> bytes:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100).encode("utf-8")


def _export_zip(overrides: Overrides | None, changed_only: bool) -> Response:
    services, rules = _apply(overrides)
    current = catalog_write.pack_files()
    candidate = catalog_write.pack_files(services, rules)
    try:
        catalog_write.check_new_errors(current, candidate, "")
    except catalog_write.WriteRejected as exc:
        raise HTTPException(status_code=exc.status, detail=exc.errors) from exc

    root = data_dir()
    on_disk = {s.id: s for s in catalog_loader.load_services()}
    disk_records = {sid: catalog_write.export_record(s) for sid, s in on_disk.items()}
    files: dict[str, bytes] = {}
    changed: list[str] = []
    removed: list[str] = []

    for svc in services:
        name = catalog_write.service_file(svc)
        record = catalog_write.export_record(svc)
        original = on_disk.get(svc.id)
        if original is not None and disk_records[svc.id] == record and (root / name).is_file():
            if not changed_only:
                files[name] = (root / name).read_bytes()  # unchanged: keep comments and layout
            continue
        files[name] = _yaml(record)
        changed.append(name)
        if original is not None and original.slug != svc.slug:
            removed.append(catalog_write.service_file(original))

    rules_changed = catalog_write.rules_record(rules) != catalog_write.rules_record(
        catalog_loader.load_pack_matching_rules())
    rules_file = root / "matching_rules.yaml"
    if rules_changed:
        files["matching_rules.yaml"] = _yaml(catalog_write.rules_record(rules))
        changed.append("matching_rules.yaml")
    elif not changed_only and rules_file.is_file():
        files["matching_rules.yaml"] = rules_file.read_bytes()

    if not changed_only:
        for entry in contract()["files"]:
            path = entry["path"]
            if path.startswith(SERVICES) or path == "matching_rules.yaml":
                continue
            if (root / path).is_file():
                files[path] = (root / path).read_bytes()

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    notes = [
        f"Exported {stamp} from the admin console (in-memory pack).",
        "Changed files:" if changed else "No files differ from the pack on disk.",
        *(f"  {n}" for n in changed),
    ]
    if removed:
        notes += ["Renamed services: delete these old files from your pack:", *(f"  {n}" for n in removed)]
    notes.append("Check the result with: npm run validate:pack -- --data-dir <unzipped folder>")
    files["CHANGES.txt"] = ("\n".join(notes) + "\n").encode("utf-8")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(files):
            zf.writestr(f"pack/{name}", files[name])
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="data-pack-export.zip"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


@router.get("/pack/export", dependencies=[Depends(require_admin_token)])
async def export_pack(changed_only: bool = Query(False)):
    """The in-memory pack as a zip of YAML (``changed_only``: only files that
    differ from the pack on disk)."""
    return _export_zip(None, changed_only)


class ExportRequest(_Strict):
    overrides: Overrides | None = None
    changed_only: bool = True


@router.post("/pack/export", dependencies=[Depends(require_admin_token)])
async def export_staged(body: ExportRequest):
    """Export with staged edits applied to the copy only (export-only mode)."""
    return _export_zip(body.overrides, body.changed_only)
