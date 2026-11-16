"""FastAPI application entry point for the Service Guide API."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.access_gate import AccessGateMiddleware, load_gate_config
from app.config import get_settings
from app.defense.keys import check_defense_config
from app.defense.limits import DefenseRefusal, refusal_handler
from app.middleware import IntakeBodyLimitMiddleware
from app.routers import admin, defense, intake, services
from app.security_headers import SecurityHeadersMiddleware
from app.services.catalog import load_seed_data
from app.services.city import check_env_file, get_city
from app.spa import mount_spa


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load seed data into the in-memory store at startup."""
    load_seed_data()
    yield


check_env_file()
settings = get_settings()
check_defense_config()
city = get_city()
api_title = settings.app_name or f"{city.app_name} API"

app = FastAPI(
    title=api_title,
    version=settings.app_version,
    description=f"API for the {city.app_name} — a demonstration city-resident service portal.",
    lifespan=lifespan,
)

# Reject oversized intake bodies before they are parsed (413). Added before
# CORS so CORS stays the outermost layer and the 413 carries CORS headers.
app.add_middleware(IntakeBodyLimitMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional access-code gate (private demo deployments). Added last so it is
# the outermost layer: nothing, not even CORS preflight or the SPA, runs
# without a valid code. Off unless ACCESS_CODES is set.
gate_config = load_gate_config()
if gate_config is not None:
    app.add_middleware(AccessGateMiddleware, config=gate_config, app_name=city.app_name)

# Security headers (CSP, frame-ancestors, nosniff, ...) wrap everything, the
# gate's form and 401s included. FastAPI's docs pages load a CDN script, so
# they skip the CSP only.
app.add_middleware(
    SecurityHeadersMiddleware,
    csp_exempt_paths=[p for p in (app.docs_url, app.redoc_url, app.swagger_ui_oauth2_redirect_url) if p],
)

# ── Routers ───────────────────────────────────────────────────────────

# Rate-limit, budget and breaker refusals: {"detail", "code", ...} + Retry-After.
app.add_exception_handler(DefenseRefusal, refusal_handler)

app.include_router(intake.router)
app.include_router(defense.router)
app.include_router(services.router)
app.include_router(admin.router)


# ── Root & health ─────────────────────────────────────────────────────

@app.get("/api/v1/health")
async def health():
    return {
        "status": "healthy",
        "demo_mode": settings.demo_mode,
        "azure_openai_configured": settings.has_azure_openai,
        "version": settings.app_version,
    }


# ── SPA (container builds) ────────────────────────────────────────────
# The Docker image sets STATIC_DIR to the built frontend; registered last so
# API routes win. Local dev runs Vite separately and gets the JSON root.

_static_dir = os.environ.get("STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():
    mount_spa(app, _static_dir)
else:

    @app.get("/")
    async def root():
        return {
            "status": "ok",
            "app": api_title,
            "demo_mode": settings.demo_mode,
        }
