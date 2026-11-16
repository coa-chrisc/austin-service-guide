"""Database access for jobs, events, steps, sources, drafts and used tokens.

Worker-only (SQLAlchemy). One ``Store`` per process. Postgres claims jobs
with ``SELECT ... FOR UPDATE SKIP LOCKED``; SQLite (tests, inline mode)
ignores the lock clause, which is fine for its single process.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, create_engine, delete, insert, or_, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.jobs.models import drafts, job_events, job_steps, jobs, metadata, sources, used_tokens

ACTIVE_STATES = ("queued", "running")
FINISHED_STATES = ("needs_review", "failed", "cancelled")
EMPTY_COUNTERS = {
    "steps": 0,
    "searches": 0,
    "pages": 0,
    "input_tokens": 0,
    "output_tokens": 0,
    "search_calls": 0,
    "cached_tokens": 0,
    "estimated_cost_usd": 0.0,
    "drafts": 0,
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return secrets.token_hex(16)


def normalize_db_url(url: str) -> str:
    """Railway gives postgresql://; SQLAlchemy needs the psycopg 3 driver name."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _aware(value: Any) -> Any:
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _iso(value: Any) -> str | None:
    value = _aware(value)
    return value.isoformat() if isinstance(value, datetime) else None


class Store:
    def __init__(self, url: str) -> None:
        if not url:
            raise RuntimeError("DATABASE_URL is not set; the job worker needs a database")
        url = normalize_db_url(url)
        kwargs: dict[str, Any] = {"future": True, "pool_pre_ping": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        else:
            kwargs.update(pool_size=5, max_overflow=2)
        self.engine: Engine = create_engine(url, **kwargs)
        self.is_postgres = self.engine.dialect.name == "postgresql"
        metadata.create_all(self.engine)

    # ── Jobs ───────────────────────────────────────────────────────

    def create_job(self, kind: str, params: dict, caps: dict, actor: str, *, state: str = "queued") -> dict:
        job_id = new_id()
        with self.engine.begin() as conn:
            conn.execute(insert(jobs).values(
                id=job_id, kind=kind, state=state, params=params, caps=caps,
                counters=dict(EMPTY_COUNTERS), plan=None, plan_approved=False,
                created_at=utcnow(), created_by=actor[:64],
            ))
        self.add_event(job_id, "state", f"Job created ({kind})")
        return self.get_job(job_id)  # type: ignore[return-value]

    def get_job(self, job_id: str) -> dict | None:
        with self.engine.connect() as conn:
            row = conn.execute(select(jobs).where(jobs.c.id == job_id)).mappings().first()
        return self._job(row) if row else None

    def list_jobs(self, limit: int = 50) -> list[dict]:
        with self.engine.connect() as conn:
            rows = conn.execute(select(jobs).order_by(jobs.c.created_at.desc()).limit(limit)).mappings().all()
        return [self._job(r) for r in rows]

    @staticmethod
    def _job(row: Any) -> dict:
        job = dict(row)
        for key in ("created_at", "started_at", "finished_at", "lease_expires_at"):
            job[key] = _iso(job.get(key))
        job.pop("lease_owner", None)
        job.pop("lease_expires_at", None)
        return job

    def update_job(self, job_id: str, **fields: Any) -> None:
        with self.engine.begin() as conn:
            conn.execute(update(jobs).where(jobs.c.id == job_id).values(**fields))

    def transition(self, job_id: str, from_states: tuple[str, ...], **fields: Any) -> bool:
        """Conditional update: only when the job is in one of ``from_states``."""
        with self.engine.begin() as conn:
            res = conn.execute(
                update(jobs).where(and_(jobs.c.id == job_id, jobs.c.state.in_(from_states))).values(**fields)
            )
        return res.rowcount == 1

    def claim_job(self, owner: str, lease_seconds: int) -> dict | None:
        """Claim the oldest queued job, or a running one whose lease expired
        (a worker that died mid-run). One research job runs at a time: no
        claim while another job holds a live lease."""
        now = utcnow()
        with self.engine.begin() as conn:
            busy = conn.execute(
                select(jobs.c.id).where(and_(jobs.c.state == "running", jobs.c.lease_expires_at > now,
                                             jobs.c.lease_owner != owner))
            ).first()
            if busy:
                return None
            stmt = (
                select(jobs.c.id)
                .where(or_(
                    jobs.c.state == "queued",
                    and_(jobs.c.state == "running",
                         or_(jobs.c.lease_expires_at.is_(None), jobs.c.lease_expires_at < now)),
                ))
                .order_by(jobs.c.created_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            row = conn.execute(stmt).first()
            if not row:
                return None
            conn.execute(update(jobs).where(jobs.c.id == row.id).values(
                state="running", lease_owner=owner, lease_expires_at=now + timedelta(seconds=lease_seconds),
            ))
            conn.execute(update(jobs).where(and_(jobs.c.id == row.id, jobs.c.started_at.is_(None)))
                         .values(started_at=now))
        return self.get_job(row.id)

    def heartbeat(self, job_id: str, owner: str, lease_seconds: int) -> bool:
        """Extend the lease. False when the job was cancelled or taken over."""
        with self.engine.begin() as conn:
            res = conn.execute(
                update(jobs)
                .where(and_(jobs.c.id == job_id, jobs.c.state == "running", jobs.c.lease_owner == owner))
                .values(lease_expires_at=utcnow() + timedelta(seconds=lease_seconds))
            )
        return res.rowcount == 1

    def release(self, job_id: str, owner: str, **fields: Any) -> bool:
        """Finish or park a job this worker holds."""
        fields.setdefault("lease_owner", None)
        fields.setdefault("lease_expires_at", None)
        with self.engine.begin() as conn:
            res = conn.execute(
                update(jobs)
                .where(and_(jobs.c.id == job_id, jobs.c.state == "running", jobs.c.lease_owner == owner))
                .values(**fields)
            )
        return res.rowcount == 1

    # ── Events ─────────────────────────────────────────────────────

    def add_event(self, job_id: str, type_: str, message: str, data: dict | None = None) -> None:
        with self.engine.begin() as conn:
            conn.execute(insert(job_events).values(
                job_id=job_id, at=utcnow(), type=type_[:32], message=message[:500], data=data,
            ))

    def list_events(self, job_id: str, after: int = 0, limit: int = 500) -> list[dict]:
        with self.engine.connect() as conn:
            rows = conn.execute(
                select(job_events.c.id, job_events.c.at, job_events.c.type, job_events.c.message)
                .where(and_(job_events.c.job_id == job_id, job_events.c.id > after))
                .order_by(job_events.c.id).limit(limit)
            ).mappings().all()
        return [{**dict(r), "at": _iso(r["at"])} for r in rows]

    # ── Steps (idempotent resume) ──────────────────────────────────

    def get_step(self, job_id: str, key: str) -> tuple[bool, Any]:
        with self.engine.connect() as conn:
            row = conn.execute(
                select(job_steps.c.result).where(and_(job_steps.c.job_id == job_id, job_steps.c.step_key == key))
            ).first()
        return (True, row.result) if row else (False, None)

    def put_step(self, job_id: str, key: str, result: Any) -> None:
        try:
            with self.engine.begin() as conn:
                conn.execute(insert(job_steps).values(job_id=job_id, step_key=key[:200], result=result, at=utcnow()))
        except IntegrityError:
            pass  # committed by an earlier attempt; keep the first result

    # ── Sources ────────────────────────────────────────────────────

    def add_source(self, job_id: str, **fields: Any) -> dict:
        sid = new_id()
        with self.engine.begin() as conn:
            conn.execute(insert(sources).values(id=sid, job_id=job_id, retrieved_at=utcnow(), **fields))
        return self.get_source(sid)  # type: ignore[return-value]

    def get_source(self, source_id: str) -> dict | None:
        with self.engine.connect() as conn:
            row = conn.execute(select(sources).where(sources.c.id == source_id)).mappings().first()
        return {**dict(row), "retrieved_at": _iso(row["retrieved_at"])} if row else None

    def list_sources(self, job_id: str) -> list[dict]:
        with self.engine.connect() as conn:
            rows = conn.execute(select(sources).where(sources.c.job_id == job_id)).mappings().all()
        return [{**dict(r), "retrieved_at": _iso(r["retrieved_at"])} for r in rows]

    # ── Drafts ─────────────────────────────────────────────────────

    def add_draft(self, job_id: str, **fields: Any) -> str:
        did = new_id()
        with self.engine.begin() as conn:
            conn.execute(insert(drafts).values(id=did, job_id=job_id, state="pending", created_at=utcnow(), **fields))
        return did

    def get_draft(self, draft_id: str) -> dict | None:
        with self.engine.connect() as conn:
            row = conn.execute(select(drafts).where(drafts.c.id == draft_id)).mappings().first()
        return self._draft(row) if row else None

    def list_drafts(self, job_id: str | None = None, state: str | None = None, limit: int = 500) -> list[dict]:
        stmt = select(drafts).order_by(drafts.c.created_at).limit(limit)
        if job_id:
            stmt = stmt.where(drafts.c.job_id == job_id)
        if state:
            stmt = stmt.where(drafts.c.state == state)
        with self.engine.connect() as conn:
            rows = conn.execute(stmt).mappings().all()
        return [self._draft(r) for r in rows]

    @staticmethod
    def _draft(row: Any) -> dict:
        d = dict(row)
        d["reviewed_at"] = _iso(d.get("reviewed_at"))
        d["created_at"] = _iso(d.get("created_at"))
        return d

    def delete_draft(self, draft_id: str) -> None:
        with self.engine.begin() as conn:
            conn.execute(delete(drafts).where(drafts.c.id == draft_id))

    def update_draft(self, draft_id: str, **fields: Any) -> None:
        with self.engine.begin() as conn:
            conn.execute(update(drafts).where(drafts.c.id == draft_id).values(**fields))

    # ── Replay protection and retention ────────────────────────────

    def token_seen(self, jti: str, expires_epoch: int) -> bool:
        """Record a token id; True if it was already recorded (a replay)."""
        expires = datetime.fromtimestamp(expires_epoch, tz=timezone.utc)
        try:
            with self.engine.begin() as conn:
                conn.execute(insert(used_tokens).values(jti=jti[:64], expires_at=expires))
        except IntegrityError:
            return True
        return False

    def purge(self, retention_days: int) -> int:
        """Drop expired token ids and finished jobs older than the retention
        window (events, steps, sources and drafts go with them)."""
        now = utcnow()
        cutoff = now - timedelta(days=retention_days)
        with self.engine.begin() as conn:
            conn.execute(delete(used_tokens).where(used_tokens.c.expires_at < now))
            old = [r.id for r in conn.execute(
                select(jobs.c.id).where(and_(jobs.c.state.in_(FINISHED_STATES), jobs.c.created_at < cutoff))
            )]
            for table in (job_events, job_steps, sources, drafts):
                if old:
                    conn.execute(delete(table).where(table.c.job_id.in_(old)))
            if old:
                conn.execute(delete(jobs).where(jobs.c.id.in_(old)))
        return len(old)
