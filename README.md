# Austin Service Guide

**A working demo of how Austin Public Health could use modern AI-assisted development, service design, and open web tools to help residents find the right public health and social services faster.**

This project is a demonstration, not a production system. It was built to show what is now possible in days instead of months or years: a resident-facing service guide, an AI intake assistant with tool calling, a searchable service catalog, an interactive map, service plans residents can print or send by text or email, and an admin analytics console.

The goal is to support conversations with Austin Public Health (APH), public health commissioners, civic technology leaders, and community partners about how AI tools can improve service navigation while keeping humans, transparency, and public accountability at the center.

## Security, privacy & architecture

- [SECURITY.md](SECURITY.md): threat model, what is implemented (stateless intake, PII guard, catalog grounding, containers), known gaps before production, and the Phase 2 roadmap.
- [ARCHITECTURE.md](ARCHITECTURE.md): components, data-flow diagram, the stateless request lifecycle, module map, white-label config, and deployment modes.
- [docs/PRIVACY.md](docs/PRIVACY.md): what is collected, what is sent to OpenAI, how identifiers are removed, and the limits of that.
- [deploy/README.md](deploy/README.md): container image and AWS / Azure / GCP starter templates (validated, not applied to live accounts).

In short: the server keeps no intake sessions (the browser holds the state in `sessionStorage`), recognizable identifiers (SSN, phone, address, and similar) are redacted before any model call, and result cards render only catalog data. The catalog is demo data and is **not verified**, and several production controls (staff auth, rate limiting, vendor agreements) are not built. SECURITY.md lists them.

## Why This Demo Exists

Residents often need help before they know which program, department, nonprofit, or phone number to search for. Public health systems also need better ways to understand demand, identify gaps, and connect people to prevention-oriented services before a situation becomes a crisis.

The Austin Service Guide demonstrates a different model:

- A resident explains their situation in plain language.
- An AI assistant asks a short series of guided questions.
- The system uses tools to search the catalog, remember relevant profile details, detect urgent needs, and generate a personalized service plan.
- The resident can view recommended services, documents to bring, phone numbers, locations, hours, and next steps.
- Staff can review aggregate service demand, equity patterns, language access, reports, and catalog data in an admin console.

This is the kind of civic technology that can be prototyped rapidly with modern development frameworks, AI coding workflows, and reusable open-source components.

## Demo Highlights

- **AI-powered intake chatbot** that can run with OpenAI's Responses API or fall back to a scripted demo flow.
- **Voice intake with on-device speech recognition by default.** In the default `intercepted_text` mode, speech is recognized in the browser (no raw audio leaves the device), the transcript is PII-scrubbed in the browser and again on the server, and the reply is spoken with on-device voices. An opt-in `realtime_audio` mode streams raw audio to OpenAI's Realtime API (`gpt-realtime-2`) over WebRTC and is meant only for deployments with an OpenAI zero-data-retention agreement.
- **Tool-calling AI workflow** that searches services, extracts profile information, finds matches, changes language, retrieves crisis resources, and completes the intake.
- **No-account-first, stateless resident experience** so a resident can get recommendations without signing up. The intake state lives in the browser tab, not on the server, and "Start over" clears it.
- **Need-first navigation**: the landing page leads with need chips (food, healthcare, housing, maternal and child, financial and benefits, mental health), a ZIP select, and a language selector. Chat and voice are the secondary path.
- **Life-event entry points** such as losing a job, a housing crisis, a new baby, veteran transition, an aging parent, a new disability, an unsafe situation, and adding healthy years.
- **Personalized service plan** that prioritizes the first few actions instead of overwhelming residents with a long directory.
- **Searchable service directory** with categories, highlighted matches, open-now filtering, and helpful suggestions when no exact result is found.
- **Interactive map** with categorized service pins, list view, category filters, plan-only mode, "near me" distance support, and service popups.
- **Service detail pages** with eligibility, documents needed, locations, hours, contact information, directions, language support, accessibility features, and sharing.
- **Risk and prevention framing** that surfaces urgent needs in calm, plain language.
- **Crisis pathway** for suicidal ideation, domestic violence, or immediate danger, with 988, 911, Integral Care, and SAFE Alliance-style guidance.
- **Share options** including native share, text/email fallback (service names, phone numbers, and public service links), print/PDF support, and per-service QR codes. There are no saved or shareable results links: the plan lives in the resident's browser tab for that visit.
- **Admin console** for resident records, services, analytics, demand maps, equity views, language access, eligibility rules, reports, audit logs, and staff.
- **Demo notification stubs** for SMS and email, with optional Twilio and SendGrid integration points.

