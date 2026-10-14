# Austin Service Guide — Requirements Document

**Project:** Austin Service Guide
**Date:** April 23, 2026
**Version:** 1.0
**Status:** Draft

---

## Table of Contents

1. [Feature Inventory](#1-feature-inventory)
2. [Resident Portal — Detailed Requirements](#2-resident-portal--detailed-requirements)
3. [Administrative Console — Detailed Requirements](#3-administrative-console--detailed-requirements)
4. [Technical Requirements](#4-technical-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)

---

## 1. Feature Inventory

### 1.1 Resident Portal Features

| #    | Feature                            | Priority | Description                                                                                                     |
| ---- | ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| F-01 | **AI-Powered Intake Conversation** | P0       | Conversational, adaptive questionnaire that gathers demographic and situational data to match services          |
| F-02 | **Personalized Service Directory** | P0       | Dynamically generated list of eligible services organized by life need category                                 |
| F-03 | **Interactive Service Map**        | P0       | Map showing service locations with details, hours, transit routes, and directions                               |
| F-04 | **Risk Assessment & Prevention**   | P0       | Proactive identification of risk factors with prevention-oriented service recommendations                       |
| F-05 | **Life Event Pathways**            | P1       | Pre-built service bundles triggered by life events (new baby, job loss, new to Austin, etc.)                    |
| F-06 | **No-Account Screening**           | P0       | Full intake and results without requiring account creation                                                      |
| F-07 | **Account & Profile Management**   | P1       | Optional account for saving results, tracking applications, and receiving notifications                         |
| F-08 | **Family/Household Mode**          | P1       | Single intake covering multiple household members with individual eligibility mapping                           |
| F-09 | **Multilingual Support**           | P0       | AI-powered real-time translation for all languages; in-chat language switching via the AI assistant             |
| F-10 | **Benefits Calculator**            | P1       | Estimated dollar value of combined eligible benefits                                                            |
| F-11 | **Application Launchpad**          | P2       | Direct links to application portals with pre-filled data where possible                                         |
| F-12 | **Service Detail Pages**           | P0       | Rich detail pages for each service: eligibility criteria, documents needed, hours, location, contact, reviews   |
| F-13 | **Save & Share Results**           | P1       | Download, email, or text a summary of matched services                                                          |
| F-14 | **Accessibility Mode**             | P0       | WCAG 2.1 AA compliant; high-contrast mode, screen reader optimization, keyboard navigation                      |
| F-15 | **Crisis/Emergency Pathway**       | P0       | Fast-track pathway for residents in immediate crisis (homelessness, domestic violence, mental health emergency) |
| F-16 | **Service Comparison**             | P2       | Side-by-side comparison of similar services (e.g., two food banks) by distance, hours, eligibility              |
| F-17 | **Community Reviews & Tips**       | P3       | Resident-submitted ratings, tips, and experiences for service locations                                         |
| F-18 | **Notification Center**            | P2       | Alerts for benefit renewals, new services, appointment reminders (for account holders)                          |
| F-19 | **Chat Follow-Up**                 | P1       | Return to the AI navigator for follow-up questions after viewing results                                        |
| F-20 | **Transit Integration**            | P2       | Capital Metro route overlay showing how to reach service locations via public transit                           |
| F-21 | **Document Checklist**             | P1       | Per-service list of documents needed for application/enrollment                                                 |
| F-22 | **Kiosk Mode**                     | P2       | Simplified, touch-optimized interface for library/community center kiosks                                       |
| F-23 | **SMS-Only Pathway**               | P3       | Text-based intake and results for residents without internet access                                             |
| F-24 | **Guided Onboarding Tour**         | P1       | First-visit walkthrough explaining how the portal works                                                         |

### 1.2 Administrative Console Features

| #    | Feature                          | Priority | Description                                                                              |
| ---- | -------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| A-01 | **Resident Dashboard**           | P0       | Overview of all registered residents with search, filter, and sort                       |
| A-02 | **Service Interest Tracker**     | P0       | View which services each resident expressed interest in or was matched to                |
| A-03 | **Demographics Analytics**       | P0       | Aggregate demographic breakdown of portal users with charts and filters                  |
| A-04 | **Service Demand Heatmap**       | P1       | Geographic and categorical visualization of service demand                               |
| A-05 | **Equity Dashboard**             | P1       | Track utilization by demographic group; identify underserved populations and access gaps |
| A-06 | **Service Directory Management** | P0       | CRUD interface for managing the service catalog (add, edit, deactivate services)         |
| A-07 | **Eligibility Rules Engine**     | P1       | Admin-editable rules that determine which residents qualify for which services           |
| A-08 | **Intake Flow Builder**          | P2       | Visual editor for modifying intake questions and branching logic                         |
| A-09 | **Reporting & Export**           | P1       | Generate and export reports on usage, demographics, service demand, and outcomes         |
| A-10 | **Staff Role Management**        | P0       | Role-based access control (admin, manager, viewer, service provider)                     |
| A-11 | **Audit Log**                    | P1       | Complete log of admin actions (who viewed/edited what, when)                             |
| A-12 | **Notification Manager**         | P2       | Create and send targeted notifications to resident segments                              |
| A-13 | **Service Gap Alerts**           | P2       | Automated alerts when demand for a service category significantly exceeds supply         |
| A-14 | **Resident Communication**       | P2       | Secure messaging between staff and residents (opt-in)                                    |
| A-15 | **Data Export & API**            | P1       | Structured data export and API endpoints for integration with other city systems         |

---

## 2. Resident Portal — Detailed Requirements

### 2.1 AI-Powered Intake Conversation (F-01)

The intake is the core experience. It must feel like a helpful conversation, not a government form.

**Functional Requirements:**

- R-01.01: The intake begins with a warm, plain-language greeting that explains what the portal does and what the resident will get
- R-01.02: Questions are presented one at a time (or in small groups) in a chat-style interface
- R-01.03: The AI adapts its next question based on prior answers (branching logic driven by Azure OpenAI)
- R-01.04: The intake covers these domains (in adaptive order):
  - Basic demographics (age range, household size, zip code)
  - Housing situation (renting, owning, experiencing homelessness, at risk)
  - Employment status (employed, unemployed, underemployed, retired, student, disabled)
  - Income range (brackets, not exact amounts)
  - Health insurance status
  - Household composition (children, seniors, veterans, persons with disabilities)
  - Immediate needs (food, housing, healthcare, employment, childcare, utilities, legal, transportation, education)
  - Languages spoken
  - Veteran status
  - Immigration-related needs (presented sensitively; optional)
  - Current crisis indicators (housing loss, domestic violence, mental health emergency, food emergency)
- R-01.05: Crisis indicators trigger an immediate Crisis Pathway (F-15) interrupting the normal flow
- R-01.06: Each question includes a "skip" or "prefer not to answer" option — skipped questions reduce match precision but never block the flow
- R-01.07: The AI provides brief, empathetic context for why each question matters ("This helps us find healthcare options for your family")
- R-01.08: The intake can be completed in under 5 minutes for a typical resident
- R-01.09: A progress indicator shows approximate completion percentage
- R-01.10: Residents can go back to change previous answers
- R-01.11: The intake supports any language — the AI assistant detects the resident's language automatically or switches on request mid-conversation
- R-01.12: All intake data is processed via Azure OpenAI (GPT-5.4-mini) for intelligent branching, natural language understanding, and real-time translation
- R-01.13: No intake data is stored unless the resident explicitly creates an account
- R-01.14: The AI must never provide medical, legal, or financial advice — only connect to appropriate services

**UX Requirements:**

- R-01.15: Chat-style interface with typed messages appearing conversationally (not a traditional form)
- R-01.16: Support both free-text responses and quick-select buttons for common answers
- R-01.17: Typing indicators and natural pacing to feel conversational, not robotic
- R-01.18: Mobile-first responsive design — the primary use case is a phone
- R-01.19: The conversation is visually warm and approachable — use the brand's accent colors, friendly tone, rounded UI elements

### 2.2 Personalized Service Directory (F-02)

**Functional Requirements:**

- R-02.01: After intake completion, display a categorized list of matched services
- R-02.02: Services are grouped by life-need category:
  - Healthcare & Mental Health
  - Housing & Shelter
  - Food & Nutrition
  - Employment & Job Training
  - Childcare & Family Services
  - Senior Services
  - Veterans Services
  - Utility Assistance
  - Transportation
  - Legal Aid
  - Disability Services
  - Immigration Services
  - Education & Literacy
  - Emergency Assistance
- R-02.03: Each category shows a count of matched services and a brief summary
- R-02.04: Within each category, services are ranked by relevance (match strength to resident's profile)
- R-02.05: Each service card shows: name, provider, one-line description, eligibility match confidence (high/medium/possible), distance from resident's zip code, and a "Learn More" action
- R-02.06: A summary banner at the top shows total programs matched and estimated combined benefit value (F-10)
- R-02.07: The AI provides a brief narrative summary explaining why these services were recommended
- R-02.08: Residents can filter results by category, distance, eligibility confidence, and open-now status
- R-02.09: A "Discover More" section shows services the resident may be eligible for if their situation changes (e.g., "If you become unemployed, you'd also qualify for...")
- R-02.10: Each service links to a full Service Detail Page (F-12)

### 2.3 Interactive Service Map (F-03)

**Functional Requirements:**

- R-03.01: Full-screen map view showing all matched service locations as categorized pins/markers
- R-03.02: Map uses color-coded markers by service category with a visible legend
- R-03.03: Clicking a marker shows a popup card with service name, address, hours, phone, and "Get Directions" / "View Details" actions
- R-03.04: Map centers on the resident's provided zip code
- R-03.05: Map supports clustering for dense areas and zoom-based reveal
- R-03.06: Filter controls allow toggling service categories on/off
- R-03.07: "Near Me" button re-centers map on current location (with permission)
- R-03.08: Distance radius filter (1 mile, 5 miles, 10 miles, 25 miles, all)
- R-03.09: List view toggle showing the same services in a sortable list format
- R-03.10: Map integrates with transit routing (Capital Metro routes) where feasible
- R-03.11: Map tiles use an accessible, high-contrast style option
- R-03.12: Map implementation uses an open-source mapping library (Mapbox GL JS or Leaflet) — no Google Maps dependency

### 2.4 Risk Assessment & Prevention (F-04)

**Functional Requirements:**

- R-04.01: Based on intake responses, the system identifies risk factors using a rules engine augmented by AI analysis
- R-04.02: Risk categories include:
  - Housing instability (at risk of homelessness)
  - Food insecurity
  - Healthcare gap (uninsured or underinsured)
  - Mental health risk (isolation, caregiving burden, reported distress)
  - Financial crisis (income below poverty line for household size)
  - Childcare gap (working parent without childcare)
  - Utility disconnection risk
  - Legal vulnerability (tenant rights, immigration status)
- R-04.03: Risk factors are presented as a gentle, non-alarming "Areas Where We Can Help" section — never clinical or diagnostic language
- R-04.04: Each identified risk links directly to prevention-oriented services
- R-04.05: Risk scoring is transparent — residents can see which answers contributed to each risk flag
- R-04.06: The system explains what each risk means in plain language and why early intervention matters
- R-04.07: Risk assessment is never stored without explicit consent (account creation)
- R-04.08: The risk engine does not make determinations about eligibility — it identifies areas of potential need

### 2.5 Life Event Pathways (F-05)

**Functional Requirements:**

- R-05.01: The portal offers pre-built "Life Event" pathways as an alternative to the full intake
- R-05.02: Life events include:
  - "I just moved to Austin"
  - "I just had a baby"
  - "I lost my job"
  - "I'm about to retire"
  - "I'm a veteran transitioning to civilian life"
  - "I'm experiencing a housing crisis"
  - "I need help caring for an aging parent"
  - "I'm a young adult on my own for the first time"
  - "I'm going through a divorce/separation"
  - "A family member passed away"
  - "I have a new disability or health condition"
  - "I'm leaving an unsafe situation"
- R-05.03: Each pathway presents a curated, shorter set of intake questions relevant to that life event
- R-05.04: Each pathway produces a focused service bundle plus the option to complete the full intake for more matches
- R-05.05: Life event pathways are displayed as visual cards on the landing page with icons and brief descriptions

### 2.6 Crisis/Emergency Pathway (F-15)

**Functional Requirements:**

- R-15.01: If the intake detects a crisis indicator (suicidal ideation, domestic violence, imminent homelessness, food emergency), immediately surface emergency resources
- R-15.02: Crisis resources are presented with prominent click-to-call buttons and addresses
- R-15.03: Key crisis contacts always visible:
  - 988 Suicide & Crisis Lifeline
  - 911 for immediate danger
  - SAFE Alliance hotline (domestic violence): 512-267-SAFE
  - Integral Care Crisis Line: 512-472-HELP
  - Austin 211 (social services hotline)
  - Salvation Army / Red Cross emergency assistance
- R-15.04: Crisis pathway does not require completing the intake — it interrupts immediately
- R-15.05: After crisis resources are shown, the resident can choose to continue the intake or exit
- R-15.06: Crisis detection runs on the client side using keyword matching and AI classification — no server round-trip delay

### 2.7 Service Detail Pages (F-12)

**Functional Requirements:**

- R-12.01: Each service has a dedicated detail page with:
  - Service name and provider organization
  - Full description in plain language
  - Eligibility criteria (who qualifies)
  - Required documents checklist (F-21)
  - How to apply (online link, phone number, walk-in info)
  - Location(s) with embedded map
  - Hours of operation (with holiday schedule where available)
  - Contact information (phone, email, website)
  - Languages supported
  - Accessibility features
  - Cost (free, sliding scale, fees)
  - Category tags
- R-12.02: "Save to My List" button (for account holders)
- R-12.03: "Share" button (email, text, or copy link)
- R-12.04: "Get Directions" button linking to mapping app
- R-12.05: Related services section ("People who viewed this also looked at...")
- R-12.06: Last-verified date showing when service info was last confirmed accurate

### 2.8 Multilingual Support (F-09)

Austin's linguistic landscape demands robust multilingual support. Per U.S. Census ACS data, ~28% of Austin metro residents speak a language other than English at home. The City of Austin's Language Access Program identifies 12 threshold languages. Rather than maintaining static translation files, all translation is handled dynamically by the generative AI layer (GPT-5.4-mini on Azure OpenAI), which natively supports 100+ languages. The AI chat assistant serves as the primary multilingual interface — it detects language, switches on request, and searches/presents the service directory in the resident's language in real time.

**Key Austin Language Communities:**

| Rank | Language                                                  | Approx. Austin Speakers |
| ---- | --------------------------------------------------------- | ----------------------- |
| 1    | Spanish                                                   | ~200,236                |
| 2    | Chinese (Simplified)                                      | ~11,557                 |
| 3    | Hindi                                                     | ~7,921                  |
| 4    | Arabic                                                    | ~7,122                  |
| 5    | Vietnamese                                                | ~5,307                  |
| 6    | French                                                    | ~5,195                  |
| 7    | Korean                                                    | ~4,596                  |
| 8+   | Telugu, Nepali, Tamil, Tagalog, Burmese, Urdu, and others | ~25,000+ combined       |

**Functional Requirements:**

- R-09.01: All translation is performed by Azure OpenAI GPT-5.4-mini at runtime — no static translation files are maintained. The AI translates UI chrome, service descriptions, intake questions, and conversational responses on the fly.
- R-09.02: Language selector in the header offers quick-switch to Austin's top 7 non-English languages (displayed in native script: "Español," "中文," "हिन्दी," "العربية," "Tiếng Việt," "Français," "한국어") plus an "Other language" option that accepts any language name
- R-09.03: The AI chat assistant supports in-conversation language switching — a resident can say "habla español" or "switch to Vietnamese" at any point and the assistant seamlessly continues in that language
- R-09.04: The AI assistant has tool-use capabilities for multilingual service directory search — it translates the resident's query into English for database lookup, retrieves matching services, and presents results back in the resident's language
- R-09.05: Service directory search tools handle cross-lingual matching: a resident asking "¿Dónde puedo encontrar comida gratis?" triggers the same search as "Where can I find free food?" — the AI translates intent, queries the English-canonical service catalog, and renders results in Spanish
- R-09.06: RTL (right-to-left) layout fully supported for Arabic — all components, navigation, and map controls mirror correctly when Arabic is the active language
- R-09.07: Language preference is auto-detected from browser `Accept-Language` header on first visit; the AI greets the resident in their detected language with an option to switch
- R-09.08: The i18n framework handles locale-specific formatting (dates, numbers, currency, pluralization) based on the active language
- R-09.09: All downloadable/shareable content (PDF results, text/email summaries) is generated in the resident's active language via AI translation at export time
- R-09.10: Crisis/emergency content (F-15) is pre-cached in Austin's top 7 non-English languages for instant display — no AI round-trip delay for life-safety information
- R-09.11: The AI assistant's system prompt includes explicit instructions for culturally appropriate communication — not just literal translation, but tone and phrasing adapted to the target language's conventions
- R-09.12: Admin console displays analytics on language usage: which languages residents are using, language switching patterns, and most common non-English queries

### 2.9 Family/Household Mode (F-08)

**Functional Requirements:**

- R-08.01: During intake, residents can indicate they're seeking services for their household, not just themselves
- R-08.02: Household members can be added with minimal info: relationship, age range, and key attributes (veteran, disability, student, etc.)
- R-08.03: The service directory shows results for each household member, with clear labels indicating who each service is for
- R-08.04: A household summary view shows all services across all members in one consolidated view
- R-08.05: Benefits calculator (F-10) shows combined household benefit value

---

## 3. Administrative Console — Detailed Requirements

### 3.1 Resident Dashboard (A-01)

**Functional Requirements:**

- R-A01.01: Searchable, sortable, paginated table of all registered residents
- R-A01.02: Columns: name (or anonymous ID), signup date, zip code, household size, services interested in (count), last active date
- R-A01.03: Click-through to individual resident detail view showing full profile and matched services
- R-A01.04: Quick filters: date range, zip code, service category interest, household size, language preference
- R-A01.05: Bulk export to CSV/Excel
- R-A01.06: Anonymous mode for residents who used the portal without creating an account — these appear as aggregate statistics only, never individual records

### 3.2 Service Interest Tracker (A-02)

**Functional Requirements:**

- R-A02.01: For each registered resident, show the list of services they were matched to and which ones they clicked on, saved, or indicated interest in
- R-A02.02: Aggregate view showing service interest rankings across all residents
- R-A02.03: Trend charts showing interest patterns over time
- R-A02.04: Ability to filter by service category, time period, and demographic segment

### 3.3 Demographics Analytics (A-03)

**Functional Requirements:**

- R-A03.01: Dashboard cards showing aggregate demographic breakdowns:
  - Age distribution
  - Household size distribution
  - Zip code distribution (with map visualization)
  - Language preference
  - Employment status
  - Housing situation
  - Insurance status
  - Veteran status
- R-A03.02: All charts are interactive — clicking a segment filters the resident table
- R-A03.03: Comparison view: portal users vs. Austin census demographics (to identify over/underrepresentation)
- R-A03.04: Time-range selector for all analytics views
- R-A03.05: All demographic data is aggregated — individual-level demographic data is only visible to authorized roles

### 3.4 Equity Dashboard (A-05)

**Functional Requirements:**

- R-A05.01: Visualization of portal usage by race/ethnicity, income bracket, zip code, language, and age group
- R-A05.02: Gap analysis: highlight demographic groups that are underrepresented relative to Austin's population
- R-A05.03: Geographic equity map: overlay portal usage density against census tract demographics and known service deserts
- R-A05.04: Trend tracking: is equity improving or worsening over time?
- R-A05.05: Alignment with Austin's Equity Assessment Tool framework — use the same equity indicators where applicable

### 3.5 Service Directory Management (A-06)

**Functional Requirements:**

- R-A06.01: Full CRUD interface for managing the service catalog
- R-A06.02: Service fields: name, provider, description (English canonical — AI translates at runtime), eligibility criteria, locations (multiple), hours, contact info, documents required, cost, category tags, accessibility features, languages supported, status (active/inactive), last verified date
- R-A06.03: Bulk import via CSV/JSON for initial data load
- R-A06.04: Service verification workflow: flag services for re-verification on a configurable schedule
- R-A06.05: Location geocoding: auto-geocode addresses for map placement
- R-A06.06: Service deactivation (soft delete) preserves history while removing from resident-facing results
- R-A06.07: Version history for each service record

### 3.6 Staff Role Management (A-10)

**Functional Requirements:**

- R-A10.01: Role-based access control with at least four roles:
  - **Super Admin** — full access, user management, system configuration
  - **Admin** — service management, resident data access, analytics
  - **Manager** — read-only resident data, analytics, service management
  - **Viewer** — analytics dashboards only, no individual resident data
- R-A10.02: Staff accounts managed through Azure AD / Entra ID integration
- R-A10.03: Audit log (A-11) captures all staff actions with timestamps and user identification

---

## 4. Technical Requirements

### 4.1 Architecture

- T-01: **Frontend:** React 18+ with TypeScript, Material UI v7, Vite build tooling (per civic-ai-starter template)
- T-02: **Backend:** FastAPI (Python 3.11+) with Pydantic validation (per civic-ai-starter template)
- T-03: **AI Engine:** Azure OpenAI — GPT-5.4-mini as the primary model for all AI operations (intake conversation, service matching, translation, risk assessment); text-embedding-ada-002 for semantic vector search. This is a demonstration application showcasing Azure OpenAI capabilities.
- T-04: **Database:** Azure Database for PostgreSQL — Flexible Server with Row-Level Security for data isolation
- T-05: **Authentication:** Azure AD B2C for resident accounts (email/password + social login); Azure AD / Entra ID for staff
- T-06: **Mapping:** Mapbox GL JS or Leaflet with OpenStreetMap tiles
- T-07: **Hosting:** Azure Container Apps (per civic-ai-starter infrastructure templates)
- T-08: **CI/CD:** GitHub Actions deploying to Azure (per civic-ai-starter workflow)
- T-09: **Containerization:** Docker with multi-stage builds (per civic-ai-starter Dockerfile)

### 4.2 AI & Data Pipeline

- T-10: Service catalog stored in PostgreSQL with vector embeddings for semantic matching
- T-11: Intake responses processed through a structured prompt pipeline:
  1. Intake conversation management (GPT-5.4-mini with system prompt + conversation history)
  2. Profile extraction (structured JSON extraction from conversation)
  3. Eligibility matching (rules engine + AI-augmented matching against service catalog)
  4. Risk assessment (rules engine + AI classification)
  5. Results ranking and narrative generation
- T-12: AI responses use RAG (Retrieval-Augmented Generation) grounded in the service catalog — the AI never invents services
- T-13: All AI interactions include source attribution ("This recommendation is based on [Service Name] eligibility criteria")
- T-14: AI model responses are logged for quality monitoring (stripped of PII)
- T-14a: The AI assistant is configured with tool-use (function calling) capabilities for:
  - `search_services` — queries the service catalog with cross-lingual intent matching (translates non-English queries to English for lookup, returns results in the resident's language)
  - `get_service_details` — retrieves full detail for a specific service and presents it in the active language
  - `search_by_location` — finds services near a zip code or address with distance calculations
  - `check_eligibility` — evaluates a resident's profile against a service's eligibility rules
  - `switch_language` — changes the conversation language and re-renders prior context
  - `get_crisis_resources` — immediately returns pre-cached emergency contacts in the resident's language
  - `calculate_benefits` — estimates combined benefit value for matched programs
- T-14b: All translation is performed by GPT-5.4-mini at runtime — the service catalog is stored in English as the canonical language, and the AI translates service names, descriptions, eligibility criteria, and document requirements on the fly during tool responses

### 4.3 Data Model (Core Entities)

- **Service** — the central entity: name, provider, descriptions, eligibility rules, locations, contacts, categories, documents required, cost, accessibility, languages, status
- **ServiceLocation** — physical locations with geocoordinates, hours, contact info
- **ServiceCategory** — hierarchical category taxonomy
- **Resident** (optional, account holders only) — profile, household, preferences, saved services
- **HouseholdMember** — linked to a Resident, with individual attributes for eligibility matching
- **IntakeSession** — conversation history and extracted profile (anonymous or linked to Resident)
- **ServiceMatch** — the result of matching: resident/session + service + match confidence + match reasoning
- **RiskFlag** — identified risk factors for a session/resident
- **LifeEvent** — predefined life event pathways with associated question sets and service bundles
- **StaffUser** — admin console users with roles
- **AuditLog** — all admin actions

### 4.4 Integration Points

- T-15: **Austin 311 API** (Open311 protocol) — for municipal service requests
- T-16: **Capital Metro GTFS feed** — for transit routing to service locations
- T-17: **Azure OpenAI API** — for all AI operations
- T-18: **Azure PostgreSQL** — primary data store (Flexible Server); **Azure AD B2C** — resident identity; **Azure Blob Storage** — file/document storage
- T-19: **Geocoding API** — for address-to-coordinate conversion
- T-20: **Analytics** — privacy-respecting analytics (no third-party trackers; self-hosted or Azure Application Insights)

---

## 5. Non-Functional Requirements

### 5.1 Performance

- NF-01: Initial page load under 3 seconds on 4G mobile connection
- NF-02: AI intake response latency under 2 seconds per turn
- NF-03: Service matching results generated within 5 seconds of intake completion
- NF-04: Map renders with 500+ markers without frame drops
- NF-05: Support 1,000 concurrent users without degradation

### 5.2 Accessibility

- NF-06: WCAG 2.1 Level AA compliance across all pages (legal requirement by April 2026)
- NF-07: Full keyboard navigation support
- NF-08: Screen reader compatibility (ARIA labels, semantic HTML, live regions for chat)
- NF-09: Minimum color contrast ratio of 4.5:1 for text, 3:1 for large text
- NF-10: No information conveyed by color alone
- NF-11: Responsive design: mobile (320px) through desktop (1920px+)
- NF-12: Touch targets minimum 44x44px on mobile
- NF-13: Reduced motion support (respect `prefers-reduced-motion`)

### 5.3 Security & Privacy

- NF-14: All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- NF-15: No PII stored for anonymous sessions — data exists only in browser memory during the session
- NF-16: Account holder data protected by PostgreSQL Row-Level Security policies
- NF-17: Admin console accessible only via Azure AD authentication with MFA
- NF-18: OWASP Top 10 mitigations: input validation, parameterized queries, CSRF protection, CSP headers
- NF-19: Privacy policy displayed before intake begins, written in plain language
- NF-20: Residents can request full data deletion at any time
- NF-21: No third-party analytics trackers; no data sold or shared with external parties
- NF-22: Audit log for all admin data access

### 5.4 Reliability

- NF-23: 99.5% uptime target
- NF-24: Graceful degradation if Azure OpenAI is unavailable — show static service directory without AI matching
- NF-25: Error boundaries prevent full-page crashes (per civic-ai-starter pattern)
- NF-26: Automated health checks for AI provider, database, and external integrations

### 5.5 Internationalization

- NF-27: All UI strings externalized for translation (i18n framework)
- NF-28: RTL layout fully implemented at launch (Arabic is a top-7 Austin language)
- NF-29: Date, number, and currency formatting localized
- NF-30: Content management supports parallel translations per service
