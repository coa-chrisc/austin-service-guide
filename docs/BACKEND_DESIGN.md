# Austin Service Guide — Backend & Admin Console Design

**Project:** Austin Service Guide
**Date:** April 23, 2026
**Version:** 1.0
**Status:** Draft

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [API Design](#4-api-design)
5. [AI Pipeline Architecture](#5-ai-pipeline-architecture)
6. [Admin Console Design](#6-admin-console-design)
7. [Background Jobs & Data Pipeline](#7-background-jobs--data-pipeline)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RESIDENT PORTAL                              │
│  React + MUI + Vite (SPA)                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │  Intake   │ │ Directory│ │   Map    │ │ Profile  │              │
│  │  Chat UI  │ │  Results │ │  View    │ │ Account  │              │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │
└───────┼────────────┼────────────┼────────────┼──────────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FASTAPI BACKEND                                 │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  /api/v1/    │  │  /api/v1/    │  │  /api/v1/    │             │
│  │  intake/*    │  │  services/*  │  │  admin/*     │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                  │                      │
│  ┌──────▼─────────────────▼──────────────────▼──────────────┐      │
│  │                   SERVICE LAYER                           │      │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │      │
│  │  │ ai_service │ │ matching   │ │ analytics  │           │      │
│  │  │ .py        │ │ _engine.py │ │ _service.py│           │      │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘           │      │
│  └────────┼──────────────┼──────────────┼───────────────────┘      │
│           │              │              │                           │
│  ┌────────▼──────┐ ┌─────▼──────┐ ┌────▼───────┐                  │
│  │ Azure OpenAI  │ │ PostgreSQL │ │ Azure Blob │                  │
│  │ GPT-5.4-mini  │ │ Flexible   │ │ Storage    │                  │
│  │ + Embeddings  │ │ Server     │ │            │                  │
│  └───────────────┘ └────────────┘ └────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     ADMIN CONSOLE                                   │
│  React + MUI + Vite (same SPA, /admin/* routes)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Resident │ │ Service  │ │Analytics │ │  Staff   │              │
│  │Dashboard │ │ Mgmt     │ │ & Equity │ │  Mgmt    │              │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘              │
└───────┼────────────┼────────────┼────────────┼──────────────────────┘
        │            │            │            │
        └────────────┴────────────┴────────────┘
                     │
                     ▼
              /api/v1/admin/* (Azure AD / Entra ID auth)
```

### Technology Stack

| Component         | Technology                                      | Notes                                             |
| ----------------- | ----------------------------------------------- | ------------------------------------------------- |
| Backend framework | FastAPI (Python 3.11+)                          | Per civic-ai-starter                              |
| Database          | Azure Database for PostgreSQL — Flexible Server | pgvector extension for embeddings                 |
| AI model          | Azure OpenAI GPT-5.4-mini                       | Primary model for all AI ops                      |
| Embeddings        | Azure OpenAI text-embedding-ada-002             | Semantic search vectors                           |
| Resident auth     | Azure AD B2C                                    | Email/password + social login                     |
| Staff auth        | Azure AD / Entra ID                             | City SSO integration                              |
| File storage      | Azure Blob Storage                              | Reports, exports, uploaded docs                   |
| Background jobs   | Azure Container Apps Jobs                       | Embedding generation, report scheduling           |
| Caching           | Redis (Azure Cache for Redis)                   | Session state, rate limiting, cached translations |
| Hosting           | Azure Container Apps                            | Per civic-ai-starter                              |
| CI/CD             | GitHub Actions                                  | Per civic-ai-starter                              |

---

## 2. Database Schema

### 2.1 Entity Relationship Overview

```
services ──┬── service_locations
            ├── service_category_map ── service_categories
            ├── service_documents
            ├── eligibility_rules
            ├── service_embeddings
            └── service_matches ── intake_sessions ── residents
                                                       ├── household_members
                                                       └── saved_services

life_events ── life_event_services ── services

staff_users ── audit_log

analytics_events (standalone)
```

### 2.2 Full Schema DDL

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- trigram fuzzy search

-- ============================================================
-- SERVICE CATALOG
-- ============================================================

CREATE TABLE service_categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(200) NOT NULL UNIQUE,
    description     TEXT,
    icon            VARCHAR(100),          -- MUI icon name
    color           VARCHAR(7),            -- hex color for map pins
    parent_id       UUID REFERENCES service_categories(id),
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE services (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(500) NOT NULL,
    slug            VARCHAR(500) NOT NULL UNIQUE,
    provider_name   VARCHAR(500) NOT NULL,  -- org that provides the service
    description     TEXT NOT NULL,           -- plain-language, English canonical
    eligibility_summary TEXT,               -- human-readable eligibility overview
    how_to_apply    TEXT,                    -- application instructions
    cost            VARCHAR(200),            -- "Free", "Sliding scale", "$50/visit"
    cost_type       VARCHAR(50) DEFAULT 'free',  -- free, sliding_scale, fixed, varies
    website_url     VARCHAR(1000),
    phone           VARCHAR(50),
    email           VARCHAR(320),
    languages_offered TEXT[],                -- languages the service itself offers
    accessibility_features TEXT[],           -- wheelchair, ASL, etc.
    status          VARCHAR(20) DEFAULT 'active',  -- active, inactive, pending_review
    last_verified_at TIMESTAMPTZ,
    next_review_at  TIMESTAMPTZ,
    created_by      UUID,                    -- staff user who created
    updated_by      UUID,                    -- staff user who last edited
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_name_trgm ON services USING gin(name gin_trgm_ops);

CREATE TABLE service_category_map (
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    is_primary      BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (service_id, category_id)
);

CREATE TABLE service_locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    name            VARCHAR(500),            -- location name if different from service
    address_line1   VARCHAR(500) NOT NULL,
    address_line2   VARCHAR(500),
    city            VARCHAR(200) DEFAULT 'Austin',
    state           VARCHAR(2) DEFAULT 'TX',
    zip_code        VARCHAR(10) NOT NULL,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    phone           VARCHAR(50),
    is_primary      BOOLEAN DEFAULT FALSE,
    hours_json      JSONB,                   -- structured hours per day of week
    holiday_hours   JSONB,                   -- holiday schedule overrides
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_locations_service ON service_locations(service_id);
CREATE INDEX idx_service_locations_zip ON service_locations(zip_code);
CREATE INDEX idx_service_locations_geo ON service_locations
    USING gist (ll_to_earth(latitude, longitude))
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE service_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    document_name   VARCHAR(500) NOT NULL,   -- "Photo ID", "Proof of Income"
    description     TEXT,                     -- what forms are accepted
    is_required     BOOLEAN DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0
);

CREATE TABLE eligibility_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    rule_json       JSONB NOT NULL,           -- structured rule definition
    description     TEXT,                      -- human-readable rule description
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- rule_json structure:
-- {
--   "conditions": [
--     { "field": "income_bracket", "operator": "lte", "value": "200_fpl" },
--     { "field": "household_size", "operator": "gte", "value": 1 },
--     { "field": "zip_code", "operator": "in", "value": ["78702", "78721"] },
--     { "field": "has_children", "operator": "eq", "value": true },
--     { "field": "age_range", "operator": "in", "value": ["18-24", "25-34"] },
--     { "field": "veteran_status", "operator": "eq", "value": true }
--   ],
--   "logic": "AND",               -- AND / OR for combining conditions
--   "match_confidence": "high"     -- high / medium / possible
-- }

CREATE INDEX idx_eligibility_rules_service ON eligibility_rules(service_id);

CREATE TABLE service_embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    embedding       vector(1536) NOT NULL,    -- text-embedding-ada-002 dimension
    content_hash    VARCHAR(64),              -- SHA-256 of source text, for cache invalidation
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_embeddings_service ON service_embeddings(service_id);
CREATE INDEX idx_service_embeddings_vector ON service_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- LIFE EVENTS
-- ============================================================

CREATE TABLE life_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(200) NOT NULL UNIQUE,
    description     TEXT NOT NULL,
    icon            VARCHAR(100),             -- MUI icon name
    sort_order      INTEGER DEFAULT 0,
    intake_questions JSONB,                   -- abbreviated question set for this pathway
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE life_event_services (
    life_event_id   UUID NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    relevance_score SMALLINT DEFAULT 100,     -- 0-100, for ordering
    PRIMARY KEY (life_event_id, service_id)
);

-- ============================================================
-- RESIDENTS & INTAKE
-- ============================================================

CREATE TABLE residents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    azure_ad_b2c_id VARCHAR(200) UNIQUE,     -- Azure AD B2C object ID
    email           VARCHAR(320),
    display_name    VARCHAR(200),
    phone           VARCHAR(50),
    zip_code        VARCHAR(10),
    preferred_language VARCHAR(10) DEFAULT 'en',
    profile_json    JSONB,                    -- full intake profile (demographics, needs, etc.)
    last_intake_at  TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_residents_azure_id ON residents(azure_ad_b2c_id);
CREATE INDEX idx_residents_zip ON residents(zip_code);
CREATE INDEX idx_residents_language ON residents(preferred_language);

-- profile_json structure:
-- {
--   "age_range": "25-34",
--   "household_size": 3,
--   "housing_situation": "renting",
--   "employment_status": "employed_part_time",
--   "income_bracket": "150_fpl",
--   "insurance_status": "uninsured",
--   "has_children": true,
--   "children_ages": ["0-5", "6-12"],
--   "has_seniors": false,
--   "veteran_status": false,
--   "has_disability": false,
--   "languages_spoken": ["es", "en"],
--   "immediate_needs": ["healthcare", "childcare", "food"],
--   "crisis_indicators": []
-- }

CREATE TABLE household_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resident_id     UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    relationship    VARCHAR(50) NOT NULL,     -- spouse, child, parent, sibling, other
    age_range       VARCHAR(20),              -- 0-5, 6-12, 13-17, 18-24, 25-34, etc.
    attributes      JSONB,                    -- veteran, disability, student, etc.
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_household_members_resident ON household_members(resident_id);

CREATE TABLE intake_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resident_id     UUID REFERENCES residents(id) ON DELETE SET NULL,  -- NULL for anonymous
    session_token   VARCHAR(200),             -- browser session identifier for anonymous
    language        VARCHAR(10) DEFAULT 'en',
    conversation_json JSONB,                  -- full chat history
    extracted_profile JSONB,                  -- structured profile extracted from conversation
    risk_flags      JSONB,                    -- identified risk factors
    life_event_id   UUID REFERENCES life_events(id),  -- if entered via a life event pathway
    status          VARCHAR(20) DEFAULT 'in_progress', -- in_progress, completed, abandoned
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    ip_hash         VARCHAR(64),              -- hashed IP for rate limiting, never raw IP
    user_agent      VARCHAR(500)
);

CREATE INDEX idx_intake_sessions_resident ON intake_sessions(resident_id);
CREATE INDEX idx_intake_sessions_status ON intake_sessions(status);
CREATE INDEX idx_intake_sessions_started ON intake_sessions(started_at);

CREATE TABLE service_matches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intake_session_id UUID NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    match_confidence VARCHAR(20) NOT NULL,    -- high, medium, possible
    match_reasoning TEXT,                      -- AI-generated explanation
    match_score     FLOAT,                     -- 0.0-1.0 numeric score
    was_clicked     BOOLEAN DEFAULT FALSE,
    was_saved       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_matches_session ON service_matches(intake_session_id);
CREATE INDEX idx_service_matches_service ON service_matches(service_id);
CREATE INDEX idx_service_matches_confidence ON service_matches(match_confidence);

CREATE TABLE saved_services (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resident_id     UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status          VARCHAR(30) DEFAULT 'saved',  -- saved, applied, enrolled, not_eligible, not_interested
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (resident_id, service_id)
);

CREATE INDEX idx_saved_services_resident ON saved_services(resident_id);

-- ============================================================
-- STAFF & ADMINISTRATION
-- ============================================================

CREATE TABLE staff_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    azure_ad_oid    VARCHAR(200) NOT NULL UNIQUE,  -- Azure AD / Entra ID object ID
    email           VARCHAR(320) NOT NULL,
    display_name    VARCHAR(200) NOT NULL,
    role            VARCHAR(30) NOT NULL DEFAULT 'viewer',  -- super_admin, admin, manager, viewer
    department      VARCHAR(200),
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staff_users_azure ON staff_users(azure_ad_oid);
CREATE INDEX idx_staff_users_role ON staff_users(role);

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_user_id   UUID REFERENCES staff_users(id),
    action          VARCHAR(100) NOT NULL,     -- e.g., service.create, resident.view, report.export
    resource_type   VARCHAR(100),              -- service, resident, rule, staff, report
    resource_id     UUID,
    details_json    JSONB,                     -- action-specific details
    ip_address      INET,
    user_agent      VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_staff ON audit_log(staff_user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================
-- ANALYTICS
-- ============================================================

CREATE TABLE analytics_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      VARCHAR(100) NOT NULL,    -- page_view, intake_start, intake_complete,
                                               -- service_click, service_save, map_view,
                                               -- language_switch, crisis_trigger, etc.
    session_id      UUID,                      -- intake_session reference if applicable
    resident_id     UUID,                      -- NULL for anonymous
    properties_json JSONB,                     -- event-specific data
    language        VARCHAR(10),
    zip_code        VARCHAR(10),
    device_type     VARCHAR(20),               -- mobile, tablet, desktop
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX idx_analytics_events_language ON analytics_events(language);
CREATE INDEX idx_analytics_events_zip ON analytics_events(zip_code);

-- Materialized view for daily aggregate analytics (refreshed by background job)
CREATE MATERIALIZED VIEW analytics_daily AS
SELECT
    DATE(created_at) AS day,
    event_type,
    language,
    zip_code,
    device_type,
    COUNT(*) AS event_count,
    COUNT(DISTINCT session_id) AS unique_sessions,
    COUNT(DISTINCT resident_id) AS unique_residents
FROM analytics_events
GROUP BY DATE(created_at), event_type, language, zip_code, device_type;

CREATE UNIQUE INDEX idx_analytics_daily_pk ON analytics_daily(day, event_type, language, zip_code, device_type);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;

-- Residents can only see their own data
CREATE POLICY residents_own_data ON residents
    FOR ALL USING (id = current_setting('app.current_resident_id')::uuid);

CREATE POLICY household_own_data ON household_members
    FOR ALL USING (resident_id = current_setting('app.current_resident_id')::uuid);

CREATE POLICY saved_own_data ON saved_services
    FOR ALL USING (resident_id = current_setting('app.current_resident_id')::uuid);

CREATE POLICY intake_own_data ON intake_sessions
    FOR ALL USING (resident_id = current_setting('app.current_resident_id')::uuid
                   OR resident_id IS NULL);

-- Staff bypass RLS via separate role
CREATE ROLE staff_role;
ALTER TABLE residents FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_all_residents ON residents TO staff_role USING (TRUE);
CREATE POLICY staff_all_household ON household_members TO staff_role USING (TRUE);
CREATE POLICY staff_all_saved ON saved_services TO staff_role USING (TRUE);
CREATE POLICY staff_all_intake ON intake_sessions TO staff_role USING (TRUE);
```

### 2.3 Database Migrations

Migrations managed via **Alembic** (SQLAlchemy's migration tool), following the civic-ai-starter pattern:

```
backend/
  alembic/
    versions/
      001_initial_schema.py
      002_seed_categories.py
      003_seed_life_events.py
    env.py
    alembic.ini
```

Seed data includes the 14 service categories, 12 life event pathways, and initial service catalog entries for Austin.

---

## 3. Authentication & Authorization

### 3.1 Dual Auth Architecture

```
RESIDENTS                                    STAFF
   │                                            │
   ▼                                            ▼
Azure AD B2C                            Azure AD / Entra ID
   │                                            │
   ├─ Email + password                          ├─ City SSO (SAML/OIDC)
   ├─ Google social login                       └─ MFA enforced
   └─ Apple social login
   │                                            │
   ▼                                            ▼
JWT token                                JWT token
(iss: b2c tenant)                        (iss: Entra ID tenant)
   │                                            │
   ▼                                            ▼
FastAPI: get_current_resident()          FastAPI: get_current_staff()
   │                                            │
   ▼                                            ▼
/api/v1/* resident endpoints             /api/v1/admin/* endpoints
```

### 3.2 FastAPI Auth Dependencies

```python
# backend/app/auth.py

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from jose import jwt, JWTError
from functools import lru_cache

bearer_scheme = HTTPBearer(auto_error=False)

# --- Resident Auth (Azure AD B2C) ---

async def get_current_resident(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    """Returns resident claims from B2C JWT, or None if no token."""
    if not credentials:
        return None
    return await _validate_b2c_token(credentials.credentials)

async def require_resident(
    resident: dict | None = Depends(get_current_resident),
) -> dict:
    """Raises 401 if no valid resident token."""
    if not resident:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return resident

# --- Staff Auth (Azure AD / Entra ID) ---

async def get_current_staff(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
) -> dict:
    """Returns staff claims from Entra ID JWT. Always required on admin routes."""
    return await _validate_entra_token(credentials.credentials)

def require_role(*roles: str):
    """Dependency factory: require staff to have one of the specified roles."""
    async def _check(staff: dict = Depends(get_current_staff)) -> dict:
        staff_user = await _get_staff_record(staff["oid"])
        if staff_user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        return staff_user
    return _check
```

### 3.3 RBAC Matrix

| Resource                 | Super Admin |    Admin    | Manager | Viewer |
| ------------------------ | :---------: | :---------: | :-----: | :----: |
| **Resident list**        | Read/Export | Read/Export |  Read   |   -    |
| **Resident detail**      |    Read     |    Read     |  Read   |   -    |
| **Service CRUD**         |    Full     |    Full     |  Read   |  Read  |
| **Eligibility rules**    |    Full     |    Full     |  Read   |   -    |
| **Analytics dashboards** |    Full     |    Full     |  Full   |  Full  |
| **Equity dashboard**     |    Full     |    Full     |  Full   |  Full  |
| **Reports export**       |    Full     |    Full     |  Full   |  Read  |
| **Staff management**     |    Full     |      -      |    -    |   -    |
| **Audit log**            |    Full     |    Read     |    -    |   -    |
| **System config**        |    Full     |      -      |    -    |   -    |
| **Intake flow editor**   |    Full     |    Full     |    -    |   -    |

---

## 4. API Design

All routes follow the civic-ai-starter convention: versioned under `/api/v1/`, Pydantic models for request/response, dependency injection for auth.

### 4.1 Public Endpoints (No Auth Required)

#### Health & System

```
GET  /api/v1/health                    → HealthResponse
GET  /api/v1/health/ai                 → AIHealthResponse
GET  /api/v1/setup/status              → SetupStatusResponse
```

#### Intake Conversation

```
POST /api/v1/intake/start              → IntakeSessionResponse
     Body: { language?: string, life_event_slug?: string }
     Creates a new intake session, returns session_id and AI greeting

POST /api/v1/intake/{session_id}/message  → IntakeMessageResponse
     Body: { message: string }
     Sends a resident message, returns AI response (may include tool calls)
     The AI assistant processes language detection, service searches, and
     eligibility checks via tool-use within this single endpoint

GET  /api/v1/intake/{session_id}/results  → IntakeResultsResponse
     Returns matched services, risk flags, and narrative summary
     Only available after session status = "completed"

POST /api/v1/intake/{session_id}/link-account  → void
     Auth: require_resident
     Links an anonymous session to a resident account
```

#### Service Catalog (Public Read)

```
GET  /api/v1/services                  → PaginatedResponse[ServiceSummary]
     Query: category_slug, zip_code, radius_miles, is_active, search_text,
            page, page_size, sort_by (relevance|distance|name)

GET  /api/v1/services/{slug}           → ServiceDetail
     Full detail including locations, documents, eligibility summary, hours

GET  /api/v1/services/{slug}/locations → list[ServiceLocation]

GET  /api/v1/categories                → list[CategoryTree]
     Hierarchical category listing with service counts

GET  /api/v1/life-events               → list[LifeEventSummary]
     Active life event pathways for landing page cards

GET  /api/v1/map/services              → list[MapServicePin]
     Query: category_ids[], bounds (sw_lat, sw_lng, ne_lat, ne_lng),
            zip_code, radius_miles
     Lightweight pin data for map rendering (id, lat, lng, category, name)
```

#### Crisis Resources

```
GET  /api/v1/crisis-resources          → CrisisResourcesResponse
     Query: language (default "en")
     Returns pre-cached emergency contacts in requested language
```

### 4.2 Resident Endpoints (Azure AD B2C Auth)

```
GET    /api/v1/me                       → ResidentProfile
POST   /api/v1/me                       → ResidentProfile  (create on first login)
PATCH  /api/v1/me                       → ResidentProfile  (update profile)
DELETE /api/v1/me                        → void             (full data deletion)

GET    /api/v1/me/household              → list[HouseholdMember]
POST   /api/v1/me/household              → HouseholdMember
PATCH  /api/v1/me/household/{id}         → HouseholdMember
DELETE /api/v1/me/household/{id}          → void

GET    /api/v1/me/saved-services          → list[SavedService]
POST   /api/v1/me/saved-services          → SavedService
PATCH  /api/v1/me/saved-services/{id}     → SavedService  (update status)
DELETE /api/v1/me/saved-services/{id}      → void

GET    /api/v1/me/intake-history          → list[IntakeSessionSummary]
GET    /api/v1/me/matches                  → list[ServiceMatch]  (latest matches)
```

### 4.3 Admin Endpoints (Azure AD / Entra ID Auth)

All admin routes require staff authentication and appropriate role.

#### Resident Management

```
GET  /api/v1/admin/residents                → PaginatedResponse[ResidentRow]
     Auth: require_role("super_admin", "admin", "manager")
     Query: search, zip_code, language, date_from, date_to,
            service_category_id, household_size_min, household_size_max,
            page, page_size, sort_by

GET  /api/v1/admin/residents/{id}           → ResidentAdminDetail
     Auth: require_role("super_admin", "admin", "manager")
     Includes: profile, household, matched services, saved services, activity timeline
     Side effect: audit_log entry (resident.view)

GET  /api/v1/admin/residents/{id}/matches   → list[ServiceMatch]
     Auth: require_role("super_admin", "admin", "manager")

GET  /api/v1/admin/residents/{id}/timeline  → list[ActivityEvent]
     Auth: require_role("super_admin", "admin", "manager")

POST /api/v1/admin/residents/export         → FileDownloadResponse (CSV)
     Auth: require_role("super_admin", "admin")
     Body: { filters: {...}, columns: [...] }
     Side effect: audit_log entry (resident.export)
```

#### Service Directory Management

```
GET    /api/v1/admin/services               → PaginatedResponse[ServiceAdminRow]
       Auth: require_role("super_admin", "admin", "manager", "viewer")
       Query: status, category_id, search, needs_review (bool), page, page_size

GET    /api/v1/admin/services/{id}          → ServiceAdminDetail
       Auth: require_role("super_admin", "admin", "manager", "viewer")

POST   /api/v1/admin/services               → ServiceAdminDetail
       Auth: require_role("super_admin", "admin")
       Body: ServiceCreatePayload
       Side effects: audit_log, trigger embedding generation

PATCH  /api/v1/admin/services/{id}          → ServiceAdminDetail
       Auth: require_role("super_admin", "admin")
       Body: ServiceUpdatePayload
       Side effects: audit_log, re-generate embedding if description changed,
                     create version snapshot

DELETE /api/v1/admin/services/{id}          → void (soft delete → status = "inactive")
       Auth: require_role("super_admin", "admin")
       Side effect: audit_log

POST   /api/v1/admin/services/{id}/verify   → ServiceAdminDetail
       Auth: require_role("super_admin", "admin")
       Updates last_verified_at, sets next_review_at
       Side effect: audit_log

POST   /api/v1/admin/services/import        → ImportResultResponse
       Auth: require_role("super_admin")
       Body: multipart/form-data (CSV or JSON file)
       Returns: { created: int, updated: int, errors: [...] }

GET    /api/v1/admin/services/{id}/history   → list[ServiceVersionSnapshot]
       Auth: require_role("super_admin", "admin")
```

#### Eligibility Rules

```
GET    /api/v1/admin/rules                   → list[EligibilityRuleRow]
       Auth: require_role("super_admin", "admin", "manager")
       Query: service_id

GET    /api/v1/admin/rules/{id}              → EligibilityRuleDetail
       Auth: require_role("super_admin", "admin")

POST   /api/v1/admin/rules                   → EligibilityRuleDetail
       Auth: require_role("super_admin", "admin")
       Body: { service_id, rule_json, description }

PATCH  /api/v1/admin/rules/{id}              → EligibilityRuleDetail
       Auth: require_role("super_admin", "admin")

DELETE /api/v1/admin/rules/{id}              → void
       Auth: require_role("super_admin", "admin")

POST   /api/v1/admin/rules/{id}/test         → RuleTestResult
       Auth: require_role("super_admin", "admin")
       Body: { test_profile: {...} }
       Returns: { matches: bool, confidence: string, reasoning: string }
```

#### Analytics & Reporting

```
GET  /api/v1/admin/analytics/overview       → AnalyticsOverview
     Auth: require_role("super_admin", "admin", "manager", "viewer")
     Query: date_from, date_to
     Returns: total residents, new signups, active users, sessions,
              top categories, completion rate, avg matches per session

GET  /api/v1/admin/analytics/demographics   → DemographicsBreakdown
     Auth: require_role("super_admin", "admin", "manager", "viewer")
     Query: date_from, date_to
     Returns: age, household size, zip code, language, employment,
              housing, insurance, veteran distributions

GET  /api/v1/admin/analytics/services       → ServiceDemandAnalytics
     Auth: require_role("super_admin", "admin", "manager", "viewer")
     Query: date_from, date_to, category_id
     Returns: services ranked by matches/clicks/saves, demand heatmap data,
              unmet demand indicators

GET  /api/v1/admin/analytics/languages      → LanguageAnalytics
     Auth: require_role("super_admin", "admin", "manager", "viewer")
     Query: date_from, date_to
     Returns: language usage distribution, switch patterns, top non-English queries

GET  /api/v1/admin/analytics/equity         → EquityDashboardData
     Auth: require_role("super_admin", "admin", "manager", "viewer")
     Query: date_from, date_to
     Returns: usage by demographic vs. census baseline, gap scores,
              geographic equity map data, trend lines

GET  /api/v1/admin/analytics/geographic     → GeographicAnalytics
     Auth: require_role("super_admin", "admin", "manager", "viewer")
     Query: date_from, date_to
     Returns: zip code heatmap, service desert identification,
              demand-vs-supply by geography

POST /api/v1/admin/reports/generate         → ReportJobResponse
     Auth: require_role("super_admin", "admin", "manager")
     Body: { report_type, date_from, date_to, format: "pdf"|"csv", filters }
     Returns: job_id (async generation)

GET  /api/v1/admin/reports/{job_id}          → ReportStatusResponse
     Auth: require_role("super_admin", "admin", "manager")
     Returns: status, download_url (Azure Blob SAS URL when ready)
```

#### Staff Management

```
GET    /api/v1/admin/staff                   → list[StaffUser]
       Auth: require_role("super_admin")

POST   /api/v1/admin/staff                   → StaffUser
       Auth: require_role("super_admin")
       Body: { azure_ad_oid, email, display_name, role, department }

PATCH  /api/v1/admin/staff/{id}              → StaffUser
       Auth: require_role("super_admin")

DELETE /api/v1/admin/staff/{id}              → void (deactivate)
       Auth: require_role("super_admin")
```

#### Audit Log

```
GET  /api/v1/admin/audit-log                 → PaginatedResponse[AuditLogEntry]
     Auth: require_role("super_admin", "admin")
     Query: staff_user_id, action, resource_type, date_from, date_to,
            page, page_size
```

### 4.4 Pydantic Response Models (Key Examples)

```python
# backend/app/models/services.py

from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

class ServiceSummary(BaseModel):
    id: UUID
    name: str
    slug: str
    provider_name: str
    description: str
    cost_type: str
    primary_category: CategorySummary
    location_count: int
    nearest_distance_miles: float | None = None
    match_confidence: str | None = None

class ServiceDetail(ServiceSummary):
    eligibility_summary: str | None
    how_to_apply: str | None
    cost: str | None
    website_url: str | None
    phone: str | None
    email: str | None
    languages_offered: list[str]
    accessibility_features: list[str]
    categories: list[CategorySummary]
    locations: list[ServiceLocation]
    documents: list[ServiceDocument]
    last_verified_at: datetime | None
    related_services: list[ServiceSummary]

class ServiceLocation(BaseModel):
    id: UUID
    name: str | None
    address_line1: str
    address_line2: str | None
    city: str
    state: str
    zip_code: str
    latitude: float | None
    longitude: float | None
    phone: str | None
    is_primary: bool
    hours: dict | None
    distance_miles: float | None = None

class MapServicePin(BaseModel):
    id: UUID
    service_id: UUID
    name: str
    latitude: float
    longitude: float
    category_slug: str
    category_color: str
    is_open_now: bool | None = None
```

```python
# backend/app/models/intake.py

class IntakeSessionResponse(BaseModel):
    session_id: UUID
    greeting_message: str
    suggested_buttons: list[str] | None = None
    language: str

class IntakeMessageResponse(BaseModel):
    message: str
    suggested_buttons: list[str] | None = None
    progress_percent: int
    is_complete: bool
    crisis_detected: bool
    crisis_resources: CrisisResources | None = None
    language: str

class IntakeResultsResponse(BaseModel):
    session_id: UUID
    narrative_summary: str
    total_matches: int
    estimated_monthly_benefit: float | None
    categories: list[CategoryMatchGroup]
    risk_flags: list[RiskFlag]
    language: str

class CategoryMatchGroup(BaseModel):
    category: CategorySummary
    match_count: int
    services: list[ServiceMatchResult]

class ServiceMatchResult(BaseModel):
    service: ServiceSummary
    match_confidence: str
    match_reasoning: str
    match_score: float

class RiskFlag(BaseModel):
    risk_type: str
    severity: str          # low, moderate, high
    description: str       # plain-language, in resident's language
    contributing_factors: list[str]
    prevention_services: list[ServiceSummary]
```

---

## 5. AI Pipeline Architecture

### 5.1 Model Configuration

```python
# backend/app/ai_providers/azure_openai.py (extended from civic-ai-starter)

class AzureOpenAIProvider(AIProvider):
    def __init__(self):
        self._chat_client = AsyncAzureOpenAI(
            azure_endpoint=_require_env("AZURE_OPENAI_ENDPOINT"),
            api_key=_require_env("AZURE_OPENAI_KEY"),
            api_version="2025-03-01-preview",
        )
        self._deployment_chat = _env("AZURE_OPENAI_DEPLOYMENT_CHAT", "gpt-5.4-mini")
        self._deployment_embedding = _env("AZURE_OPENAI_DEPLOYMENT_EMBEDDING", "text-embedding-ada-002")
```

### 5.2 AI Assistant System Prompt

```python
INTAKE_SYSTEM_PROMPT = """
You are the Austin Service Guide assistant — a warm, knowledgeable guide who
helps City of Austin residents discover services they may be eligible for.

## Your role
- Conduct a conversational intake to understand the resident's situation
- Identify services they may qualify for using the search tools provided
- Detect risk factors and surface prevention services proactively
- Communicate in whatever language the resident uses

## Conversation flow
1. Greet the resident warmly. Detect their language from their first message.
   If they selected a language in the UI, use that.
2. Ask about their situation one topic at a time. Adapt based on answers.
   Topics (ask in natural order based on context, not rigidly):
   - What brought them here today / immediate needs
   - Household composition (who they're seeking help for)
   - Zip code (for location-based matching)
   - Housing situation
   - Employment status
   - Approximate income range (offer brackets, not exact)
   - Insurance status
   - Children, seniors, veterans, disabilities in household
   - Any other needs they want to mention
3. After gathering enough info (typically 6-10 exchanges), summarize what
   you've learned and call the tools to search for matching services.
4. Present results organized by category with brief explanations of why
   each service was matched.

## Rules
- NEVER provide medical, legal, or financial advice
- NEVER invent services — only recommend services returned by your tools
- If you detect a crisis (suicidal ideation, domestic violence, imminent
  homelessness, food emergency), IMMEDIATELY call get_crisis_resources and
  present emergency contacts BEFORE continuing the intake
- Always offer a "skip" or "prefer not to answer" option for sensitive questions
- Be empathetic but efficient — respect the resident's time
- When presenting services, explain WHY each was matched to their situation
- Use "may qualify," "likely eligible," "worth exploring" — never certainty

## Language handling
- Detect the resident's language from their messages
- If they switch languages mid-conversation, seamlessly follow
- When calling search tools, translate the query concept to English internally
  (the service catalog is in English) and present results back in the
  resident's language
- For the language selector's top 7 languages (Spanish, Chinese, Hindi,
  Arabic, Vietnamese, French, Korean), use culturally appropriate phrasing,
  not literal translation

## Progress tracking
- After each exchange, estimate completion percentage (0-100) based on
  how many intake topics have been covered
- Set is_complete=true when you have enough information to generate
  meaningful service matches
"""
```

### 5.3 Tool Definitions (Function Calling)

The AI assistant has access to these tools via Azure OpenAI's function calling API:

```python
INTAKE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_services",
            "description": "Search the Austin service catalog for services matching a query. "
                           "Query should be in English (translate from resident's language if needed). "
                           "Returns services with eligibility info.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query in English describing the type of service needed"
                    },
                    "category_slug": {
                        "type": "string",
                        "description": "Optional category filter slug",
                        "enum": ["healthcare", "housing", "food", "employment", "childcare",
                                 "senior", "veterans", "utilities", "transportation",
                                 "legal", "disability", "immigration", "education", "emergency"]
                    },
                    "zip_code": {
                        "type": "string",
                        "description": "Resident's zip code for distance calculation"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum results to return (default 10)",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_service_details",
            "description": "Get full details for a specific service including locations, "
                           "hours, documents needed, and eligibility criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_id": {
                        "type": "string",
                        "description": "UUID of the service to retrieve"
                    }
                },
                "required": ["service_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_by_location",
            "description": "Find services near a specific location, sorted by distance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "zip_code": {
                        "type": "string",
                        "description": "Zip code to search near"
                    },
                    "radius_miles": {
                        "type": "number",
                        "description": "Search radius in miles (default 10)",
                        "default": 10
                    },
                    "category_slug": {
                        "type": "string",
                        "description": "Optional category filter"
                    }
                },
                "required": ["zip_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_eligibility",
            "description": "Check whether a resident's profile matches a service's eligibility rules. "
                           "Call this after gathering enough intake information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_id": {
                        "type": "string",
                        "description": "UUID of the service to check"
                    },
                    "profile": {
                        "type": "object",
                        "description": "Resident profile extracted from conversation",
                        "properties": {
                            "age_range": { "type": "string" },
                            "household_size": { "type": "integer" },
                            "income_bracket": { "type": "string" },
                            "employment_status": { "type": "string" },
                            "housing_situation": { "type": "string" },
                            "insurance_status": { "type": "string" },
                            "veteran_status": { "type": "boolean" },
                            "has_children": { "type": "boolean" },
                            "has_disability": { "type": "boolean" },
                            "zip_code": { "type": "string" }
                        }
                    }
                },
                "required": ["service_id", "profile"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_crisis_resources",
            "description": "Get emergency crisis resources. Call IMMEDIATELY if the resident "
                           "mentions suicidal thoughts, domestic violence, imminent homelessness, "
                           "or a food emergency. Do not wait to finish the intake.",
            "parameters": {
                "type": "object",
                "properties": {
                    "crisis_type": {
                        "type": "string",
                        "description": "Type of crisis detected",
                        "enum": ["mental_health", "domestic_violence", "homelessness",
                                 "food_emergency", "general"]
                    }
                },
                "required": ["crisis_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_benefits",
            "description": "Estimate the combined monthly dollar value of benefits the resident "
                           "may qualify for based on matched services.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matched_service_ids": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "UUIDs of matched services to calculate benefits for"
                    },
                    "profile": {
                        "type": "object",
                        "description": "Resident profile for benefit calculation"
                    }
                },
                "required": ["matched_service_ids", "profile"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_matching_services_batch",
            "description": "Run the full matching engine against the resident's extracted profile. "
                           "Call this when the intake is complete to generate the final results. "
                           "Returns all eligible services grouped by category with confidence scores.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile": {
                        "type": "object",
                        "description": "Complete resident profile extracted from conversation"
                    },
                    "zip_code": {
                        "type": "string",
                        "description": "Resident's zip code"
                    }
                },
                "required": ["profile"]
            }
        }
    }
]
```

### 5.4 Service Matching Engine

```python
# backend/app/matching_engine.py

async def match_services(profile: dict, zip_code: str | None = None) -> list[ServiceMatch]:
    """
    Two-phase matching:
    1. Rules-based: evaluate eligibility_rules against profile (fast, deterministic)
    2. Semantic: embed profile needs → vector similarity against service_embeddings (broad discovery)

    Results are merged, deduplicated, and ranked by combined score.
    """

    # Phase 1: Rules-based matching
    rules_matches = await _evaluate_eligibility_rules(profile)

    # Phase 2: Semantic matching
    needs_text = _profile_to_needs_text(profile)
    needs_embedding = await ai_service.generate_embedding(needs_text)
    semantic_matches = await _vector_similarity_search(needs_embedding, top_k=50)

    # Merge and score
    combined = _merge_matches(rules_matches, semantic_matches)

    # Add distance if zip code provided
    if zip_code:
        combined = await _add_distances(combined, zip_code)

    # Risk assessment
    risk_flags = _assess_risks(profile)

    return combined, risk_flags


async def _evaluate_eligibility_rules(profile: dict) -> list[ServiceMatch]:
    """Evaluate all active eligibility rules against the resident's profile."""
    rules = await db.fetch_all("SELECT * FROM eligibility_rules WHERE is_active = TRUE")
    matches = []
    for rule in rules:
        result = _evaluate_rule(rule["rule_json"], profile)
        if result["matches"]:
            matches.append(ServiceMatch(
                service_id=rule["service_id"],
                match_confidence=result["confidence"],
                match_score=result["score"],
                match_reasoning=result["reasoning"],
            ))
    return matches


def _evaluate_rule(rule_json: dict, profile: dict) -> dict:
    """Evaluate a single rule against a profile. Returns match result."""
    conditions = rule_json.get("conditions", [])
    logic = rule_json.get("logic", "AND")
    results = []

    for cond in conditions:
        field = cond["field"]
        operator = cond["operator"]
        value = cond["value"]
        profile_value = profile.get(field)

        if profile_value is None:
            results.append(None)  # unknown — doesn't disqualify
            continue

        match operator:
            case "eq":  results.append(profile_value == value)
            case "neq": results.append(profile_value != value)
            case "gt":  results.append(profile_value > value)
            case "gte": results.append(profile_value >= value)
            case "lt":  results.append(profile_value < value)
            case "lte": results.append(profile_value <= value)
            case "in":  results.append(profile_value in value)
            case _:     results.append(None)

    known_results = [r for r in results if r is not None]
    if not known_results:
        return {"matches": False, "confidence": "possible", "score": 0.3, "reasoning": "Insufficient data"}

    if logic == "AND":
        all_pass = all(r for r in known_results)
        unknown_count = results.count(None)
        if all_pass and unknown_count == 0:
            return {"matches": True, "confidence": "high", "score": 1.0,
                    "reasoning": "All eligibility criteria met"}
        elif all_pass and unknown_count > 0:
            return {"matches": True, "confidence": "medium", "score": 0.7,
                    "reasoning": f"Criteria met for known fields ({unknown_count} unknown)"}
        else:
            return {"matches": False, "confidence": "low", "score": 0.0, "reasoning": "Does not meet criteria"}
    else:  # OR
        any_pass = any(r for r in known_results)
        if any_pass:
            return {"matches": True, "confidence": "high", "score": 0.9,
                    "reasoning": "Meets at least one eligibility criterion"}
        return {"matches": False, "confidence": "low", "score": 0.0, "reasoning": "Does not meet criteria"}
```

### 5.5 Risk Assessment

```python
# backend/app/risk_assessment.py

RISK_RULES = [
    {
        "type": "housing_instability",
        "severity_fn": lambda p: "high" if p.get("housing_situation") == "homeless"
                        else "moderate" if p.get("housing_situation") == "at_risk"
                        else None,
        "description": "Housing instability — services available to help stabilize your situation",
        "service_categories": ["housing"]
    },
    {
        "type": "food_insecurity",
        "severity_fn": lambda p: "high" if "food" in p.get("immediate_needs", [])
                        else "moderate" if p.get("income_bracket") in ["below_poverty", "100_fpl"]
                        else None,
        "description": "Food access — programs available to help with groceries and meals",
        "service_categories": ["food"]
    },
    {
        "type": "healthcare_gap",
        "severity_fn": lambda p: "high" if p.get("insurance_status") == "uninsured"
                        else "moderate" if p.get("insurance_status") == "underinsured"
                        else None,
        "description": "Healthcare coverage gap — options for affordable care",
        "service_categories": ["healthcare"]
    },
    {
        "type": "childcare_gap",
        "severity_fn": lambda p: "moderate"
                        if p.get("has_children") and p.get("employment_status") in
                           ["employed_full_time", "employed_part_time", "seeking"]
                        and "childcare" in p.get("immediate_needs", [])
                        else None,
        "description": "Childcare needs — subsidized options may be available",
        "service_categories": ["childcare"]
    },
    {
        "type": "financial_crisis",
        "severity_fn": lambda p: "high" if p.get("income_bracket") == "below_poverty"
                        else "moderate" if p.get("income_bracket") == "100_fpl"
                        else None,
        "description": "Financial assistance — utility help, emergency aid, and other support",
        "service_categories": ["utilities", "emergency"]
    },
    {
        "type": "mental_health",
        "severity_fn": lambda p: "moderate"
                        if any(ind in p.get("crisis_indicators", [])
                               for ind in ["stress", "isolation", "caregiving_burden"])
                        else None,
        "description": "Mental wellness — free and low-cost counseling and support",
        "service_categories": ["healthcare"]
    },
]

def assess_risks(profile: dict) -> list[RiskFlag]:
    flags = []
    for rule in RISK_RULES:
        severity = rule["severity_fn"](profile)
        if severity:
            flags.append(RiskFlag(
                risk_type=rule["type"],
                severity=severity,
                description=rule["description"],
                contributing_factors=_get_contributing_factors(rule, profile),
                service_categories=rule["service_categories"],
            ))
    return flags
```

---

## 6. Admin Console Design

The admin console is a set of React routes under `/admin/*` within the same SPA, gated by Azure AD / Entra ID authentication. It uses the same MUI theme but with a distinct admin layout (sidebar navigation, no resident-facing intake UI).

### 6.1 Admin Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ┌─ AppBar ────────────────────────────────────────────────┐ │
│  │ [Austin Service Guide — Admin]     [Staff Name] [Logout]│ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─ Sidebar ──┐  ┌─ Main Content ───────────────────────┐   │
│  │             │  │                                       │   │
│  │ Dashboard   │  │  (Page content renders here)          │   │
│  │ ─────────── │  │                                       │   │
│  │ Residents   │  │                                       │   │
│  │ Services    │  │                                       │   │
│  │ Rules       │  │                                       │   │
│  │ ─────────── │  │                                       │   │
│  │ Analytics   │  │                                       │   │
│  │ Equity      │  │                                       │   │
│  │ Demand Map  │  │                                       │   │
│  │ Languages   │  │                                       │   │
│  │ ─────────── │  │                                       │   │
│  │ Reports     │  │                                       │   │
│  │ Audit Log   │  │                                       │   │
│  │ Staff       │  │                                       │   │
│  │             │  │                                       │   │
│  └─────────────┘  └───────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

Sidebar navigation items are conditionally rendered based on the staff user's role (per RBAC matrix in section 3.3).

### 6.2 Dashboard Page (`/admin`)

The landing page after staff login. Provides a high-level overview of portal health and activity.

```
┌─ Dashboard ──────────────────────────────────────────────────┐
│                                                               │
│  ┌─ Metric Cards (Grid, 4 across) ────────────────────────┐  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │ │Total     │ │New       │ │Active    │ │Intake    │   │  │
│  │ │Residents │ │Signups   │ │Users     │ │Completion│   │  │
│  │ │  2,847   │ │ 142 (7d) │ │ 891 (7d) │ │   73%    │   │  │
│  │ │ ↑12%     │ │ ↑8%      │ │ ↑15%     │ │ ↑2%      │   │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Top Service Categories (Bar Chart) ─┐  ┌─ Recent ────┐  │
│  │                                       │  │ Activity    │  │
│  │  Healthcare    ████████████  342       │  │             │  │
│  │  Housing       █████████    287        │  │ • New signup│  │
│  │  Food          ████████     264        │  │   Maria G.  │  │
│  │  Employment    ██████       198        │  │   2 min ago │  │
│  │  Childcare     █████        156        │  │             │  │
│  │  Utilities     ████         134        │  │ • Service   │  │
│  │                                       │  │   updated   │  │
│  └───────────────────────────────────────┘  │   SNAP Info  │  │
│                                              │   15 min ago│  │
│  ┌─ Language Distribution (Donut) ───────┐  │             │  │
│  │                                       │  │ • Rule      │  │
│  │     English 71%                       │  │   modified  │  │
│  │     Spanish 18%                       │  │   WIC elig. │  │
│  │     Chinese 3%                        │  │   1 hr ago  │  │
│  │     Hindi 2%                          │  │             │  │
│  │     Other 6%                          │  └─────────────┘  │
│  └───────────────────────────────────────┘                   │
│                                                               │
│  ┌─ Zip Code Heatmap (Map) ──────────────────────────────┐   │
│  │                                                        │   │
│  │  [Interactive map of Austin showing portal usage       │   │
│  │   density by zip code — darker = more sessions]        │   │
│  │                                                        │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

**Components:** MUI `Card` with `Typography` for metrics, Recharts or MUI X Charts for bar/donut charts, Leaflet/Mapbox for heatmap.

**Data source:** `GET /api/v1/admin/analytics/overview`

### 6.3 Residents Page (`/admin/residents`)

#### List View

```
┌─ Residents ──────────────────────────────────────────────────┐
│                                                               │
│  ┌─ Toolbar ──────────────────────────────────────────────┐  │
│  │ [Search by name/email...   ]  Filters ▾   [Export CSV] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Filter Chips (when expanded) ─────────────────────────┐  │
│  │ Zip: [All ▾]  Language: [All ▾]  Signed up: [Last 30d]│  │
│  │ Category interest: [All ▾]  Household: [Any ▾]         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ DataGrid ─────────────────────────────────────────────┐  │
│  │ Name          │ Zip   │ HH │ Language │ Top Needs │ Last │  │
│  │───────────────┼───────┼────┼──────────┼───────────┼──────│  │
│  │ Maria Garcia  │ 78702 │ 4  │ es       │ HC, Food  │ 2d   │  │
│  │ James Wilson  │ 78745 │ 1  │ en       │ Housing   │ 5d   │  │
│  │ Anh Nguyen    │ 78758 │ 3  │ vi       │ Child, Emp│ 1w   │  │
│  │ ... (paginated)                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Showing 1-25 of 2,847    [< 1 2 3 ... 114 >]               │
└───────────────────────────────────────────────────────────────┘
```

**Component:** MUI `DataGrid` (from `@mui/x-data-grid`) with server-side pagination, sorting, and filtering. Row click navigates to detail view.

**Data source:** `GET /api/v1/admin/residents`

#### Detail View (`/admin/residents/:id`)

```
┌─ Resident Detail ────────────────────────────────────────────┐
│                                                               │
│  ← Back to Residents                                          │
│                                                               │
│  ┌─ Profile Card ──────────────┐  ┌─ Activity Timeline ───┐  │
│  │ Maria Garcia                │  │                         │  │
│  │ maria.g@email.com           │  │ Apr 22 — Intake         │  │
│  │ Zip: 78702  HH: 4  Lang: es│  │  completed, 12 matches  │  │
│  │                              │  │                         │  │
│  │ ── Demographics ──           │  │ Apr 22 — Saved          │  │
│  │ Age: 25-34                   │  │  CommUnity Care clinic  │  │
│  │ Housing: Renting             │  │                         │  │
│  │ Employment: Part-time        │  │ Apr 20 — Intake         │  │
│  │ Income: 150% FPL             │  │  started, abandoned     │  │
│  │ Insurance: Uninsured         │  │                         │  │
│  │ Children: 2 (ages 0-5, 6-12)│  │ Apr 15 — Account        │  │
│  │ Veteran: No                  │  │  created                │  │
│  │                              │  │                         │  │
│  │ ── Household Members ──      │  └─────────────────────────┘  │
│  │ • Spouse, 25-34              │                               │
│  │ • Child, 0-5                 │                               │
│  │ • Child, 6-12               │                               │
│  └──────────────────────────────┘                               │
│                                                               │
│  ┌─ Matched Services (Tabs: All | Saved | By Member) ─────┐  │
│  │                                                          │  │
│  │ ■ Healthcare (3)                                         │  │
│  │   • CommUnity Care — Primary care    [HIGH]  ★ Saved     │  │
│  │   • People's Clinic — Family care    [HIGH]              │  │
│  │   • MAP — Insurance enrollment       [MEDIUM]            │  │
│  │                                                          │  │
│  │ ■ Food (2)                                               │  │
│  │   • Central TX Food Bank             [HIGH]              │  │
│  │   • WIC                              [HIGH]              │  │
│  │                                                          │  │
│  │ ■ Childcare (2)                                          │  │
│  │   • Workforce Solutions childcare    [HIGH]   ★ Saved    │  │
│  │   • Head Start                       [MEDIUM]            │  │
│  │                                                          │  │
│  │ ... more categories                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Risk Flags ───────────────────────────────────────────┐   │
│  │ ⚠ Healthcare gap (HIGH) — Uninsured, household of 4    │   │
│  │ ⚠ Food insecurity (MODERATE) — Income at 150% FPL      │   │
│  │ ⚠ Childcare gap (MODERATE) — Working parent, 2 children│   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

**Data source:** `GET /api/v1/admin/residents/{id}` + `/matches` + `/timeline`

### 6.4 Service Directory Management (`/admin/services`)

#### List View

```
┌─ Service Directory ──────────────────────────────────────────┐
│                                                               │
│  ┌─ Toolbar ──────────────────────────────────────────────┐  │
│  │ [Search services...    ]  Status: [All ▾]              │  │
│  │ Category: [All ▾]  Needs Review: [□]                   │  │
│  │                               [+ Add Service] [Import] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ DataGrid ─────────────────────────────────────────────┐  │
│  │ Name          │ Provider    │ Category  │ Status │ Last  │  │
│  │               │             │           │        │Verify │  │
│  │───────────────┼─────────────┼───────────┼────────┼───────│  │
│  │ SNAP Benefits │ TX HHS      │ Food      │ Active │ 30d   │  │
│  │ CommUnity Care│ CommUnity   │ Healthcare│ Active │ 15d   │  │
│  │ I Belong ATX  │ City of ATX │ Housing   │ ⚠ Review│ 90d  │  │
│  │ ...                                                     │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

#### Add/Edit Form (`/admin/services/new` or `/admin/services/:id/edit`)

```
┌─ Edit Service ───────────────────────────────────────────────┐
│                                                               │
│  ┌─ Tabs: [Details] [Locations] [Eligibility] [Documents] ┐  │
│                                                               │
│  ── Details Tab ──                                            │
│                                                               │
│  Service Name *        [CommUnity Care Health Centers      ]  │
│  Provider Name *       [CommUnity Care                     ]  │
│  Slug                  [community-care-health-centers      ]  │
│                                                               │
│  Description *         [Multi-line text editor               │
│                         Plain language, English canonical.    │
│                         AI translates at runtime.           ] │
│                                                               │
│  Eligibility Summary   [Multi-line text                     ] │
│  How to Apply          [Multi-line text                     ] │
│                                                               │
│  ┌─ Row ──────────────────────────────────────────────────┐  │
│  │ Cost Type: [Sliding Scale ▾]  Cost Detail: [Based on  ]│  │
│  │                                             income     ]│  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Website URL           [https://communitycaretx.org        ]  │
│  Phone                 [512-978-9015                       ]  │
│  Email                 [info@communitycaretx.org           ]  │
│                                                               │
│  Categories *          [Healthcare ×] [+ Add]                 │
│  Languages Offered     [English ×] [Spanish ×] [+ Add]        │
│  Accessibility         [Wheelchair ×] [Interpreter ×] [+Add]  │
│                                                               │
│  Status                (●) Active  ( ) Inactive               │
│                                                               │
│  ── Locations Tab ──                                          │
│                                                               │
│  ┌─ Location 1 (Primary) ────────────────────────────────┐   │
│  │ Name:    [North Central clinic                       ] │   │
│  │ Address: [1210 W. Braker Ln                          ] │   │
│  │ City: [Austin]  State: [TX]  Zip: [78758]             │   │
│  │ Phone:   [512-978-9015]                                │   │
│  │ Hours:   [Visual hour picker — Mon-Fri 8a-5p, etc.]    │   │
│  │ [Geocode Address]  Lat: 30.3921  Lng: -97.7312         │   │
│  └────────────────────────────────────────────────────────┘   │
│  [+ Add Location]                                             │
│                                                               │
│  ── Eligibility Tab ──                                        │
│                                                               │
│  ┌─ Rule Builder ─────────────────────────────────────────┐  │
│  │ Logic: (●) ALL conditions must match  ( ) ANY           │  │
│  │                                                         │  │
│  │ Condition 1: [Income ▾] [is at or below ▾] [200% FPL ▾]│  │
│  │ Condition 2: [Zip Code ▾] [is in ▾] [78702,78721,...]  │  │
│  │ [+ Add Condition]                                       │  │
│  │                                                         │  │
│  │ [Test Rule]  → Result: "High match for test profile"    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ── Documents Tab ──                                          │
│                                                               │
│  ┌─ Required Documents ───────────────────────────────────┐  │
│  │ 1. [Photo ID               ] [Valid driver's license, ] │  │
│  │    [Required ☑]              [passport, or state ID   ] │  │
│  │ 2. [Proof of Income        ] [Pay stubs, tax return,  ] │  │
│  │    [Required ☑]              [benefits letter         ] │  │
│  │ 3. [Proof of Residence     ] [Utility bill, lease     ] │  │
│  │    [Required ☑]              [agreement               ] │  │
│  │ [+ Add Document]                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  [Cancel]                                    [Save Service]   │
└───────────────────────────────────────────────────────────────┘
```

**Component:** MUI `Tabs`, `TextField`, `Autocomplete` (for categories/languages), `Switch`, custom `HoursEditor` component, `RuleBuilder` component.

### 6.5 Analytics Dashboard (`/admin/analytics`)

```
┌─ Analytics ──────────────────────────────────────────────────┐
│                                                               │
│  Date Range: [Apr 1, 2026] to [Apr 23, 2026]  [Apply]       │
│                                                               │
│  ┌─ Metric Cards ─────────────────────────────────────────┐  │
│  │ Sessions │ Completions │ Avg Matches │ Avg Time │ Return│  │
│  │  4,231   │   3,089     │   8.4/user  │  4:12    │  34%  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Sessions Over Time (Line Chart) ──────────────────────┐  │
│  │ [Line chart showing daily sessions, completions,        │  │
│  │  and new signups over the selected date range]          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Demographics (Grid, 2x2) ────────────────────────────┐  │
│  │ ┌─ Age Distribution ──┐  ┌─ Housing Situation ──────┐ │  │
│  │ │ [Horizontal bar]     │  │ [Donut chart]            │ │  │
│  │ │ 18-24  ██████  18%   │  │ Renting 52%              │ │  │
│  │ │ 25-34  ████████ 26%  │  │ Owning 21%               │ │  │
│  │ │ 35-44  ███████  22%  │  │ With family 15%          │ │  │
│  │ │ 45-54  █████    15%  │  │ At risk 8%               │ │  │
│  │ │ 55-64  ████     11%  │  │ Homeless 4%              │ │  │
│  │ │ 65+    ███       8%  │  │                          │ │  │
│  │ └─────────────────────┘  └──────────────────────────┘ │  │
│  │ ┌─ Employment ─────────┐  ┌─ Insurance ─────────────┐ │  │
│  │ │ [Donut chart]         │  │ [Donut chart]           │ │  │
│  │ │ FT 34%  PT 18%       │  │ Insured 58%             │ │  │
│  │ │ Seeking 22%           │  │ Uninsured 31%           │ │  │
│  │ │ Retired 12%           │  │ Underinsured 11%        │ │  │
│  │ │ Other 14%             │  │                         │ │  │
│  │ └─────────────────────┘  └─────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Service Demand Rankings ──────────────────────────────┐  │
│  │ Service                   │ Matches │ Clicks │ Saves   │  │
│  │ SNAP Benefits             │  1,247  │   892  │   456   │  │
│  │ CommUnity Care            │  1,103  │   734  │   312   │  │
│  │ Central TX Food Bank      │    987  │   654  │   287   │  │
│  │ Customer Asst. Program    │    876  │   543  │   234   │  │
│  │ Workforce Solutions       │    654  │   432  │   198   │  │
│  │ ... (expandable)                                       │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Data source:** `GET /api/v1/admin/analytics/overview` + `/demographics` + `/services`

### 6.6 Equity Dashboard (`/admin/equity`)

```
┌─ Equity Dashboard ───────────────────────────────────────────┐
│                                                               │
│  Date Range: [Apr 1, 2026] to [Apr 23, 2026]  [Apply]       │
│                                                               │
│  ┌─ Equity Score Card ────────────────────────────────────┐  │
│  │                                                         │  │
│  │ Overall Equity Score: 72/100     Trend: ↑ from 68       │  │
│  │ "Portal usage is moderately representative of Austin's  │  │
│  │  demographics. Gaps remain in 65+ age group and         │  │
│  │  Southeast Austin zip codes."                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Portal Users vs. Austin Census (Grouped Bar Chart) ───┐  │
│  │                                                         │  │
│  │                    Portal Users    Austin Census         │  │
│  │ Hispanic/Latino    ████████ 38%    ████████ 33%         │  │
│  │ White              █████    28%    ██████████ 55%       │  │
│  │ Black              ████     15%    ██        8%         │  │
│  │ Asian              ███      10%    ███       9%         │  │
│  │ Other              ██        9%    ██        8%         │  │
│  │                                                         │  │
│  │ ⚠ White residents are underrepresented (28% vs 55%)     │  │
│  │ ✓ Hispanic/Latino residents are well-represented         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Geographic Equity Map ────────────────────────────────┐  │
│  │                                                         │  │
│  │ [Choropleth map of Austin showing per-capita portal     │  │
│  │  usage by census tract, overlaid with income data.      │  │
│  │  Red zones = low usage relative to population.          │  │
│  │  Green zones = proportional usage.                      │  │
│  │  Service desert indicators marked with ⚠ icons.]       │  │
│  │                                                         │  │
│  │ Legend: ■ High usage  ■ Moderate  ■ Low  ■ Very low     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Language Access ──────────┐  ┌─ Age Group Access ─────┐  │
│  │ Spanish    ████████  Good  │  │ 18-34   ████████ Good  │  │
│  │ Chinese    ████      Good  │  │ 35-54   ███████  Good  │  │
│  │ Hindi      ███       Fair  │  │ 55-64   ████     Fair  │  │
│  │ Arabic     ██        Fair  │  │ 65+     ██       Low   │  │
│  │ Vietnamese █         Low   │  │                        │  │
│  │ French     █         Low   │  │ ⚠ Seniors (65+) are    │  │
│  │ Korean     █         Low   │  │   significantly under- │  │
│  │                            │  │   represented          │  │
│  └────────────────────────────┘  └────────────────────────┘  │
│                                                               │
│  ┌─ Equity Trend (Line Chart, 12-Week) ──────────────────┐  │
│  │ [Lines showing equity score over time for each          │  │
│  │  demographic dimension: race, age, geography, language] │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Data source:** `GET /api/v1/admin/analytics/equity`

### 6.7 Service Demand Map (`/admin/demand`)

```
┌─ Service Demand Map ─────────────────────────────────────────┐
│                                                               │
│  Category: [All ▾]  Period: [Last 30 days ▾]                  │
│                                                               │
│  ┌─ Split View ──────────────────────────────────────────┐   │
│  │ ┌─ Heatmap ──────────────┐  ┌─ Top Zip Codes ─────┐  │   │
│  │ │                         │  │                       │  │   │
│  │ │ [Heat map of Austin     │  │ 78702  ███████  412   │  │   │
│  │ │  showing service demand │  │ 78745  ██████   387   │  │   │
│  │ │  intensity by zip code. │  │ 78758  █████    312   │  │   │
│  │ │  Click a zone to see    │  │ 78741  ████     267   │  │   │
│  │ │  demand breakdown.]     │  │ 78753  ████     254   │  │   │
│  │ │                         │  │ 78723  ███      198   │  │   │
│  │ │                         │  │ 78721  ███      187   │  │   │
│  │ │                         │  │ ...                   │  │   │
│  │ └─────────────────────────┘  └───────────────────────┘  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Demand vs. Supply Gap ────────────────────────────────┐  │
│  │ Category     │ Demand │ Services │ Gap Score │ Status   │  │
│  │──────────────┼────────┼──────────┼───────────┼──────────│  │
│  │ Housing      │  HIGH  │    8     │  ⚠ 0.34   │ Under-   │  │
│  │              │        │          │           │ served   │  │
│  │ Healthcare   │  HIGH  │   14     │  ✓ 0.78   │ OK       │  │
│  │ Childcare    │  MED   │    5     │  ⚠ 0.42   │ Under-   │  │
│  │              │        │          │           │ served   │  │
│  │ Food         │  HIGH  │   12     │  ✓ 0.85   │ OK       │  │
│  │ Legal Aid    │  MED   │    3     │  ⚠ 0.31   │ Under-   │  │
│  │              │        │          │           │ served   │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Data source:** `GET /api/v1/admin/analytics/services` + `/geographic`

### 6.8 Language Analytics (`/admin/languages`)

```
┌─ Language Analytics ─────────────────────────────────────────┐
│                                                               │
│  Period: [Last 30 days ▾]                                     │
│                                                               │
│  ┌─ Language Usage (Donut + Table) ───────────────────────┐  │
│  │                                                         │  │
│  │  ┌──────────────┐   Language      Sessions   % Share   │  │
│  │  │   [Donut]    │   English        3,012     71.2%     │  │
│  │  │              │   Spanish          762     18.0%     │  │
│  │  │              │   Chinese          127      3.0%     │  │
│  │  │              │   Hindi             85      2.0%     │  │
│  │  │              │   Arabic            63      1.5%     │  │
│  │  │              │   Vietnamese        51      1.2%     │  │
│  │  └──────────────┘   Korean            38      0.9%     │  │
│  │                      French            34      0.8%     │  │
│  │                      Other             59      1.4%     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Language Switching Patterns ──────────────────────────┐  │
│  │ "Switch to Spanish" events: 234 (5.5% of all sessions) │  │
│  │ Most common switches:                                   │  │
│  │   English → Spanish  (187)                              │  │
│  │   English → Chinese  (23)                               │  │
│  │   English → Hindi    (12)                               │  │
│  │   Spanish → English  (8)                                │  │
│  │   Other combinations (4)                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Non-English Service Queries (Top 20) ─────────────────┐  │
│  │ Original Query              │ Language │ Count │ Category│  │
│  │ "comida gratis"             │ es       │   87  │ Food    │  │
│  │ "ayuda con la renta"        │ es       │   64  │ Housing │  │
│  │ "免费诊所"                    │ zh       │   31  │ Health  │  │
│  │ "clínica de salud"          │ es       │   28  │ Health  │  │
│  │ "emploi aide"               │ fr       │   15  │ Employ  │  │
│  │ ...                                                     │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Data source:** `GET /api/v1/admin/analytics/languages`

### 6.9 Reports (`/admin/reports`)

```
┌─ Reports ────────────────────────────────────────────────────┐
│                                                               │
│  ┌─ Generate Report ──────────────────────────────────────┐  │
│  │                                                         │  │
│  │ Report Type: [Monthly Usage Summary        ▾]           │  │
│  │                                                         │  │
│  │ Available reports:                                      │  │
│  │  • Monthly Usage Summary                                │  │
│  │  • Service Demand Report                                │  │
│  │  • Demographic Profile                                  │  │
│  │  • Equity Analysis                                      │  │
│  │  • Language Access Report                               │  │
│  │  • Service Gap Analysis                                 │  │
│  │                                                         │  │
│  │ Date Range: [Apr 1, 2026] to [Apr 23, 2026]            │  │
│  │ Format: (●) PDF  ( ) CSV                                │  │
│  │                                                         │  │
│  │                               [Generate Report]         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Recent Reports ──────────────────────────────────────┐   │
│  │ Report                │ Generated  │ By        │ Action│   │
│  │ Monthly Summary Apr   │ Apr 22     │ J. Smith  │ [⬇]   │   │
│  │ Equity Q1 2026        │ Apr 15     │ A. Torres │ [⬇]   │   │
│  │ Service Demand Mar    │ Mar 31     │ J. Smith  │ [⬇]   │   │
│  │ ...                                                    │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### 6.10 Audit Log (`/admin/audit`)

```
┌─ Audit Log ──────────────────────────────────────────────────┐
│                                                               │
│  ┌─ Filters ──────────────────────────────────────────────┐  │
│  │ Staff: [All ▾]  Action: [All ▾]  Resource: [All ▾]     │  │
│  │ Date: [Apr 1] to [Apr 23]                     [Apply]  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Log Table ────────────────────────────────────────────┐  │
│  │ Timestamp        │ Staff      │ Action         │ Detail │  │
│  │──────────────────┼────────────┼────────────────┼────────│  │
│  │ Apr 23 14:32:01  │ J. Smith   │ service.update │ SNAP   │  │
│  │ Apr 23 14:15:44  │ A. Torres  │ resident.view  │ ID:a3f │  │
│  │ Apr 23 13:55:12  │ J. Smith   │ report.export  │ Monthly│  │
│  │ Apr 23 13:22:08  │ M. Chen    │ rule.create    │ WIC    │  │
│  │ Apr 23 12:01:33  │ A. Torres  │ resident.export│ CSV    │  │
│  │ ...                                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Showing 1-50 of 12,847    [< 1 2 3 ... 257 >]              │
└───────────────────────────────────────────────────────────────┘
```

### 6.11 Staff Management (`/admin/staff`)

```
┌─ Staff Management ───────────────────────────────────────────┐
│                                                               │
│  ┌─ Staff List ──────────────────────── [+ Add Staff] ────┐  │
│  │ Name          │ Email              │ Role    │ Dept    │  │
│  │───────────────┼────────────────────┼─────────┼─────────│  │
│  │ Jane Smith    │ jane@austintx.gov  │ Admin   │ APH     │  │
│  │ Alex Torres   │ alex@austintx.gov  │ Manager │ Equity  │  │
│  │ Min Chen      │ min@austintx.gov   │ Admin   │ HSO     │  │
│  │ Pat Williams  │ pat@austintx.gov   │ Viewer  │ Budget  │  │
│  │ ...                                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Add/Edit Staff Dialog ────────────────────────────────┐  │
│  │ Azure AD User:  [Search by email...              ]     │  │
│  │ Display Name:   [Auto-populated from Azure AD    ]     │  │
│  │ Role:           [Admin           ▾]                     │  │
│  │ Department:     [Austin Public Health             ]     │  │
│  │                            [Cancel]  [Save]             │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## 7. Background Jobs & Data Pipeline

### 7.1 Jobs (Azure Container Apps Jobs)

| Job                          | Schedule                                       | Description                                                                             |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `refresh_analytics`          | Every 15 minutes                               | Refresh the `analytics_daily` materialized view                                         |
| `generate_embeddings`        | On-demand (triggered by service create/update) | Generate vector embeddings for new/updated services                                     |
| `service_review_check`       | Daily at 6:00 AM CT                            | Flag services past their `next_review_at` date                                          |
| `cleanup_anonymous_sessions` | Daily at 2:00 AM CT                            | Delete anonymous `intake_sessions` older than 30 days                                   |
| `generate_scheduled_reports` | Per schedule (configurable)                    | Generate and email scheduled reports                                                    |
| `cache_crisis_translations`  | On service catalog change                      | Pre-translate crisis resources into top 7 languages via GPT-5.4-mini and cache in Redis |

### 7.2 Caching Strategy (Redis)

| Cache Key Pattern                 | TTL                    | Content                                     |
| --------------------------------- | ---------------------- | ------------------------------------------- |
| `crisis:{language}`               | 24h (refreshed by job) | Pre-translated crisis resources             |
| `categories:tree`                 | 1h                     | Category hierarchy with service counts      |
| `service:{id}:detail`             | 15m                    | Full service detail (invalidated on update) |
| `analytics:overview:{date_range}` | 15m                    | Dashboard overview metrics                  |
| `map:pins:{bounds}:{categories}`  | 5m                     | Map pin data for viewport                   |

### 7.3 Backend Module Structure

```
backend/
├── alembic/                          # Database migrations
│   ├── versions/
│   └── env.py
├── app/
│   ├── __init__.py
│   ├── main.py                       # FastAPI app, middleware, lifespan
│   ├── config.py                     # Settings via pydantic-settings
│   ├── database.py                   # AsyncPG connection pool + helpers
│   ├── auth.py                       # Azure AD B2C + Entra ID validation
│   │
│   ├── ai_service.py                 # High-level AI ops with retry (extended)
│   ├── ai_providers/                 # Provider abstraction (from civic-ai-starter)
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── azure_openai.py
│   │
│   ├── intake/                       # Intake conversation domain
│   │   ├── __init__.py
│   │   ├── router.py                 # /api/v1/intake/* routes
│   │   ├── service.py                # Intake session management
│   │   ├── tools.py                  # Tool implementations for AI function calling
│   │   └── prompts.py                # System prompts and tool definitions
│   │
│   ├── services/                     # Service catalog domain
│   │   ├── __init__.py
│   │   ├── router.py                 # /api/v1/services/* routes (public)
│   │   ├── admin_router.py           # /api/v1/admin/services/* routes
│   │   ├── service.py                # Service CRUD operations
│   │   ├── search.py                 # Full-text + semantic search
│   │   └── models.py                 # Pydantic models
│   │
│   ├── matching/                     # Service matching engine
│   │   ├── __init__.py
│   │   ├── engine.py                 # Rules + semantic matching
│   │   ├── risk_assessment.py        # Risk factor identification
│   │   └── benefits_calculator.py    # Benefit value estimation
│   │
│   ├── residents/                    # Resident account domain
│   │   ├── __init__.py
│   │   ├── router.py                 # /api/v1/me/* routes
│   │   ├── admin_router.py           # /api/v1/admin/residents/* routes
│   │   ├── service.py                # Resident CRUD
│   │   └── models.py
│   │
│   ├── analytics/                    # Analytics & reporting domain
│   │   ├── __init__.py
│   │   ├── router.py                 # /api/v1/admin/analytics/* routes
│   │   ├── service.py                # Analytics query builders
│   │   ├── equity.py                 # Equity score calculation
│   │   └── reports.py                # Report generation (PDF/CSV)
│   │
│   ├── admin/                        # Admin-specific domain
│   │   ├── __init__.py
│   │   ├── staff_router.py           # /api/v1/admin/staff/* routes
│   │   ├── audit_router.py           # /api/v1/admin/audit-log route
│   │   ├── rules_router.py           # /api/v1/admin/rules/* routes
│   │   └── audit.py                  # Audit log helper
│   │
│   ├── map/                          # Map & geo domain
│   │   ├── __init__.py
│   │   ├── router.py                 # /api/v1/map/* routes
│   │   └── geo.py                    # Geocoding, distance calc, GTFS
│   │
│   └── models/                       # Shared Pydantic models
│       ├── __init__.py
│       ├── common.py                 # PaginatedResponse, ErrorResponse, etc.
│       ├── services.py
│       ├── intake.py
│       ├── residents.py
│       └── analytics.py
│
├── jobs/                             # Background jobs
│   ├── refresh_analytics.py
│   ├── generate_embeddings.py
│   ├── service_review_check.py
│   ├── cleanup_sessions.py
│   ├── generate_reports.py
│   └── cache_crisis_translations.py
│
├── tests/
│   ├── conftest.py
│   ├── test_intake/
│   ├── test_services/
│   ├── test_matching/
│   ├── test_admin/
│   └── test_analytics/
│
├── requirements.txt
├── Dockerfile
└── alembic.ini
```

### 7.4 Key Dependencies (additions to civic-ai-starter)

```
# Database
asyncpg>=0.29.0
alembic>=1.13.0
sqlalchemy>=2.0.0          # for Alembic migrations only (queries use raw asyncpg)
pgvector>=0.3.0            # pgvector Python bindings

# Auth
msal>=1.28.0               # Microsoft Authentication Library (token validation)
cryptography>=42.0.0       # JWT key handling

# Caching
redis[hiredis]>=5.0.0      # Azure Cache for Redis

# Geo
geopy>=2.4.0               # geocoding + distance calculations

# Reports
reportlab>=4.1.0           # PDF generation
openpyxl>=3.1.0            # Excel export

# Existing (from civic-ai-starter)
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
openai>=1.10.0
httpx>=0.26.0
python-jose[cryptography]>=3.3.0
tenacity>=8.2.0
python-dotenv>=1.0.0
```
