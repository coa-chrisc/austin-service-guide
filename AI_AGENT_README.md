# AI Coding Agent README

This document is for AI coding agents, automation assistants, and developers who want to understand, extend, or reuse the Austin Service Guide demo for another public agency or civic-service project.

The project is a working demonstration of a resident-facing service navigation portal for Austin Public Health (APH). It combines a React frontend, FastAPI backend, seeded service catalog, AI intake assistant with tool calling, service matching, maps, saved plans, sharing, and admin dashboards.

## What This Demo Does

The core user journey is:

1. A resident lands on the app and chooses a life event, searches services, opens the map, or starts intake.
2. The intake assistant asks short, plain-language questions.
3. The backend stores inferred profile facts in an in-memory session.
4. Matching logic ranks services by needs, household profile, language, cost, and location signals.
5. Results are shown as a prioritized plan, not just a directory.
6. The resident can inspect service details, use the map, call providers, get directions, print, share, or return to the saved plan.
7. Staff-facing admin pages demonstrate resident records, service management, analytics, demand maps, equity views, language access, eligibility rules, reports, audit logs, and staff management.

This is demo software. Do not treat it as production-ready for real resident data without privacy, security, governance, accessibility, authentication, logging, and data-retention review.

## Feature Map For Agents

### Resident Experience

- Landing and life-event pathways: `frontend/src/pages/Landing.tsx`
- Intake route and recovery prompt: `frontend/src/pages/Intake.tsx`
- Chat UI: `frontend/src/components/chat/ChatInterface.tsx`
- Chat bubbles and markdown rendering: `frontend/src/components/chat/ChatBubble.tsx`
- Results and saved plan actions: `frontend/src/pages/Results.tsx`
- Prioritized plan list: `frontend/src/components/results/PlanList.tsx`
- Top recommendation card: `frontend/src/components/results/StartHereHero.tsx`
- Service cards: `frontend/src/components/services/ServiceCard.tsx`
- Service detail page: `frontend/src/pages/ServiceDetail.tsx`
- Service detail content: `frontend/src/components/services/ServiceDetailCard.tsx`
- Directory search/filter: `frontend/src/pages/ServiceDirectory.tsx`
- Map page: `frontend/src/pages/MapView.tsx`
- Leaflet map component: `frontend/src/components/map/ServiceMap.tsx`
- Language selector: `frontend/src/components/common/LanguageSelector.tsx`
- Saved active plan helper: `frontend/src/lib/session.ts`
- Native share helper: `frontend/src/lib/share.ts`

### Backend API

- FastAPI entry point and router registration: `backend/app/main.py`
- Intake endpoints: `backend/app/routers/intake.py`
- Service and map endpoints: `backend/app/routers/services.py`
- Admin demo endpoints: `backend/app/routers/admin.py`
- API models: `backend/app/models.py`
- Runtime settings: `backend/app/config.py`

### Domain Logic

- AI intake, tool calling, scripted fallback, crisis response: `backend/app/services/ai.py`
- Service matching, risk flags, benefits estimates, application order: `backend/app/services/matching.py`
- In-memory service catalog queries and CRUD helpers: `backend/app/services/catalog.py`
- Seed service, resident, staff, analytics, reports data: `backend/app/services/seed_data.py`
- Open-now parsing and next-open labels: `backend/app/services/hours.py`
- SMS/email stubs and integrations: `backend/app/services/notify.py`

### Admin Console

- Admin layout/navigation: `frontend/src/components/layout/AdminLayout.tsx`
- Dashboard: `frontend/src/pages/admin/AdminDashboard.tsx`
- Residents: `frontend/src/pages/admin/AdminResidents.tsx`
- Resident detail: `frontend/src/pages/admin/AdminResidentDetail.tsx`
- Services list/editor: `frontend/src/pages/admin/AdminServices.tsx`, `AdminServiceEdit.tsx`
- Analytics: `frontend/src/pages/admin/AdminAnalytics.tsx`
- Equity: `frontend/src/pages/admin/AdminEquity.tsx`
- Demand map: `frontend/src/pages/admin/AdminDemandMap.tsx`
- Language access: `frontend/src/pages/admin/AdminLanguages.tsx`
- Eligibility rules: `frontend/src/pages/admin/AdminEligibility.tsx`
- Reports: `frontend/src/pages/admin/AdminReports.tsx`
- Audit log: `frontend/src/pages/admin/AdminAuditLog.tsx`
- Staff: `frontend/src/pages/admin/AdminStaff.tsx`

## AI Tool-Calling Architecture

The live intake path uses the OpenAI Responses API in `backend/app/services/ai.py`. The model receives system instructions plus a tool list, then runs a loop:

1. Append the resident message to `session.responses_input`.
2. Call the model with the current context and tool schemas.
3. If the model emits tool calls, execute them locally.
4. Append tool outputs back into the model context.
5. Repeat until the model emits final text or hits the iteration cap.

Available tools:

| Tool | Backend behavior |
| --- | --- |
| `search_services` | Calls catalog search with optional category and ZIP filters. |
| `get_service_details` | Returns full service detail by slug. |
| `get_crisis_resources` | Returns urgent/crisis resources. |
| `extract_profile` | Updates the resident profile stored on the session. |
| `find_matching_services` | Runs the matching engine on the current profile. |
| `set_language` | Changes session language and profile language fields. |
| `complete_intake` | Computes matches, risks, benefits, and marks the intake complete. |

Agents can reuse this pattern for other domains by replacing the tool schemas, local dispatch functions, seed data, and matching logic while keeping the loop structure.