## How The AI Chatbot Works

The chatbot is not just a keyword bot. In live mode, the backend uses the OpenAI Responses API with a small tool loop. The model can call local backend functions, receive structured results, and continue the conversation with that context.

Available AI tools in the demo:

| Tool                     | What it does                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `search_services`        | Searches the local service catalog by keyword, category, and ZIP code.                                                                 |
| `get_service_details`    | Retrieves full detail for one service by slug.                                                                                         |
| `get_crisis_resources`   | Returns crisis and emergency resources for urgent situations.                                                                          |
| `extract_profile`        | Stores relevant intake facts such as household size, ZIP code, housing situation, income range, insurance status, and immediate needs. |
| `find_matching_services` | Runs the matching engine against the resident profile.                                                                                 |
| `set_language`           | Switches the conversation language when the resident asks or writes in another language.                                               |
| `complete_intake`        | Finalizes the intake, runs matching, assesses risk flags, estimates benefits, and marks the session complete.                          |

If no API key is configured, the app still works in demo mode using a scripted guided intake. That makes it easier to present live without depending on external services.

## What The Resident Sees

The resident experience is designed to feel like a helpful navigator rather than a government form.

1. **Start with a need or life event.** The resident can pick a need chip, browse the landing page, choose a life-event card, search the directory, or open the intake.
2. **Answer a short chat intake.** The assistant asks about household size, ZIP code, housing, work, income, insurance, and immediate needs.
3. **Get a plan.** Results are organized into a practical starting sequence, with the most important service first and a short list of next actions.
4. **Explore details.** Each service includes eligibility, cost, documents, phone, website, location, directions, hours, language support, and accessibility notes.
5. **Use the map.** Residents can see where services are located, filter categories, view only their plan services, and find nearby options.
6. **Share or print.** The resident can send service names and phone numbers to themselves by text or email, or print the plan. The plan is not saved on a server; it stays in the browser tab until the resident clicks "Start over" or closes the tab.

## What Staff And Leaders Can Review

The admin console is included to show how this kind of tool can support public health operations, planning, and accountability.

Demo admin areas include:

- Resident dashboard and resident detail views
- Service catalog management
- Analytics overview
- Demographic analytics
- Service demand trends
- Demand map
- Equity dashboard
- Language access view
- Eligibility rules
- Reports
- Audit log
- Staff management

In production, these areas would connect to authenticated staff access, governed data pipelines, privacy controls, and approved reporting workflows. In this demo, they use generated and seed data to show the concept.

## Service Catalog

The backend includes a seeded Austin-area service catalog with 87 demo services across categories such as:

- Food and nutrition
- Healthcare and mental health
- Housing and shelter
- Employment and job training
- Utilities
- Child care and family services
- Senior services
- Veterans services
- Transportation
- Legal aid
- Disability services
- Education and literacy
- Immigration services
- Emergency assistance

Each service can include provider details, eligibility summaries, application instructions, cost type, phone, website, email, languages, accessibility features, documents required, locations, hours, and map coordinates.

## Technology Stack

| Layer                  | Technology                                                       |
| ---------------------- | ---------------------------------------------------------------- |
| Frontend               | React, TypeScript, Vite                                          |
| UI                     | Material UI, MUI Icons                                           |
| Routing                | React Router                                                     |
| Mapping                | Leaflet and React Leaflet                                        |
| Backend                | FastAPI, Pydantic                                                |
| AI                     | OpenAI Responses API with tool calling; scripted fallback mode   |
| HTTP                   | Fetch API on frontend, `httpx` for outbound backend integrations |
| Demo data              | YAML catalog under `backend/app/data/`, loaded into memory       |
| Optional notifications | Twilio SMS and SendGrid email stubs/integration points           |

## Running Locally

### Prerequisites

- **Python 3.11 or newer** (3.12 tested) for the backend.
- **Node.js 20 or newer** with `npm` for the frontend.
- **Git** to clone the repository.
- (Optional) An **OpenAI API key** with access to the Responses API and the Realtime API. Without one, the app runs in scripted demo mode.

### 1. Clone the repository

```bash
git clone https://github.com/coa-chrisc/austin-service-guide.git
cd austin-service-guide
```

