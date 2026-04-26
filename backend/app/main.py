"""FastAPI application entry point for the Austin Service Guide API."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, intake, services
from app.services.catalog import load_seed_data


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

@app.get("/")
async def root():
    return {
        "status": "ok",
        "app": settings.app_name,
        "demo_mode": settings.demo_mode,
    }


@app.get("/api/v1/health")
async def health():
    return {
        "status": "healthy",
        "demo_mode": settings.demo_mode,
        "azure_openai_configured": settings.has_azure_openai,
        "version": settings.app_version,
    }
