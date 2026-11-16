"""Job worker HTTP API: ``uvicorn app.worker.main:app``.

Only ``GET /healthz`` is open. Every ``/v1`` route requires the signed
``CSG1`` token from the main app (``app/jobs/auth.py``); a bad token is a
bare 401. No docs or OpenAPI routes. The browser never calls this service:
the main app proxies under ``/api/v1/admin/``.

Refuses to start without ``DATABASE_URL`` or with a ``JOB_WORKER_SECRET``
shorter than 32 characters.
"""

from __future__ import annotations

import asyncio
import logging
import re
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Any

import yaml
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response

from app.jobs.auth import TokenError, request_path, verify
from app.jobs.schemas import ID_PATTERN as ID
from app.jobs.schemas import ApprovePlan, Caps, DraftEdit, DraftState, JobCreate, Reject
from app.jobs.settings import JobSettings, check_secret, get_job_settings
from app.jobs.store import Store, utcnow
from app.research.export import build_export, dump_yaml, strip_verification
from app.research.postprocess import validate_service
from app.services.dedupe import find_duplicates

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def pack_context():
    """The deployment's data pack (categories and published services), read once."""
    from app.research.pipeline import load_pack_context

    return load_pack_context()


# ── App ──────────────────────────────────────────────────────────────

def effective_caps(settings: JobSettings, requested: Caps) -> dict:
    """Per-job caps can only lower the environment's."""
    caps = settings.caps()
    for key, value in requested.model_dump().items():
        if value is not None:
            caps[key] = min(caps[key], value)
    return caps


