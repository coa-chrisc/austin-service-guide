"""FastAPI application entry point for the Austin Service Guide API."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.middleware import IntakeBodyLimitMiddleware
from app.routers import admin, intake, services
from app.services.catalog import load_seed_data
from app.spa import mount_spa


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load seed data into the in-memory store at startup."""
    load_seed_data()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API for the Austin Service Guide — a demonstration city-resident service portal.",
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

# ── Routers ───────────────────────────────────────────────────────────

app.include_router(intake.router)
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
            "app": settings.app_name,
            "demo_mode": settings.demo_mode,
        }
