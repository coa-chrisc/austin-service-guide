# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Austin Service Guide — an AI-powered resident service portal for the City of Austin, TX. Residents complete a conversational AI intake (not a form), and the system matches them to city, county, state, federal, and nonprofit services they're eligible for, with results shown on an interactive map.

Two interfaces: a resident-facing portal and a COA staff administrative console.

This is a **demonstration application** showcasing Azure OpenAI capabilities.

## Tech Stack

Built on the [civic-ai-starter](https://github.com/crypticpy/civic-ai-starter) template. Follow its conventions.

- **Frontend:** React 18 + TypeScript + Vite + Material UI v7 (MUI). No Tailwind — all styling through MUI theme system via `brand.config.json`.
- **Backend:** FastAPI (Python 3.11+) + Pydantic v2. Routes under `/api/v1/`.
- **AI:** Azure OpenAI — **GPT-5.4-mini** is the single model for all operations (intake, matching, translation, risk assessment). text-embedding-ada-002 for semantic search. All AI calls go through `ai_service.py` with retry logic — never call providers directly.
- **Database:** Azure Database for PostgreSQL (Flexible Server) with pgvector extension. Migrations via Alembic.
- **Auth:** Azure AD B2C for residents, Azure AD / Entra ID for staff. No Supabase.
- **Storage:** Azure Blob Storage. **Caching:** Azure Cache for Redis.
- **Hosting:** Azure Container Apps. **CI/CD:** GitHub Actions.

## Architecture

The AI chat assistant is the core interface. It uses OpenAI function calling (tool use) with 7 tools: `search_services`, `get_service_details`, `search_by_location`, `check_eligibility`, `get_crisis_resources`, `calculate_benefits`, `find_matching_services_batch`. The assistant handles language detection, mid-conversation language switching, and cross-lingual service catalog search (translates queries to English for DB lookup, presents results in resident's language).

Service matching is two-phase: rules-based (eligibility_rules evaluated against resident profile) then semantic (pgvector similarity search). Results are merged and ranked.

The service catalog is stored in English as the canonical language. All translation is performed by GPT-5.4-mini at runtime — no static translation files.

Admin console lives under `/admin/*` routes in the same SPA, gated by Entra ID auth. Four roles: super_admin, admin, manager, viewer.

## Key Design Decisions

- **No Supabase** — pure Azure stack (PostgreSQL, AD B2C, Blob Storage, Redis)
- **No human translation** — all multilingual support via generative AI at runtime
- **GPT-5.4-mini for everything** — single model, demo app
- **English-canonical catalog** — services stored in English, AI translates on the fly
- **No-account-first** — full intake and results work without creating an account; anonymous session data lives only in browser memory
- **Crisis detection interrupts intake** — if the AI detects crisis language, it immediately surfaces emergency resources via `get_crisis_resources` tool before continuing

## Design Documents

Read these before implementing:

- `VISION.md` — problem statement, target users, design principles, success metrics
- `REQUIREMENTS.md` — feature inventory (24 resident + 15 admin features), detailed functional requirements, technical architecture, data model, non-functional requirements
- `USER_STORIES.md` — 42 user stories across 10 epics with acceptance criteria, prioritized P0-P3
- `BACKEND_DESIGN.md` — database schema (full DDL), API endpoints (50+), AI pipeline (system prompt, tool definitions, matching engine), admin console wireframes, background jobs, module structure
- `COMPETITIVE_ANALYSIS.md` — landscape audit, gap analysis, innovation features

## Civic-AI-Starter Conventions

These patterns come from the starter template and must be followed:

- MUI: use `sx` prop for one-off styles, `styled()` for reusable. Import from specific paths (`@mui/material/Button`). Use `theme.palette.*` colors, never hardcoded hex. Buttons: `textTransform: "none"`, `fontWeight: 600`, `disableElevation: true`.
- Backend: AI provider abstraction via factory pattern in `ai_providers/`. New providers subclass `AIProvider` from `base.py`. Register in `_PROVIDER_REGISTRY` dict.
- Branding: all visual identity driven by `brand.config.json`. Use `useBrandConfig()` hook.
- Auth: FastAPI dependency injection (`Depends(require_auth)`).
- Grid: MUI Grid v2 with `size` prop: `<Grid size={{ xs: 12, md: 6 }}>`.
