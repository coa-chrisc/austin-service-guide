# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Austin Service Guide — an AI-powered resident service portal for the City of Austin, TX. Residents complete a conversational AI intake (not a form), and the system matches them to city, county, state, federal, and nonprofit services they're eligible for, with results shown on an interactive map.

Two interfaces: a resident-facing portal and a COA staff administrative console.

This is a **demonstration application** showcasing the OpenAI Responses API with reasoning models for an agent-style civic services intake.

## Tech Stack

Built on the [civic-ai-starter](https://github.com/crypticpy/civic-ai-starter) template. Follow its conventions.

- **Frontend:** React 18 + TypeScript + Vite + Material UI v7 (MUI). No Tailwind — all styling through MUI theme system via `brand.config.json`.
- **Backend:** FastAPI (Python 3.11+) + Pydantic v2. Routes under `/api/v1/`.
- **AI:** Standard OpenAI **Responses API** with **`gpt-5.5-2026-04-23`** at `reasoning_effort="medium"`. Single model for the conversational intake, the catalog tool calls, language switching, and matching. All AI calls go through `backend/app/services/ai.py`. Falls back to a scripted demo flow when `OPENAI_API_KEY` is unset or `DEMO_MODE=true`.
- **Database (demo):** in-memory seed data in `backend/app/services/seed_data.py` (PostgreSQL + pgvector are the production target — not wired in this demo).
- **Auth (demo):** stubbed — header `X-Staff-Role` is read but not enforced. Production target is Azure AD B2C / Entra ID.
- **Hosting:** local `uvicorn` (backend) + `vite` dev server (frontend).

## Architecture

The AI intake is implemented as a **Responses API agent loop** in `backend/app/services/ai.py`. Each turn the model can call any of these function tools, often several in sequence within a single user turn:

- `search_services(query, category?, zip?)` — keyword search the in-memory catalog
- `get_service_details(slug)` — full record for one service
- `get_crisis_resources(language?)` — surface crisis hotlines
- `extract_profile(...)` — persist resident profile fields the model has inferred
- `find_matching_services()` — run the rules-based matching engine on the current profile
- `set_language(code)` — switch the session language mid-conversation
- `complete_intake()` — finalize, run matching, return the summary

The loop walks `response.output`, dispatches each `function_call` item locally, appends the call + a `function_call_output` (correlated by `call_id`) to the conversation context, and re-invokes `client.responses.create(...)` until the model returns a plain text message. Iteration cap lives in `OPENAI_MAX_TOOL_ITERATIONS` (default 6).

Service matching today is rules-based only (`backend/app/services/matching.py`). Semantic search via pgvector is the production target.

The service catalog is stored in English. All translation is delegated to the model at runtime — no static translation files.

Admin console lives under `/admin/*` routes in the same SPA. Auth is stubbed for the demo; production target is Entra ID with four roles (super_admin, admin, manager, viewer).

## Key Design Decisions

- **OpenAI Responses API, not Chat Completions** — needed for the multi-tool agent loop and reasoning models
- **`gpt-5.5-2026-04-23` at `reasoning_effort="medium"`** — one model for everything (conversation, tool dispatch, translation, summarization)
- **No human translation** — multilingual support is purely generative
- **English-canonical catalog** — services stored in English, model translates on the fly
- **No-account-first** — full intake and results work without an account; anonymous session data lives only in browser memory + backend in-memory store
- **Crisis detection interrupts intake** — keyword check in the backend short-circuits to a crisis response; the model also has `get_crisis_resources` available to call proactively

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
- Backend: AI calls live in `backend/app/services/ai.py`. The Responses-API path is `_responses_flow`; the scripted path is `_demo_flow`. The router (`process_message`) picks based on `settings.use_live_ai`.
- Branding: all visual identity driven by `brand.config.json`. Use `useBrandConfig()` hook.
- Auth: FastAPI dependency injection (`Depends(require_auth)`).
- Grid: MUI Grid v2 with `size` prop: `<Grid size={{ xs: 12, md: 6 }}>`.
