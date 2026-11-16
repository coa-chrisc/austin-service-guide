"""Job, event, source, draft and token tables (SQLAlchemy Core).

Worker-only. Postgres in production (Railway), SQLite for tests and
``JOB_BACKEND=inline``. #14 P1 (database foundation) has not landed, so this
is the minimal slice it should adopt: tables are created with
``metadata.create_all`` at worker start. When P1 brings Alembic, the first
migration should match these definitions.
"""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()
Json = JSON().with_variant(JSONB(), "postgresql")

jobs = Table(
    "jobs",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("kind", String(16), nullable=False),
    # queued | awaiting_plan | running | needs_review | failed | cancelled
    Column("state", String(16), nullable=False, index=True),
    Column("params", Json, nullable=False),
    Column("caps", Json, nullable=False),
    Column("counters", Json, nullable=False),
    Column("plan", Json),
    Column("plan_approved", Boolean, nullable=False, default=False),
    Column("report", Json),
    Column("stop_reason", String(64)),
    Column("error", Text),
    Column("lease_owner", String(64)),
    Column("lease_expires_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, index=True),
    Column("started_at", DateTime(timezone=True)),
    Column("finished_at", DateTime(timezone=True)),
    Column("created_by", String(64), nullable=False),
)

job_events = Table(
    "job_events",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("job_id", String(32), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
    Column("at", DateTime(timezone=True), nullable=False),
    Column("type", String(32), nullable=False),
    Column("message", String(500), nullable=False),
    Column("data", Json),
    Index("ix_job_events_job_id_id", "job_id", "id"),
)

# Committed step results, keyed per job, so a restarted run skips them.
job_steps = Table(
    "job_steps",
    metadata,
    Column("job_id", String(32), ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True),
    Column("step_key", String(200), primary_key=True),
    Column("result", Json),
    Column("at", DateTime(timezone=True), nullable=False),
)

sources = Table(
    "sources",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("job_id", String(32), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("url", Text, nullable=False),
    Column("final_url", Text, nullable=False),
    Column("host", String(255), nullable=False),
    Column("title", String(500)),
    Column("retrieved_at", DateTime(timezone=True), nullable=False),
    Column("sha256", String(64), nullable=False),
    Column("text", Text, nullable=False),
    Column("links", Json),
)

drafts = Table(
    "drafts",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("job_id", String(32), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("kind", String(32), nullable=False),
    Column("candidate", Json, nullable=False),
    Column("provenance", Json, nullable=False),
    Column("issues", Json, nullable=False),
    Column("duplicates", Json, nullable=False),
    Column("confidence", Float, nullable=False),
    # pending | accepted | rejected | merged
    Column("state", String(16), nullable=False),
    Column("reviewed_by", String(64)),
    Column("reviewed_at", DateTime(timezone=True)),
    Column("reject_reason", String(500)),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

used_tokens = Table(
    "used_tokens",
    metadata,
    Column("jti", String(64), primary_key=True),
    Column("expires_at", DateTime(timezone=True), nullable=False, index=True),
)

__all__ = ["metadata", "jobs", "job_events", "job_steps", "sources", "drafts", "used_tokens"]