### 2. Start the backend

The backend is a FastAPI app under `backend/`. Run every command below from that directory with a virtual environment active.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. Leave this terminal open.

### 3. Start the frontend

In a **second terminal**, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`. Open that URL in a browser. The frontend expects the backend from step 2 to be running.

> The frontend uses npm; `package-lock.json` is the canonical lockfile committed to the repo.

### 4. (Optional) Configure environment

Copy `backend/.env.example` to `backend/.env` to enable live AI, realtime voice, and notifications. Without a `.env`, the backend runs in scripted demo mode and the rest of the app still works.

```bash
cp backend/.env.example backend/.env
```

Useful settings:

- `OPENAI_API_KEY` — enables live AI intake (Responses API).
- `OPENAI_MODEL` — model used by the Responses API (default `gpt-5.5-2026-04-23`).
- `OPENAI_REASONING_EFFORT` — `low` / `medium` / `high` (default `medium`).
- `OPENAI_MAX_TOOL_ITERATIONS` — safety cap on tool-call rounds per assistant turn (default `6`).
- `VOICE_PIPELINE_MODE` — `intercepted_text` (default) or `realtime_audio`. In `intercepted_text` the browser recognizes speech on-device and only scrubbed text reaches the server and model. In `realtime_audio` the browser streams raw microphone audio to OpenAI's Realtime API.
- `ALLOW_RAW_AUDIO_STREAM` — default `false`. `realtime_audio` takes effect only when `VOICE_PIPELINE_MODE=realtime_audio` AND `ALLOW_RAW_AUDIO_STREAM=true` (and live AI is on); otherwise the server returns 403 on `/api/v1/intake/realtime/client-secret|tool|transcript`. Set it only for a deployment with an OpenAI zero-data-retention agreement; the app does not verify that agreement. The browser reads the effective mode from `GET /api/v1/intake/voice-config`.
- `OPENAI_REALTIME_MODEL` — model for the `realtime_audio` voice mode (default `gpt-realtime-2`). The Realtime settings below apply only to that mode.
- `OPENAI_REALTIME_REASONING_EFFORT` — reasoning effort for the voice model (default `medium`).
- `OPENAI_REALTIME_VOICE` — Realtime voice preset (default `marin`).
- `OPENAI_REALTIME_TRANSCRIPTION_MODEL` — model used for live transcription (default `gpt-4o-mini-transcribe`).
- `OPENAI_REALTIME_SECRET_TTL_SECONDS` — lifetime of the ephemeral client secret returned to the browser (default `600`).
- `REALTIME_DEBUG_LOG_ENABLED` / `REALTIME_DEBUG_LOG_PATH` — opt-in trace for troubleshooting realtime voice sessions. Off by default; transcripts are short but sensitive, so keep this disabled outside local debugging.
- `DEMO_MODE=true` — force the scripted fallback flow even when an API key is set. `realtime_audio` voice needs a key and `DEMO_MODE=false`; otherwise the voice button explains that voice isn't available and text chat keeps working.
- `CORS_ORIGINS` — allowed frontend origins.
- `PUBLIC_ORIGIN` — origin used to build the service links in SMS/email shares.
- `ADMIN_API_TOKEN` — shared secret required in the `X-Admin-Token` header for admin catalog writes. Empty (the default) refuses all writes.
- `TWILIO_*` — optional SMS sending.
- `SENDGRID_*` — optional email sending.

## Companion App: Austin Health Pulse

The [Austin Health Pulse](https://github.com/coa-chrisc/austin-health-pulse) life-expectancy calculator links residents into this guide's intake with the healthy-years scenario and the factors they want to work on:

```text
/intake?event=healthspan&focus=smoking_cessation,nutrition,physical_activity,mental_health
```

`event=healthspan` opens the "Adding Healthy Years" scenario, and each `focus` value is a catalog category slug that seeds the resident's needs before the first question.

## Demo Boundaries

This repository is intentionally a demo. It is not ready to handle real resident data without additional production work.

Important limitations:

- Service data is seeded demo data, not an authoritative live APH catalog.
- The server keeps no intake sessions; the browser tab holds the intake state, so there is nothing to recover if the tab is closed or "Start over" is used.
- The service catalog (87 services) is demo data and **unverified**: no service records a verifier or verification date yet (`npm run validate:catalog` reports this).
- No rate limiting or WAF. Default voice keeps audio on the device, but on-device recognition needs a recent Chromium browser with the language pack (other browsers get text only). The opt-in `realtime_audio` mode sends raw audio straight to OpenAI, where it cannot be redacted first. No OpenAI zero-data-retention agreement is in place.
- Admin authentication is simulated for demonstration.
- Analytics and reports use demo/generated data.
- SMS and email send paths stub successfully unless credentials are configured.
- Privacy, security, accessibility, legal, procurement, records retention, and data governance would need formal review before production use.
- See [SECURITY.md](SECURITY.md) for the full list of known gaps, and [docs/PRIVACY.md](docs/PRIVACY.md) for what data is collected, what is sent to OpenAI, and how personal identifiers are removed before they reach the model.

## Why This Matters For APH

This demo is meant to make the opportunity concrete. Instead of discussing AI in the abstract, commissioners and APH leaders can see a working example of:

- How AI can reduce navigation burden for residents.
- How tool calling keeps the AI connected to approved local data rather than free-form guessing.
- How service recommendations can be paired with transparent details and human-readable next steps.
- How staff dashboards can reveal demand, gaps, and equity patterns.
- How modern development tools can compress early prototyping timelines from months or years into days.

The larger point is not that this exact demo should be launched as-is. The point is that APH can champion practical, governed, resident-centered AI systems that help people find care sooner and help public health teams understand where support is most needed.

## Repository Structure

```text
backend/
  app/
    routers/       API routes for intake (stateless chat + realtime voice), services, and admin
    services/      AI loop, prompts and tools, PII redaction, grounding, client-state conversion, realtime voice, matching, catalog, plan, notifications
    middleware.py  256 KiB body limit for intake requests
    spa.py         Serves the built SPA in the container image
    data/          YAML catalog: categories, life events, crisis resources, and per-service files
    main.py        FastAPI entry point
  scripts/         Catalog utilities (validate_catalog.py, YAML migration, dedupe report)
  tests/           pytest suite, including shared PII fixtures
  requirements.txt Python dependencies
  .env.example     Environment template
