"""Staff console endpoints for background jobs (the catalog research agent, #18).

Mounted by ``app/main.py`` only when ``JOB_BACKEND`` is not ``off``. Every
route except ``GET /api/v1/admin/jobs/config`` requires ``X-Admin-Token``.
The main app validates and size-limits each body, then forwards it to the
worker with a signed token; the browser never talks to the worker.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from app.jobs.proxy import WorkerClient, WorkerResponse, WorkerUnavailable
from app.jobs.schemas import ID_PATTERN, ApprovePlan, DraftEdit, DraftState, JobCreate, Reject, ResearchRequest
from app.jobs.settings import check_app_config, get_job_settings
from app.routers.admin_auth import require_admin_token

MAX_BODY = 128 * 1024
ROLES = {"super_admin", "admin", "manager", "viewer"}

router = APIRouter(prefix="/api/v1/admin", tags=["admin-jobs"])
JobId = Annotated[str, Path(pattern=ID_PATTERN)]
DraftId = Annotated[str, Path(pattern=ID_PATTERN)]


@lru_cache(maxsize=1)
def _inline():
    from app.jobs.inline import InlineWorker

    return InlineWorker(get_job_settings())


def get_worker() -> WorkerClient:
    """The worker client for this process (overridden in tests)."""
    settings = get_job_settings()
    backend = check_app_config(settings)
    if backend == "inline":
        worker = _inline()
        worker.ensure_running()
        return worker.client
    if backend == "remote":
        return WorkerClient(settings.job_worker_url, settings.job_worker_secret)
    raise HTTPException(status_code=404)


def _actor(x_staff_role: str | None) -> str:
    # Stub auth: the role header is informational until #14 P3 lands.
    return x_staff_role if x_staff_role in ROLES else "token"


async def _call(
    worker: WorkerClient,
    method: str,
    path: str,
    *,
    query: dict | None = None,
    body: BaseModel | None = None,
    actor: str = "token",
) -> WorkerResponse:
    raw = body.model_dump_json(exclude_none=False).encode() if body is not None else b""
    try:
        res = await worker.request(method, path, query=query, body=raw, actor=actor)
    except WorkerUnavailable:
        raise HTTPException(status_code=503, detail="The job worker is unreachable. Try again shortly.") from None
    if res.status == 401:
        # Our own token was refused: a secret mismatch, clock skew or a bug.
        raise HTTPException(status_code=502, detail="The job worker rejected the request (check JOB_WORKER_SECRET).")
    if res.status >= 500:
        raise HTTPException(status_code=502, detail=f"The job worker failed ({res.status}).")
    return res


def _json(res: WorkerResponse) -> Response:
    try:
        data = json.loads(res.content or b"null")
    except ValueError:
        raise HTTPException(status_code=502, detail="The job worker sent an unreadable response.") from None
    return JSONResponse(data, status_code=res.status)


async def _limited_body(request: Request) -> None:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY:
        raise HTTPException(status_code=413, detail="Request body too large.")
    if len(await request.body()) > MAX_BODY:
        raise HTTPException(status_code=413, detail="Request body too large.")


admin = [Depends(require_admin_token), Depends(_limited_body)]


@router.get("/jobs/config")
async def jobs_config(worker: WorkerClient = Depends(get_worker)) -> dict:
    """Open (no token): the console uses it to decide whether to show the
    research pages. Holds no secret: backend, provider, model and caps."""
    settings = get_job_settings()
    base = {"backend": settings.job_backend}
    res = await _call(worker, "GET", "/v1/config")
    if res.status != 200:
        raise HTTPException(status_code=502, detail="The job worker sent an unexpected response.")
    return {**base, **json.loads(res.content)}


@router.post("/research/jobs", status_code=202, dependencies=admin)
async def start_research(
    body: ResearchRequest,
    worker: WorkerClient = Depends(get_worker),
    x_staff_role: str | None = Header(None),
) -> Response:
    params = body.model_dump(exclude={"caps", "acknowledge_cost"})
    payload = JobCreate(kind="research", params=params, caps=body.caps)
    return _json(await _call(worker, "POST", "/v1/jobs", body=payload, actor=_actor(x_staff_role)))


@router.get("/jobs", dependencies=admin)
async def list_jobs(worker: WorkerClient = Depends(get_worker)) -> Response:
    return _json(await _call(worker, "GET", "/v1/jobs"))


@router.get("/jobs/{job_id}", dependencies=admin)
async def get_job(job_id: JobId, worker: WorkerClient = Depends(get_worker)) -> Response:
    return _json(await _call(worker, "GET", f"/v1/jobs/{job_id}"))


@router.get("/jobs/{job_id}/events", dependencies=admin)
async def job_events(
    job_id: JobId, after: int = Query(0, ge=0, le=2**62), worker: WorkerClient = Depends(get_worker)
) -> Response:
    return _json(await _call(worker, "GET", f"/v1/jobs/{job_id}/events", query={"after": after}))


@router.post("/jobs/{job_id}/approve-plan", dependencies=admin)
async def approve_plan(
    body: ApprovePlan,
    job_id: JobId,
    worker: WorkerClient = Depends(get_worker),
    x_staff_role: str | None = Header(None),
) -> Response:
    return _json(await _call(worker, "POST", f"/v1/jobs/{job_id}/approve-plan", body=body, actor=_actor(x_staff_role)))


@router.post("/jobs/{job_id}/cancel", dependencies=admin)
async def cancel_job(
    job_id: JobId, worker: WorkerClient = Depends(get_worker), x_staff_role: str | None = Header(None)
) -> Response:
    return _json(await _call(worker, "POST", f"/v1/jobs/{job_id}/cancel", actor=_actor(x_staff_role)))


@router.get("/jobs/{job_id}/export.zip", dependencies=admin)
async def export_job(job_id: JobId, worker: WorkerClient = Depends(get_worker)) -> Response:
    res = await _call(worker, "GET", f"/v1/jobs/{job_id}/export.zip")
    if res.status != 200:
        return _json(res)
    return Response(
        res.content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="research-{job_id[:8]}.zip"'},
    )


@router.get("/drafts", dependencies=admin)
async def list_drafts(
    job: str | None = Query(None, pattern=ID_PATTERN),
    state: DraftState | None = None,
    worker: WorkerClient = Depends(get_worker),
) -> Response:
    return _json(await _call(worker, "GET", "/v1/drafts", query={"job": job, "state": state}))


@router.get("/drafts/{draft_id}", dependencies=admin)
async def get_draft(draft_id: DraftId, worker: WorkerClient = Depends(get_worker)) -> Response:
    return _json(await _call(worker, "GET", f"/v1/drafts/{draft_id}"))


@router.patch("/drafts/{draft_id}", dependencies=admin)
async def edit_draft(
    body: DraftEdit,
    draft_id: DraftId,
    worker: WorkerClient = Depends(get_worker),
    x_staff_role: str | None = Header(None),
) -> Response:
    return _json(await _call(worker, "PATCH", f"/v1/drafts/{draft_id}", body=body, actor=_actor(x_staff_role)))


@router.post("/drafts/{draft_id}/{action}", dependencies=admin)
async def review_draft(
    request: Request,
    action: Literal["accept", "reject"],
    draft_id: DraftId,
    worker: WorkerClient = Depends(get_worker),
    x_staff_role: str | None = Header(None),
) -> Response:
    body: BaseModel | None = None
    if action == "reject":
        try:
            body = Reject.model_validate_json(await request.body() or b"{}")
        except ValueError:
            raise HTTPException(status_code=422, detail="A rejection needs a reason (1 to 500 characters).") from None
    return _json(await _call(worker, "POST", f"/v1/drafts/{draft_id}/{action}", body=body, actor=_actor(x_staff_role)))