def create_app(
    *,
    settings: JobSettings | None = None,
    store: Store | None = None,
    deps_factory: Any = None,
    start_runner: bool = True,
) -> FastAPI:
    state: dict[str, Any] = {"settings": settings, "store": store}

    def cfg() -> JobSettings:
        return state["settings"] or get_job_settings()

    def db() -> Store:
        if state["store"] is None:
            state["store"] = Store(cfg().database_url)
        return state["store"]

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        s = cfg()
        check_secret(s)
        s.search_provider  # noqa: B018 — raises on an unknown RESEARCH_SEARCH_PROVIDER
        if state["store"] is None and not s.database_url:
            raise RuntimeError("DATABASE_URL is not set: the job worker needs Postgres (or a sqlite:/// URL for local use)")
        task = None
        runner = None
        if start_runner:
            from app.worker.runner import Runner, default_deps_factory

            runner = Runner(db(), s, deps_factory or default_deps_factory)
            task = asyncio.create_task(runner.loop())
        yield
        if runner is not None:
            runner.stop()
        if task is not None:
            await asyncio.wait([task], timeout=10)

    app = FastAPI(title="Service Guide job worker", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.jobs = state

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    async def signed(request: Request) -> str:
        body = await request.body()
        s = cfg()
        try:
            claims = verify(
                request.headers.get("authorization"),
                secrets_=[s.job_worker_secret, s.job_worker_secret_previous],
                method=request.method,
                path=request_path(request.url.path, request.url.query),
                body=body,
                seen=db().token_seen,
            )
        except TokenError as exc:
            logger.info("worker: rejected request to %s (%s)", request.url.path, exc)
            raise HTTPException(status_code=401) from None
        request.state.actor = (claims.actor or "token")[:64]
        return request.state.actor

    v1 = APIRouter(prefix="/v1", dependencies=[Depends(signed)])
    register_routes(v1, cfg, db)
    app.include_router(v1)
    return app


def register_routes(v1: APIRouter, cfg, db) -> None:  # noqa: ANN001
    def job_or_404(job_id: str) -> dict:
        job = db().get_job(job_id) if re.match(ID, job_id) else None
        if job is None:
            raise HTTPException(status_code=404, detail="No such job.")
        return job

    def draft_or_404(draft_id: str) -> dict:
        draft = db().get_draft(draft_id) if re.match(ID, draft_id) else None
        if draft is None:
            raise HTTPException(status_code=404, detail="No such draft.")
        return draft

    @v1.get("/config")
    def config() -> dict:
        s = cfg()
        return {
            "research_enabled": bool(s.research_api_key),
            "import_enabled": False,
            "search_provider": s.search_provider,
            "model": s.openai_research_model,
            "require_plan_approval": s.research_require_plan_approval,
            "caps": s.caps(),
        }

    @v1.post("/jobs", status_code=202)
    def create_job(body: JobCreate, request: Request) -> dict:
        s = cfg()
        if body.kind == "noop":
            job = db().create_job("noop", {}, {}, _actor(request), state="needs_review")
            db().update_job(job["id"], started_at=utcnow(), finished_at=utcnow(), plan_approved=True)
            db().add_event(job["id"], "state", "No-op job finished")
            return {"id": job["id"]}
        if body.params is None:
            raise HTTPException(status_code=422, detail="params are required for a research job")
        if not s.research_api_key:
            raise HTTPException(status_code=503, detail="Research is not configured on the worker (no OpenAI key).")
        if any(j["kind"] == "research" and j["state"] in ("queued", "running", "awaiting_plan") for j in db().list_jobs(20)):
            raise HTTPException(status_code=409, detail="Another research job is still active; finish or cancel it first.")
        params = body.params.model_dump()
        job = db().create_job("research", params, effective_caps(s, body.caps), _actor(request))
        if not s.research_require_plan_approval:
            db().update_job(job["id"], plan_approved=True)
        return {"id": job["id"]}

    @v1.get("/jobs")
    def list_jobs() -> dict:
        return {"items": db().list_jobs(50)}

    @v1.get("/jobs/{job_id}")
    def get_job(job_id: str) -> dict:
        return job_or_404(job_id)

    @v1.get("/jobs/{job_id}/events")
    def events(job_id: str, after: int = Query(0, ge=0)) -> dict:
        job_or_404(job_id)
        items = db().list_events(job_id, after)
        return {"items": items, "next_after": items[-1]["id"] if items else after}

    @v1.post("/jobs/{job_id}/approve-plan")
    def approve_plan(job_id: str, body: ApprovePlan) -> dict:
        job = job_or_404(job_id)
        if job["state"] != "awaiting_plan" or not job.get("plan"):
            raise HTTPException(status_code=409, detail="This job is not waiting for plan approval.")
        plan = dict(job["plan"])
        if body.keep is not None:
            queries = plan.get("queries", [])
            plan["queries"] = [queries[i] for i in sorted(set(body.keep)) if 0 <= i < len(queries)]
            if not plan["queries"]:
                raise HTTPException(status_code=422, detail="Keep at least one query.")
        if not db().transition(job_id, ("awaiting_plan",), state="queued", plan=plan, plan_approved=True):
            raise HTTPException(status_code=409, detail="This job is not waiting for plan approval.")
        db().add_event(job_id, "state", f"Plan approved with {len(plan['queries'])} queries")
        return job_or_404(job_id)

    @v1.post("/jobs/{job_id}/cancel")
    def cancel(job_id: str) -> dict:
        job_or_404(job_id)
        if db().transition(job_id, ("queued", "awaiting_plan", "running"), state="cancelled",
                           finished_at=utcnow(), lease_owner=None, lease_expires_at=None):
            db().add_event(job_id, "state", "Cancelled")
        return job_or_404(job_id)

    @v1.get("/jobs/{job_id}/export.zip")
    def export(job_id: str) -> Response:
        job = job_or_404(job_id)
        accepted = db().list_drafts(job_id, "accepted")
        data = build_export(job, accepted, pack_context().categories_yaml)
        return Response(data, media_type="application/zip",
                        headers={"Content-Disposition": f'attachment; filename="research-{job_id[:8]}.zip"'})

    # ── Drafts ─────────────────────────────────────────────────────

    @v1.get("/drafts")
    def list_drafts(job: str | None = Query(None, pattern=ID),
                    state: DraftState | None = None) -> dict:
        return {"items": [summary(d) for d in db().list_drafts(job, state)]}

    @v1.get("/drafts/{draft_id}")
    def get_draft(draft_id: str) -> dict:
        return detail(draft_or_404(draft_id))

    @v1.patch("/drafts/{draft_id}")
    def edit_draft(draft_id: str, body: DraftEdit) -> dict:
        draft = draft_or_404(draft_id)
        if draft["state"] == "merged":
            raise HTTPException(status_code=409, detail="A merged draft cannot be edited.")
        try:
            data = yaml.safe_load(body.yaml)
        except yaml.YAMLError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid YAML: {str(exc)[:200]}") from None
        if not isinstance(data, dict):
            raise HTTPException(status_code=422, detail="The draft must be a YAML mapping (one service).")
        candidate = strip_verification(data)
        pack = pack_context()
        others = [d["candidate"] for d in db().list_drafts(draft["job_id"]) if d["id"] != draft_id]
        issues = validate_service(candidate, pack.categories_yaml)
        dups = find_duplicates(candidate, pack.services, source="pack") + find_duplicates(candidate, others, source="draft")
        db().update_draft(draft_id, candidate=candidate, issues=issues, duplicates=dups, state="pending",
                          reviewed_by=None, reviewed_at=None, reject_reason=None)
        return detail(draft_or_404(draft_id))

    @v1.post("/drafts/{draft_id}/accept")
    def accept(draft_id: str, request: Request) -> dict:
        draft = draft_or_404(draft_id)
        issues = validate_service(draft["candidate"], pack_context().categories_yaml)
        if issues["errors"]:
            db().update_draft(draft_id, issues=issues)
            raise HTTPException(status_code=409,
                                detail=f"This draft has {len(issues['errors'])} validator error(s); fix them before accepting.")
        slug = draft["candidate"].get("slug")
        clash = [d for d in db().list_drafts(draft["job_id"], "accepted") if d["id"] != draft_id and d["candidate"].get("slug") == slug]
        if clash:
            raise HTTPException(status_code=409, detail=f"Another accepted draft already uses slug {slug!r}.")
        db().update_draft(draft_id, state="accepted", issues=issues, reviewed_at=utcnow(),
                          reviewed_by=_actor(request), reject_reason=None)
        return detail(draft_or_404(draft_id))

    @v1.post("/drafts/{draft_id}/reject")
    def reject(draft_id: str, body: Reject, request: Request) -> dict:
        draft_or_404(draft_id)
        db().update_draft(draft_id, state="rejected", reject_reason=body.reason, reviewed_at=utcnow(),
                          reviewed_by=_actor(request))
        return detail(draft_or_404(draft_id))


def _actor(request: Request) -> str:
    """The verified token's actor, set by the ``signed`` dependency."""
    return getattr(request.state, "actor", "token")


def summary(d: dict) -> dict:
    prov = d.get("provenance") or {}
    return {
        "id": d["id"],
        "job_id": d["job_id"],
        "kind": d["kind"],
        "state": d["state"],
        "name": d["candidate"].get("name", ""),
        "slug": d["candidate"].get("slug", ""),
        "confidence": d["confidence"],
        "error_count": len(d["issues"].get("errors", [])),
        "warning_count": len(d["issues"].get("warnings", [])),
        "duplicate_count": len(d["duplicates"]),
        "flag_count": len(prov.get("flags", [])),
        "reviewed_at": d.get("reviewed_at"),
        "reject_reason": d.get("reject_reason"),
    }


def detail(d: dict) -> dict:
    prov = d.get("provenance") or {}
    return {
        **summary(d),
        "candidate": d["candidate"],
        "yaml": dump_yaml(d["candidate"]),
        "provenance": {
            "fields": prov.get("fields", {}),
            "missing": prov.get("missing", []),
            "flags": prov.get("flags", []),
            "extracted_criteria": prov.get("extracted_criteria", {}),
        },
        "issues": d["issues"],
        "duplicates": d["duplicates"],
    }


app = create_app()