frontend/
  src/
    components/    Shared UI components (chat, results, services, map, layout, common)
    pages/         Resident routes plus admin/* console
    hooks/         React hooks: useBrandConfig, useRealtimeVoiceSession (voice intake), auth stub
    lib/           API client, session.ts (client-held intake state), piiGuard.ts (client PII pre-flight)
    theme/         MUI theme built from the brand config
  package.json     Frontend dependencies and dev/build/preview scripts
config/            White-label brand config, brand and catalog JSON schemas, presets/
deploy/            AWS, Azure and GCP starter templates and deploy notes
Dockerfile         Single image: built SPA served by FastAPI
docker-compose.yml Local run of that image
SECURITY.md        Threat model, hardening, known gaps, Phase 2 roadmap
ARCHITECTURE.md   Components, data flow, module map, deployment modes
docs/              Vision, requirements, user stories, backend design, privacy, brand notes
AGENTS.md          Contributor guide for coding agents and maintainers
CLAUDE.md          Architecture and conventions for AI coding tools
```

## Verification

```bash
cd frontend
npm run build              # tsc -b && vite build
npm test                   # vitest: client PII guard against the shared fixtures
npm run validate:catalog   # catalog YAML vs config/services.schema.json (add -- --strict to fail on unverified entries)
```

```bash
cd backend
pip install -r requirements-dev.txt
python -m compileall app
python -m pytest
```

These are the baseline checks for the demo. The backend tests force the scripted flow, so they never call OpenAI. `npm run validate:catalog` currently passes with 0 errors and warns that all 87 services are unverified; `-- --strict` fails until staff record verification. See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request expectations.

## Container and white-label builds

```bash
docker compose up --build                  # builds the image and serves the app on http://localhost:8000 (scripted demo mode by default)
CITY_PRESET=bchc-demo-city docker compose up --build   # same, with another brand preset
CITY_PRESET=bchc-demo-city npm run build   # from frontend/: build the SPA with a preset
```

`CITY_PRESET` picks `config/presets/<name>.brand.json` at build time; an unknown name fails the build. With it unset, `config/brand.config.json` is used. Only branding and copy are configurable today: the model prompts, the catalog, crisis resources, and the admin demo data are Austin-specific. See [ARCHITECTURE.md](ARCHITECTURE.md) and [deploy/README.md](deploy/README.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE). You are free to use, modify, and redistribute this work with attribution and under the terms of the license.
