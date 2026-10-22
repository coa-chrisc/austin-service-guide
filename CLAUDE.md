# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Civic Service Guide — an open-source, AI-powered resident service portal that any agency can deploy for its place. Austin, TX is the reference deployment (the default city config and the bundled data pack). Residents complete a conversational AI intake (not a form), and the system matches them to city, county, state, federal, and nonprofit services they're eligible for, with results shown on an interactive map.

Two interfaces: a resident-facing portal and a COA staff administrative console.

This is a **demonstration application** showcasing the OpenAI Responses API with reasoning models for an agent-style civic services intake.

## Tech Stack

Built on the [civic-ai-starter](https://github.com/crypticpy/civic-ai-starter) template. Follow its conventions.

- **Frontend:** React 18 + TypeScript + Vite + Material UI v7 (MUI). No Tailwind — all styling through the MUI theme system, driven by the city config (`config/city.config.json`, or the file named by `CITY_CONFIG` at build time, for example `presets/bchc-demo-city.json`).
- **Backend:** FastAPI (Python 3.11+) + Pydantic v2. Routes under `/api/v1/`.
- **AI:** Standard OpenAI **Responses API** with **`gpt-5.5-2026-04-23`** at `reasoning_effort="medium"`. Single model for the conversational intake, the catalog tool calls, language switching, and matching. Text-model calls live in `backend/app/services/ai.py` (agent loop, greeting) and `backend/app/services/plan.py` (plan ordering); every call passes `store=False`. The Realtime client secret is minted in `backend/app/routers/intake.py`. Falls back to a scripted demo flow when `OPENAI_API_KEY` is unset or `DEMO_MODE=true`.
- **Voice intake:** two modes, selected by `VOICE_PIPELINE_MODE` (the browser reads the effective mode from `GET /api/v1/intake/voice-config`). **`intercepted_text` (default):** the browser recognizes speech on-device (Web Speech `SpeechRecognition` with `processLocally=true`; it never falls back to cloud recognition, and browsers without the on-device language pack get text only), scrubs the transcript with `piiGuard.ts`, and sends it through the normal stateless `/message` path, where the server re-redacts before any model call. Replies are spoken with on-device `speechSynthesis` voices only, with phone numbers, addresses, URLs, emails and eligibility sentences stripped from model text; contact details are spoken only from catalog records. **`realtime_audio` (opt-in):** requires `VOICE_PIPELINE_MODE=realtime_audio` AND `ALLOW_RAW_AUDIO_STREAM=true` (otherwise the realtime endpoints return 403), streams raw audio to OpenAI and is meant only for deployments with a zero-data-retention agreement (operator responsibility, not verified by the app); the UI shows a badge and a consent dialog. The `realtime_audio` path is OpenAI **Realtime API** (`gpt-realtime-2`) over WebRTC. The browser posts its intake state to `/api/v1/intake/realtime/client-secret` and gets back an ephemeral `client_secret`, then opens a peer connection directly to OpenAI. Tool calls flow back through `/api/v1/intake/realtime/tool`; transcripts and debug events have their own endpoints under the same prefix. The frontend hook is `frontend/src/hooks/useRealtimeVoiceSession.ts`.
- **Database (demo):** in-memory data loaded from the data pack (YAML; see White-label below), with legacy hard-coded fallbacks in `backend/app/services/seed_data.py` (PostgreSQL + pgvector are the production target — not wired in this demo).
- **Auth (demo):** stubbed — header `X-Staff-Role` is read but not enforced. Admin catalog writes require `X-Admin-Token` matching `ADMIN_API_TOKEN` (writes are disabled when it is unset). Production target is Azure AD B2C / Entra ID.
- **Privacy / state:** the intake is **stateless**. The server keeps no intake sessions; the browser holds `IntakeState` in `sessionStorage` (`frontend/src/lib/session.ts`) and sends it with every request, and the server re-validates, re-redacts and re-grounds it (`backend/app/services/intake_state.py`) before responding and keeping nothing. Resident text is PII-redacted (`backend/app/services/pii.py`, mirrored client-side in `frontend/src/lib/piiGuard.ts`) before any model call. There is no session TTL and no session id in any route. See `docs/PRIVACY.md` and `SECURITY.md`, and keep them true when changing data flows.
- **Hosting:** local `uvicorn` (backend) + `vite` dev server (frontend), or the single container image (`Dockerfile`, `docker-compose.yml`; FastAPI serves the built SPA when `STATIC_DIR` is set). Starter IaC templates are in `deploy/`; see `deploy/README.md` for what was and was not validated.
- **White-label:** `config/city.config.json` (active), `config/city.config.schema.json`, `config/presets/<id>.json`, logos in `config/brand/<id>/`. `CITY_CONFIG=presets/<id>.json` (or the alias `CITY_PRESET=<id>`) selects a config at build time (`frontend/plugins/cityConfigPlugin.ts`; an unknown name fails the build; text below 4.5:1 contrast fails it too). The backend reads the same file via `backend/app/services/city.py` for the app name (greeting, prompt identity sentence, email sender default, share text, realtime transcription prompt, OpenAPI title; `APP_NAME` overrides the title), `serviceGuide.timezone` (open-now hours; absent means UTC) and the place names the PII name rule skips; the frontend uses `serviceGuide.languages` for the language selector. A bad config fails startup. Place-specific data lives in a **data pack** (`backend/app/services/data_pack.py`): `CITY_DATA_DIR` unset means `backend/app/data/` (the Austin reference pack); an absolute path is used as-is; a relative path resolves under `config/` (`data/my-city` is `config/data/my-city`, shipped in the Docker image). The pack holds `services/*.yaml`, `categories.yaml` (required; the frontend build reads it too), `life_events.yaml` and `crisis_resources.yaml` (required, may be `[]`), and optional `zip_centroids.yaml`, `matching_rules.yaml`, `service_translations.yaml`, `personas.yaml` (none: demo launcher hidden) and `admin_demo.yaml` (none: empty admin views); formats are in `backend/app/data/README.md`. Map tiles: build-time `VITE_MAP_TILE_URL` + `VITE_MAP_TILE_ATTRIBUTION`. What stays Austin-specific is the bundled pack's content and the `en-US` speech default; the model prompt names no place but assumes a US setting. Deploy guide: `docs/CUSTOMIZING.md`.

## Common Commands

Backend (run from `backend/`, virtualenv activated):

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload                  # dev server at http://127.0.0.1:8000
python -m compileall app                       # baseline syntax check
python scripts/dump_catalog_to_yaml.py         # legacy seed_data.py → YAML migration utility; do NOT run on a curated YAML tree (overwrites it)
python scripts/dedupe_catalog.py               # produce dedupe_review.csv
```

Frontend (run from `frontend/`):

```bash
npm install
npm run dev                                    # Vite dev server at http://localhost:5173
npm run build                                  # tsc -b && vite build (the required CI check)
npm test                                       # vitest (client PII guard vs shared fixtures)
npm run validate:catalog                       # catalog YAML vs config/services.schema.json (-- --strict fails on unverified entries)
npm run preview                                # serve the production build locally
```

Container (from the repo root):

```bash
docker compose up --build                      # production image (civic-service-guide:local) on http://localhost:8000; CITY_CONFIG=presets/<id>.json (or CITY_PRESET=<id>) picks a city config
```

Environment: copy `backend/.env.example` to `backend/.env`. `CITY_CONFIG` / `CITY_PRESET` / `CITY_CONFIG_DIR` / `CITY_DATA_DIR` (deployment identity and data pack) and `STATIC_DIR` come from the shell or container environment only; the backend refuses to start if `backend/.env` sets them (`check_env_file` in `city.py`). Key `.env` flags — `OPENAI_API_KEY` (enables live AI), `DEMO_MODE=true` (forces scripted fallback), `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_MAX_TOOL_ITERATIONS`, `CORS_ORIGINS`, `PUBLIC_ORIGIN`. Realtime voice flags (used by `realtime_audio` only) — `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL`, `OPENAI_REALTIME_SECRET_TTL_SECONDS`, `VOICE_PIPELINE_MODE` (`intercepted_text` default | `realtime_audio`) and `ALLOW_RAW_AUDIO_STREAM` (default `false`; both must opt in for raw-audio voice; effective mode is served at `GET /api/v1/intake/voice-config`), plus opt-in `REALTIME_DEBUG_LOG_ENABLED` / `REALTIME_DEBUG_LOG_PATH` for local troubleshooting. `settings.use_live_ai` is `True` only when an API key is set AND `DEMO_MODE` is false.

The verification gates are `npm run build`, `npm test`, and `npm run validate:catalog` (from `frontend/`), and `python -m compileall app` plus `python -m pytest` (from `backend/`, after `pip install -r requirements-dev.txt`). Backend tests force the scripted flow and never call OpenAI. The frontend test framework is vitest; it currently covers `src/lib/piiGuard.ts`. `validate:catalog` currently reports 0 errors and all services unverified; `--strict` fails until staff record verification.

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

Each request is stateless: the router rebuilds an `IntakeSession` from the client-sent `IntakeState` (`session_from_state`), the agent loop and tools mutate only that object, and `state_from_session` serializes it back. Any service id or slug that comes from the model or the browser passes through `ground_service_ids` (`backend/app/services/grounding.py`) so only catalog records are rendered or sent. The model still writes conversational text, plan summaries and per-item reasons; those are redacted and length-capped but not fact-checked.

Service matching today is rules-based only (`backend/app/services/matching.py`). Semantic search via pgvector is the production target.

The service catalog is stored in English. All translation is delegated to the model at runtime — no static translation files.

Admin console lives under `/admin/*` routes in the same SPA. Auth is stubbed for the demo; production target is Entra ID with four roles (super_admin, admin, manager, viewer).

### Module Layout

- `backend/app/routers/` — `intake.py` (stateless endpoints: `personas`, `load-persona`, `start`, `message`, `results`, `plan`, `share`, and realtime voice `realtime/client-secret|tool|transcript|debug*`; no session ids), `services.py` (catalog/search/detail), `admin.py` (analytics, equity, audit). All mounted under `/api/v1/`. Also `app/middleware.py` (256 KiB intake body limit) and `app/spa.py` (serves the built SPA).
- `backend/app/services/` — `ai.py` (session start, `process_message`, Responses agent loop, greeting), `prompts.py` (text-agent instructions), `tool_schemas.py` + `tools.py` (tool definitions and dispatch, shared with voice), `scripted.py` (scripted fallback flow), `scenarios.py` (life-event follow-ups, crisis check), `intake_state.py` (client state ↔ session), `grounding.py` (catalog id gate), `pii.py` (redaction), `plan.py` (ordered plan), `realtime.py` (voice session config, tools, transcripts), `realtime_debug.py` (opt-in redacted file log), `catalog.py` + `catalog_loader.py` (in-memory catalog backed by YAML in `app/data/services/`), `seed_data.py` (legacy hard-coded fallback and synthetic admin data), `matching.py` + `eligibility.py` (rules engine), `life_events.py`, `i18n.py`, `hours.py`, `notify.py` (Twilio/SendGrid with masked logging), `personas.py` (multilingual demo personas).
- `backend/app/data/` — the bundled data pack (YAML) the backend loads at boot (or the pack named by `CITY_DATA_DIR`): `categories.yaml`, `life_events.yaml`, `crisis_resources.yaml`, and the per-service files under `services/`. Edit YAML rather than `seed_data.py` for catalog changes; the loader merges them.
- `frontend/src/pages/` — resident routes (`Landing`, `Intake`, `DemoIntake`, `Results`, `ServiceDirectory`, `ServiceDetail`, `MapView`, `Login`) plus `admin/`.
- `frontend/src/components/` — grouped by feature: `landing/` (need chips), `chat/`, `results/`, `services/`, `map/`, `layout/` (incl. `StartOverButton`), `common/`. `lib/` holds the API client (`api.ts`), the client-held intake state (`session.ts`) and the PII pre-flight (`piiGuard.ts`); `hooks/` exposes `useBrandConfig`, `useRealtimeVoiceSession` (WebRTC voice intake), auth, etc.
- `config/` — city config, presets, logos (`brand/<id>/`) and JSON schemas (city config and catalog). `deploy/` — AWS/Azure/GCP templates. Root docs: `SECURITY.md`, `ARCHITECTURE.md`, `docs/PRIVACY.md`.

## Key Design Decisions

- **OpenAI Responses API, not Chat Completions** — needed for the multi-tool agent loop and reasoning models
- **`gpt-5.5-2026-04-23` at `reasoning_effort="medium"`** — one model for everything (conversation, tool dispatch, translation, summarization)
- **No human translation** — multilingual support is purely generative
- **English-canonical catalog** — services stored in English, model translates on the fly
- **No-account-first, stateless** — full intake and results work without an account; the intake state lives only in the browser tab's `sessionStorage` and is sent with each request; the server stores none of it. "Start over" clears it.
- **Catalog grounding** — cards and contact details render only from catalog records; unknown service ids from the model or client are dropped
- **Structured navigation first** — the landing page leads with need chips + ZIP + language; chat/voice is the secondary path
- **No claims beyond the code** — the catalog is unverified, admin auth is a stub, and `store=False` is not zero data retention; do not write docs that imply otherwise
- **Crisis detection interrupts intake** — keyword check in the backend short-circuits to a crisis response; the model also has `get_crisis_resources` available to call proactively

## Further Reading

- `docs/CUSTOMIZING.md` — deploy for your own place: city config, data pack, map tiles, checklist
- `backend/app/data/README.md` — data pack file formats
- `docs/PRIVACY.md`, `SECURITY.md`, `ARCHITECTURE.md`, `deploy/README.md`

## Civic-AI-Starter Conventions

These patterns come from the starter template and must be followed:

- MUI: use `sx` prop for one-off styles, `styled()` for reusable. Import from specific paths (`@mui/material/Button`). Use `theme.palette.*` colors, never hardcoded hex. Buttons: `textTransform: "none"`, `fontWeight: 600`, `disableElevation: true`.
- Backend: text-model calls live in `backend/app/services/ai.py` (and `plan.py` for plan ordering). The Responses-API path is `_responses_flow`; the scripted path is `demo_flow` in `scripted.py`. `process_message` picks based on `settings.use_live_ai`.
- Branding: all visual identity is driven by the city config. Use the `useBrandConfig()` hook and `theme.palette` / `theme.palette.brand` tokens; never hex or other literal colors (enforced by `frontend/src/theme/themeGuard.test.ts`; exempt a line with `theme-exempt: <reason>`).
- Auth: FastAPI dependency injection (`Depends(require_auth)`).
- Grid: MUI Grid v2 with `size` prop: `<Grid size={{ xs: 12, md: 6 }}>`.
- Commits: Conventional Commits with scopes seen in history (`feat(intake):`, `fix(a11y):`, `chore(catalog):`, etc.). Keep subjects imperative.
- Tests: when adding tests, colocate frontend tests (vitest) with their module; place backend tests under `backend/tests/test_*.py`. PII rule changes go in `backend/tests/fixtures/pii_cases.json`, which both pytest and vitest run.
