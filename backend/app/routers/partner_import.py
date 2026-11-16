"""Admin partner-list import (issue #19): upload an organisation list, get draft catalog YAML.

Off by default. Every route returns 404 unless ``IMPORT_ENABLED=true``,
``JOB_BACKEND`` is not ``off`` and ``ADMIN_API_TOKEN`` is set; the write
routes also need the ``X-Admin-Token`` header. With ``JOB_BACKEND=inline``
the import runs inside the request (there is no worker or database yet).

Stateless: the server keeps no upload, table or draft between requests. The
browser sends the file again with the confirmed mapping, and sends the
reviewed drafts back for validation and export. Logs carry counts and
refusal codes, never file names or cell values.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.routers.admin_auth import require_admin_token
from app.services.partner_import import export, limits as L, pipeline, upload
from app.services.partner_import.pack_context import get_context
from app.services.partner_import.tables import MissingDependency

log = logging.getLogger(__name__)


def import_available() -> bool:
    s = get_settings()
    return bool(s.import_enabled and s.job_backend != "off" and s.admin_api_token)


def require_import_enabled() -> None:
    if not import_available():
        raise HTTPException(status_code=404, detail="Not Found")


router = APIRouter(prefix="/api/v1/admin/import", tags=["admin-import"], dependencies=[Depends(require_import_enabled)])


def _refused(exc: L.ImportRefused) -> JSONResponse:
    log.info("partner import refused: %s", exc.code)
    return JSONResponse(status_code=422, content={"code": exc.code, "message": exc.message})


def _missing(exc: MissingDependency) -> JSONResponse:
    return JSONResponse(status_code=503, content={"code": "missing_dependency", "message": str(exc)})


def _int_field(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except ValueError:
        raise L.ImportRefused(L.BAD_REQUEST, "The header row must be a number.") from None


@router.get("/config")
async def import_config() -> dict[str, Any]:
    """What the upload screen states next to the file input. Reaching it means the feature is on."""
    s = get_settings()
    return {
        "enabled": True,
        "accepted": [".xlsx", ".csv", ".docx"],
        "max_file_mb": L.MAX_FILE_BYTES // (1024 * 1024),
        "max_rows": max(1, min(s.import_max_rows, L.MAX_ROWS)),
        "model_available": bool(s.import_use_model and s.use_live_ai),
        "job_backend": s.job_backend,
    }


@router.post("/inspect", dependencies=[Depends(require_admin_token)])
async def inspect_upload(request: Request) -> Any:
    """Phase 1: parse, guard and classify columns. No model call; nothing kept."""
    try:
        form = await upload.read_form(request)
        parsed = await run_in_threadpool(pipeline.parse_upload, form.file, form.file_name)
        result = pipeline.inspect(parsed, form.fields.get("table") or None, _int_field(form.fields.get("header_row")))
    except L.ImportRefused as exc:
        return _refused(exc)
    except MissingDependency as exc:
        return _missing(exc)
    log.info("partner import inspected: %s, %d table(s)", parsed.kind, len(parsed.tables))
    return result


@router.post("/drafts", dependencies=[Depends(require_admin_token)])
async def build_drafts(request: Request) -> Any:
    """Phase 2: the same file plus the confirmed mapping, to reviewable drafts."""
    try:
        form = await upload.read_form(request)
        try:
            params = json.loads(form.fields.get("params") or "{}")
        except ValueError:
            raise L.ImportRefused(L.BAD_REQUEST, "The import settings are not valid JSON.") from None
        if not isinstance(params, dict):
            raise L.ImportRefused(L.BAD_REQUEST, "The import settings must be a JSON object.")
        parsed = await run_in_threadpool(pipeline.parse_upload, form.file, form.file_name)
        result = await pipeline.build_drafts(parsed, params, get_settings())
    except L.ImportRefused as exc:
        return _refused(exc)
    except MissingDependency as exc:
        return _missing(exc)
    log.info("partner import drafts built: %d row(s) read, %d draft(s)", result["rows_read"], len(result["drafts"]))
    return result


def _items(body: dict[str, Any]) -> list[dict[str, Any]]:
    items = body.get("items")
    if not isinstance(items, list) or not items or not all(isinstance(i, dict) for i in items):
        raise L.ImportRefused(L.BAD_REQUEST, "Send the accepted drafts as a non-empty items list.")
    if len(items) > export.MAX_ITEMS:
        raise L.ImportRefused(L.BAD_REQUEST, f"Send at most {export.MAX_ITEMS} drafts at a time.")
    return items


@router.post("/validate", dependencies=[Depends(require_admin_token)])
async def validate_drafts(request: Request) -> Any:
    """Re-check edited drafts (and merges) against the pack contract; returns the YAML-ready records."""
    try:
        items = _items(await upload.read_json(request))
    except L.ImportRefused as exc:
        return _refused(exc)
    prepared, problems = await run_in_threadpool(export.check, items, get_context())
    return {
        "items": [{"index": p["index"], "slug": p["record"]["slug"], "record": p["record"],
                   "warnings": p.get("warnings", [])} for p in prepared],
        "problems": problems,
        "ok": not problems,
    }


@router.post("/export", dependencies=[Depends(require_admin_token)])
async def export_drafts(request: Request) -> Any:
    """Accepted drafts as a zip of ``services/<slug>.yaml`` plus ``review-issues.csv``. Nothing is written."""
    try:
        items = _items(await upload.read_json(request))
        prepared = await run_in_threadpool(export.prepare, items, get_context())
    except L.ImportRefused as exc:
        return _refused(exc)
    except export.ExportInvalid as exc:
        return JSONResponse(status_code=422, content={
            "code": "invalid_drafts",
            "message": "Some drafts do not pass the data-pack checks. Fix them or reject them, then export again.",
            "problems": exc.problems,
        })
    data = await run_in_threadpool(export.build_zip, prepared)
    log.info("partner import exported: %d draft(s)", len(prepared))
    name = f"partner-import-drafts-{date.today().isoformat()}.zip"
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
