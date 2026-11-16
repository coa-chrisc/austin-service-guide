"""Per-request defense context: the principal and any degraded mode.

The route dependency in ``limits.py`` binds it; ``ai.py`` and ``plan.py``
read it through ``budget.ai_allowed`` instead of taking a new argument, so
the principal never touches ``IntakeSession`` (which goes to the client).
A ``ContextVar`` is per task: each request has its own value and nothing
outlives the request.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass

from app.defense.principal import Principal


@dataclass
class DefenseContext:
    principal: Principal | None = None
    #: None | "ai_budget" | "disabled": why this request skipped live AI.
    degraded: str | None = None
    #: Which resident-facing sentence explains it (see messages.py).
    notice: str | None = None

    def degrade(self, value: str, notice: str) -> None:
        self.degraded = value
        self.notice = notice


_current: ContextVar[DefenseContext | None] = ContextVar("defense_context", default=None)


def bind(principal: Principal | None) -> DefenseContext:
    ctx = DefenseContext(principal=principal)
    _current.set(ctx)
    return ctx


def current() -> DefenseContext:
    """This request's context; a fresh, principal-less one outside a request."""
    ctx = _current.get()
    if ctx is None:
        ctx = bind(None)
    return ctx


def degraded() -> str | None:
    ctx = _current.get()
    return ctx.degraded if ctx else None
