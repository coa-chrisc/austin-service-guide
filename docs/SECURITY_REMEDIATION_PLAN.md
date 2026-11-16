# Security remediation plan

Responds to [SECURITY_ASSESSMENT_2026-11-16.md](SECURITY_ASSESSMENT_2026-11-16.md), which reviewed `5ddb504`.

## Where things stand

The live demo serves synthetic admin data and an unverified catalog behind access codes. It exists to show what the product can do. It is not ready to handle real residents. This plan sets out what has to change before an agency runs it for real residents. It is written so that the target agency's choices stay open: its identity provider, its cloud, and whether central IT will connect the app to the agency's tenant. The demo does not wait on any of this work.

Design principles:

- **Provider-neutral.** Nothing here assumes Microsoft, Amazon or Google. Each integration sits behind a small interface with a working built-in default.
- **Works without central IT.** An agency must be able to run the app even if IT never federates it into the agency's single sign-on.
- **Off until approved.** A feature whose controls or approvals are missing stays off by configuration, not by convention.
- **Crisis access never degrades.** No control in this plan may hold back crisis lines.

## Finding by finding

### ASG-SEC-01: staff identity and authorization (P0)

**Approach:** one staff identity layer with interchangeable providers, plus a server-side role policy.

- **Built-in accounts (the default, no IT needed).**
  - Staff accounts are stored in the app's database. Passwords are hashed with Argon2id, and a TOTP second factor is required.
  - The first admin is created with a one-time CLI bootstrap command. After that, admins invite staff by email or link.
  - Lockout and reset flows are included. Sessions are short-lived, server-side and held in an HttpOnly cookie.
- **OIDC (optional, any compliant identity provider).** Microsoft Entra ID, Google Workspace, Okta, AWS Cognito or Login.gov. The server checks the issuer, audience, signature and expiry, and maps provider groups to app roles. SAML can be added later behind the same interface if an agency needs it.
- **Roles enforced on the server** for every staff route, reads included: `viewer`, `editor` (catalog and eligibility), `reviewer` (approves research and import drafts), `admin` (users and settings). The audit log records the verified identity, never a header the client sent.
- **Demo isolation.** Today's open console stays available only when `DEMO_STAFF=true`, and production mode (ASG-SEC-09) refuses to start with it on. The shared `X-Admin-Token` header is removed from production paths.
- **Needs from the agency:** which provider to use, if any; group names; the account policy.

### ASG-SEC-02: public cost controls are per process (P1)

- **Shared store.** Implement the planned `DEFENSE_STORE=postgres`; the store interface already exists. Hosted Postgres works: Supabase is available now, and a TLS-exposed Railway Postgres or the agency's managed Postgres would also do. Counters are updated atomically with single SQL upserts.
- **Fail closed** for voice and sending when the store is unreachable. Chat falls back to the scripted flow. Crisis is unaffected.
- Spend, refusal and breaker alerts (#30). Set vendor hard spend limits for each environment and document them.

### ASG-SEC-03: Realtime voice usage is not enforced (P1, conditional)

- Server-brokered voice sessions (#29). Until then, raw-audio voice stays off outside demos. On-device voice (`intercepted_text`) remains the default.

### ASG-SEC-04: voice debug endpoints (P1, conditional)

- Require staff authorization and a local-only flag. Cap the log's size, rotate it and expire it. Stop accepting free-form client detail.

### ASG-SEC-05: search terms in URLs and the service-worker cache (P1 privacy)

- Move free-text search to a POST with a capped size, redacted on the server. Never cache search responses; cache only fixed catalog URLs. Clear the old `services-catalog` cache on upgrade and on Start over.

### ASG-SEC-06: no `Cache-Control: no-store` (P1 privacy)

- A middleware sets `no-store` on intake, staff, defense, debug and error responses, including those behind the access gate. Tests cover both success and failure paths.

### ASG-SEC-07: intake state held in the browser (P0 decision)

- **Options:**
  1. Memory only: a refresh loses progress.
  2. Memory by default, with an opt-in "keep my progress in this tab".
  3. An encrypted server-side session with a short time-to-live.
  4. Today's `sessionStorage`, recorded as a formal exception.
- **Recommendation:** option 2. It needs no server storage and keeps the stateless design.
- **The decision belongs to** the agency's privacy owner.

### ASG-SEC-08: dependency and release chain (P1 process)

- Lock files with hashes: runtime and worker Python separately, with the Vercel `pyproject.toml` kept in sync. Base images pinned by digest.
- GitHub Actions CI: tests, `pip-audit`, `npm audit` triage, gitleaks, Bandit/Semgrep, Trivy, and an SBOM for each release. Upgrade React Router.

### ASG-SEC-09: production can keep demo defaults (P1)

- **`APP_ENV=production` refuses to start when:**
  - CORS origins are localhost;
  - `DEMO_STAFF` or debug logging is on;
  - the defense secrets are missing;
  - the worker URL is `http://`;
  - raw audio is on without an explicit approval flag.
- **In production, `/docs` is off and `/health` is trimmed.**
- **Each hosting platform gets a deployment profile:** Vercel, Railway, AWS, Azure and GCP.

### ASG-SEC-10: content safety (P0 content)

- **Staff verification:** a workflow in the admin console with source dates and re-review intervals.
- **`validate:pack --strict`** must pass before an agency's pack goes live. Fix the 4 categories that have no matching rules and the 6 missing ZIP locations.
- **An offline set of adversarial prompts** tests for invented eligibility, made-up contact details and unsafe health claims. It runs against the deployed prompt and model, and people review the failures.

### ASG-SEC-11: vendor, retention and agency approvals (P0 governance)

- A deployment record template with one line per required sign-off: data classification, vendor terms and zero-data-retention, notices and translations, retention, incident response, and the HIPAA determination. Each line links to its evidence. Features without approval stay off. Code alone cannot close this item.

## Order of work

| Wave | Items | When |
|---|---|---|
| 1. Hardening, no design decisions | 04, 05, 06, 08, 09 | After the grant recording |
| 2. Identity and shared store | 01 (built-in accounts first, then OIDC), 02 (Supabase Postgres) | When a pilot agency is in view |
| 3. Agency decisions | 07, 10, 11, 03 | With the pilot agency's privacy, IT and service owners |

Each PR names its ticket, includes a test that failed before the fix and passes after, and updates `SECURITY.md`, the How it works page and the deployment guide. After the waves land, rerun every check in the assessment, followed by a staging DAST, a live-model red team and an independent penetration test before the first municipal launch.
