# Austin Service Guide

**A working demo of how Austin Public Health could use modern AI-assisted development, service design, and open web tools to help residents find the right public health and social services faster.**

This project is a demonstration, not a production system. It was built to show what is now possible in days instead of months or years: a resident-facing service guide, an AI intake assistant with tool calling, a searchable service catalog, an interactive map, shareable service plans, and an admin analytics console.

The goal is to support conversations with Austin Public Health (APH), public health commissioners, civic technology leaders, and community partners about how AI tools can improve service navigation while keeping humans, transparency, and public accountability at the center.

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
- **Tool-calling AI workflow** that searches services, extracts profile information, finds matches, changes language, retrieves crisis resources, and completes the intake.
- **No-account-first resident experience** so a resident can get recommendations without signing up.
- **Life-event entry points** such as job loss, eviction, food need, healthcare need, having a baby, veteran benefits, senior help, legal trouble, and child care.
- **Personalized service plan** that prioritizes the first few actions instead of overwhelming residents with a long directory.
- **Searchable service directory** with categories, highlighted matches, open-now filtering, and helpful suggestions when no exact result is found.
- **Interactive map** with categorized service pins, list view, category filters, plan-only mode, "near me" distance support, and service popups.
- **Service detail pages** with eligibility, documents needed, locations, hours, contact information, directions, language support, accessibility features, and sharing.
- **Risk and prevention framing** that surfaces urgent needs in calm, plain language.
- **Crisis pathway** for suicidal ideation, domestic violence, or immediate danger, with 988, 911, Integral Care, and SAFE Alliance-style guidance.
- **Share and save options** including native share, text/email fallback, print/PDF support, QR codes, and a saved "View my plan" path.
- **Admin console** for resident records, services, analytics, demand maps, equity views, language access, eligibility rules, reports, audit logs, and staff.
- **Demo notification stubs** for SMS and email, with optional Twilio and SendGrid integration points.

## How The AI Chatbot Works

The chatbot is not just a keyword bot. In live mode, the backend uses the OpenAI Responses API with a small tool loop. The model can call local backend functions, receive structured results, and continue the conversation with that context.

Available AI tools in the demo:

| Tool | What it does |
| --- | --- |
| `search_services` | Searches the local service catalog by keyword, category, and ZIP code. |
| `get_service_details` | Retrieves full detail for one service by slug. |
| `get_crisis_resources` | Returns crisis and emergency resources for urgent situations. |
| `extract_profile` | Stores relevant intake facts such as household size, ZIP code, housing situation, income range, insurance status, and immediate needs. |
| `find_matching_services` | Runs the matching engine against the resident profile. |
| `set_language` | Switches the conversation language when the resident asks or writes in another language. |
| `complete_intake` | Finalizes the intake, runs matching, assesses risk flags, estimates benefits, and marks the session complete. |

If no API key is configured, the app still works in demo mode using a scripted guided intake. That makes it easier to present live without depending on external services.

## What The Resident Sees

The resident experience is designed to feel like a helpful navigator rather than a government form.

1. **Start with a need or life event.** The resident can browse the landing page, choose a life-event card, search the directory, or open the intake.
2. **Answer a short chat intake.** The assistant asks about household size, ZIP code, housing, work, income, insurance, and immediate needs.
3. **Get a plan.** Results are organized into a practical starting sequence, with the most important service first and a short list of next actions.
4. **Explore details.** Each service includes eligibility, cost, documents, phone, website, location, directions, hours, language support, and accessibility notes.
5. **Use the map.** Residents can see where services are located, filter categories, view only their plan services, and find nearby options.
6. **Save or share.** The resident can send their plan to themselves, print it, or return through the saved plan link.

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

The backend includes a seeded Austin-area service catalog with 75 demo services across categories such as:

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

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| UI | Material UI, MUI Icons |
| Routing | React Router |
| Mapping | Leaflet and React Leaflet |
| Backend | FastAPI, Pydantic |
| AI | OpenAI Responses API with tool calling; scripted fallback mode |
| HTTP | Fetch API on frontend, `httpx` for outbound backend integrations |
| Demo data | In-memory Python seed catalog |
| Optional notifications | Twilio SMS and SendGrid email stubs/integration points |

## Running Locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000` by default.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

### Optional Environment

Copy `backend/.env.example` to `backend/.env` to configure live services.

```bash
cp backend/.env.example backend/.env
```

Useful settings:

- `OPENAI_API_KEY`: enables live AI intake.
- `OPENAI_MODEL`: model used by the Responses API.
- `DEMO_MODE=true`: forces the scripted fallback flow.
- `CORS_ORIGINS`: allowed frontend origins.
- `PUBLIC_ORIGIN`: origin used for share links.
- `TWILIO_*`: optional SMS sending.
- `SENDGRID_*`: optional email sending.

## Demo Boundaries

This repository is intentionally a demo. It is not ready to handle real resident data without additional production work.

Important limitations:

- Service data is seeded demo data, not an authoritative live APH catalog.
- Intake sessions are stored in memory and reset when the backend restarts.
- Admin authentication is simulated for demonstration.
- Analytics and reports use demo/generated data.
- SMS and email send paths stub successfully unless credentials are configured.
- Privacy, security, accessibility, legal, procurement, records retention, and data governance would need formal review before production use.

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
    routers/       API routes for intake, services, and admin
    services/      AI, matching, catalog, hours, notification, and seed data logic
    main.py        FastAPI entry point
frontend/
  src/
    components/    Shared UI components
    pages/         Resident and admin routes
    lib/           API client and utilities
    theme/         APH-inspired theme setup
AGENTS.md          Contributor guide for coding agents and maintainers
```

## Verification

```bash
cd frontend
npm run build
```

```bash
python -m compileall backend/app
```

These are the current baseline checks for the demo.