## High-Value Reuse Patterns

### 1. AI As Navigator, Not Database

The model does not own source-of-truth data. It calls local tools. This is reusable for:

- Public benefits navigation
- Housing resource matching
- Workforce program matching
- Emergency preparedness referrals
- Environmental health complaint routing
- Library/social service kiosk tools
- Veteran or senior service navigation

Adapt by changing `seed_data.py`, service categories, tool descriptions, and matching rules.

### 2. No-Account-First Flow

Residents can complete intake without signing up. This pattern is useful for agencies where account creation is a barrier. Reuse `frontend/src/lib/session.ts` and the `/results/:sessionId` model, but replace in-memory sessions with a governed store before production.

### 3. Prioritized Plan Instead Of Long List

`recommend_application_order` in `matching.py` turns matches into a ranked action plan. This is more humane than dumping 20 links on a resident. For another agency, rewrite category priorities and reason text around that agency's mission.

### 4. Plain-Language Risk Framing

Risk flags are displayed as "Areas Where We Can Help," not diagnoses. Keep this principle when adapting to sensitive domains. Risk detection should suggest support, not make eligibility or clinical determinations.

### 5. Demo-Friendly Fallbacks

The app still runs without live OpenAI, Twilio, or SendGrid. This is useful for public demos where network, keys, or vendor services may fail. Maintain fallback paths for commissioner meetings, hackathons, and procurement conversations.

## Customizing For Another Agency

Use this checklist when adapting the demo.

### Branding And Content

- Replace APH language in `README.md`, `Landing.tsx`, and `brandTheme.ts`.
- Update logo assets in `frontend/public/`.
- Adjust tone: public health, housing, workforce, emergency management, library services, or general city services each need different copy.
- Review all crisis and emergency language with subject-matter experts.

### Service Catalog

- Replace `CATEGORIES`, `LIFE_EVENTS`, `SERVICES`, and crisis resources in `backend/app/services/seed_data.py`.
- Keep stable `slug` values for URLs.
- Add `hours` and `hours_verified` if open-now filtering matters.
- Add latitude/longitude for map display.
- Keep category slugs consistent; the import-time guard catches unknown category references.
- Run `python backend/scripts/dedupe_catalog.py` after large catalog imports to flag likely duplicate services.

### Matching Logic

Customize `backend/app/services/matching.py`:

- `_NEED_TO_CATEGORIES`: maps resident words to categories.
- `_score_service`: ranks services.
- `assess_risks`: creates prevention-oriented risk flags.
- `calculate_benefits`: estimates value.
- `_SEQUENCE_PRIORITY` and `_SEQUENCE_REASONS`: order the action plan.

For production, document every matching rule and make it reviewable by program owners.

### AI Instructions And Tools

Customize in `backend/app/services/ai.py`:

- `_build_instructions`: role, tone, safety, and agency scope.
- `_TOOL_SCHEMAS`: tool names and parameters exposed to the model.
- `_dispatch_tool`: local tool execution.
- `_needs_from_life_event`: landing-page pathway seeding.
- `_check_crisis` and `_crisis_response`: urgent safety handling.
- `_DEMO_STEPS`: offline scripted intake.

When adapting tools, keep outputs structured and compact. The model should receive enough information to help, not entire databases.

### Frontend Routes

Common agency customizations:

- Change life events on the landing page.
- Add category-specific icons/colors in `ServiceMap.tsx`.
- Adjust plan display caps in `PlanList.tsx`.
- Add or remove admin sections in `AdminLayout.tsx` and `App.tsx`.
- Replace generated demo analytics with real API calls.

## Production Hardening TODOs

Before real deployment, agents should not skip these:

- Replace in-memory sessions with persistent storage.
- Add real authentication and authorization for admin routes.
- Define data classification, consent, retention, audit, and deletion policies.
- Add rate limiting and abuse protection.
- Add structured logging without exposing sensitive resident text.
- Add test coverage for matching, crisis detection, intake completion, and catalog CRUD.
- Validate all AI tool outputs and user-visible recommendations.
- Add accessibility audits and keyboard/screen-reader testing.
- Add human review workflows for catalog updates.
- Add monitoring for model errors, fallback rates, and tool-call failures.
- Confirm whether AI vendors, prompts, logs, and retention settings meet agency requirements.

## Development Commands

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run build
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Baseline checks:

```bash
npm run build
python -m compileall backend/app
```

Run the dedupe helper:

```bash
python backend/scripts/dedupe_catalog.py
```

## Agent Working Rules

- Preserve the demo framing unless the user explicitly wants production conversion.
- Do not commit real credentials, resident records, or private agency data.
- Keep service content plain-language and resident-centered.
- Keep AI recommendations explainable and tied to local catalog/tool data.
- When changing matching behavior, include targeted checks or test cases.
- When changing UI flows, manually inspect mobile-sized layouts if possible.
- When adding agency-specific content, separate demo placeholders from authoritative source data.
- Prefer small, reviewable commits with conventional messages such as `feat(intake): ...`, `fix(map): ...`, or `docs: ...`.

## Suggested Extension Projects

Good next steps for future agents:

- Add backend tests for `matching.py`, `hours.py`, and intake crisis handling.
- Add persistent session storage with explicit consent and deletion.
- Build a catalog import pipeline from CSV or Airtable.
- Add map radius filters and ZIP-code centering.
- Add an authenticated staff workflow and role enforcement.
- Add multilingual copy review and language-specific service filtering.
- Add exportable commissioner demo scripts and screenshots.
- Add a privacy and governance checklist for production evaluation.

