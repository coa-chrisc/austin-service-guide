# Security assessment: round 1

Date: 2026-11-16  
Reviewed revision: `5ddb504` (`main`)  
Purpose: handoff for remediation, followed by a fresh assessment of the patched code.

## Scope and method

Reviewed the React/Vite frontend, FastAPI resident and admin APIs, abuse defense, optional Realtime voice, partner import, research worker and fetcher, data pack, Docker image, and AWS/Azure/GCP/Vercel/Railway deployment starters. This is a source and local API assessment, not a penetration test of a municipal deployment or a certification of legal compliance. No production credentials or live resident records were used.

Assessment basis: [OWASP ASVS 5.0](https://asvs.owasp.org/) Level 2 for applicable web/API requirements, [OWASP Top 10:2025](https://top10.owasp.org/), [OWASP GenAI LLM Top 10:2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/), and [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final) for release process. The target is a control-by-control evidence matrix, not an unsupported claim of blanket compliance. ASVS Level 3 controls should be considered for any feature that handles regulated health data or privileged staff actions.

### Checks performed

| Check | Result |
| --- | --- |
| Backend pytest, including defense, PII, import, SSRF, job auth, privacy and headers | 1,239 passed; 4 deprecation warnings. Command: `cd backend && .venv/bin/python -m pytest -q` after installing declared worker/dev requirements into the ignored virtual environment. |
| Frontend Vitest | 598 passed, 2 skipped. Command: `cd frontend && npm test -- --run`. |
| Frontend production build | Passed. Command: `cd frontend && npm run build`. |
| Backend compile | Passed. Command: `cd backend && .venv/bin/python -m compileall -q app`. |
| Catalog and pack validation | 0 schema errors. Catalog: 87 unverified services, 101 unverified location hours. Full pack: 198 warnings, including four categories without matching-engine rules and six ZIP centroids missing. Run with the backend virtual environment: `cd backend && .venv/bin/python scripts/validate_catalog.py` and `scripts/validate_pack.py`. The `frontend` npm wrappers use system `python3` and failed here because PyYAML is not installed in that interpreter. |
| npm production dependency audit | 2 moderate package findings (`react-router` and its direct parent `react-router-dom`), representing two advisories in `react-router` 6.x. `npm audit --omit=dev --json`. The SSR advisory concerns an unused SSR path; the backslash open-redirect advisory requires a controllable navigation destination. The current navigation review found no direct arbitrary external target, but retain regression coverage or upgrade. |
| npm full dependency audit | 23 affected package entries: 2 critical, 9 high, 9 moderate, 3 low. The additional findings are in build/test tooling, notably Vitest/tinypool, Vite, Babel, PostCSS and Workbox dependencies. Audit package counts are not distinct exploitable vulnerabilities. `npm audit --json`. Do not blindly apply its suggested `vite-plugin-pwa` downgrade. |
| Railway tooling npm audit and typecheck | 0 advisory findings; typecheck passed after `npm ci --prefix .railway`. |
| Python declared runtime plus worker requirements | `pip-audit -r backend/requirements-worker.txt`: 0 known findings for current resolution. The older local virtual environment also contains `python-jose` and `ecdsa` with advisories, but those are not declared or imported by this project (`backend/tests/test_dependencies.py` confirms their removal); do not count them as production findings. |
| Bandit backend scan | 8 alerts. The one high alert is SHA-1 in `research/pipeline.py` used only as a fetch-step deduplication key, not a security digest. Other alerts concern demo random data, exception handling and false hardcoded-password matches. No confirmed exploit from this scan. |
| Gitleaks Git history scan | No leaks reported across 199 scanned commits. This does not prove that deployed secrets were never exposed elsewhere. |
| Trivy configuration scan | Root app Dockerfile: two `RUN cd` style warnings. AWS starter: public ALB (intentional), HTTPS egress to all addresses (a real exposure to assess), missing customer-managed CloudWatch log key, and five missing rule descriptions. SearXNG wrapper: no explicit non-root `USER` or `HEALTHCHECK`; inherited image runtime identity must be checked before treating the first as a vulnerability. No findings were reported for the GCP YAML in the rules scanned. Trivy 0.71 skipped one policy requiring 0.72; it also traversed untracked `.claude/worktrees`, whose duplicate results were excluded from this summary. |
| Local API probes | Unauthenticated `GET /api/v1/admin/residents` returned 200; `/docs` returned 200 without a CSP; debug sessions returned 404 by default and 200 without authorization after `REALTIME_DEBUG_LOG_ENABLED=true`; intake start and admin eligibility evaluate responses had no `Cache-Control`; `/api/v1/services` accepted a search term containing an email address. |

Docker image scanning and cloud runtime testing were unavailable because the local Docker daemon was stopped and no municipal cloud environment was supplied. Live model and vendor abuse tests were not run. Re-run those in an isolated staging deployment before release.

## Findings and remediation tickets

Priority means release risk for a municipal public-health deployment. **P0** blocks handling real residents; **P1** should be fixed before public rollout of the affected feature; **P2** belongs in the hardening backlog. A conditional finding applies only if its feature is enabled. The repository's existing [SECURITY.md](../SECURITY.md) names several of these gaps; this document turns them into acceptance tests.

### ASG-SEC-01 — Staff identity and authorization are demo-only (P0)

**Evidence.** `backend/app/routers/admin.py` allows every admin GET without authentication and accepts `X-Staff-Role` without enforcing it. `backend/app/routers/admin_auth.py` uses one shared `X-Admin-Token` for writes. `frontend/src/hooks/useAuth.tsx` treats editable `localStorage` flags as staff login. `backend/app/routers/admin_jobs.py` forwards a self-declared role as the research job actor. Today the open resident/admin data is synthetic, so this is a production design blocker rather than an observed leak of real resident records.

**Remediation.** Add server-verified municipal SSO (OIDC with trusted issuer/audience/signature and expiration), a server-side staff role policy, and route-level authorization for reads, edits, exports, imports and research jobs. Derive the audit actor from the verified identity. Remove shared-token authorization and browser-auth flags from production paths; the demo mode can remain explicitly isolated. Keep resident access anonymous unless the product separately requires accounts.

**Acceptance.** An unauthenticated or forged-role caller gets 401/403 for every staff endpoint; viewer/editor/reviewer/admin permissions are exercised as a route matrix; identity is visible in tamper-resistant audit events; tests prove one tenant cannot access another tenant's pack or jobs if multi-city hosting is added.

### ASG-SEC-02 — Public cost controls are per process (P1)

**Evidence.** `backend/app/config.py` permits only `DEFENSE_STORE=memory`; `backend/app/defense/limits.py` and `budget.py` count per instance. `SECURITY.md` documents that cold starts and replicas multiply limits, and `BUDGET_USD_GLOBAL_*` defaults to zero (off). AWS/GCP/Azure starters do not provision WAF or a shared enforcement store. This weakens protection for OpenAI calls and the SMS/email relay.

**Remediation.** Implement an atomic shared limiter/budget store or an equivalent managed gateway; fail closed for costly operations when it is unavailable. Set environment-specific vendor hard spend limits and edge rules. Add alerting for refusals, spend, challenge failures and breaker changes. Keep crisis resource access available when paid features degrade.

**Acceptance.** A load test spread over multiple instances shows one global and per-principal ceiling; store outage blocks voice mint and sharing; vendor limits are documented and exercised; abuse events alert without logging resident text.

### ASG-SEC-03 — Realtime voice cannot enforce session usage (P1, conditional)

**Evidence.** `backend/app/routers/intake.py` mints a browser-held Realtime client secret and `SECURITY.md` states the client can update session instructions/tools. The configured 600-second reservation limits mints, not the duration or content of the resulting direct browser-to-OpenAI session. Raw audio is unredacted before OpenAI receives it.

**Remediation.** Keep `realtime_audio` disabled for municipal rollout until a server-controlled session broker or provider-enforced time, tool and spend limits exist. Bind tool invocations to a server-authorized session and constrain allowed operations. Confirm vendor retention/contract terms and obtain a reviewed consent flow before enabling raw audio.

**Acceptance.** A modified client cannot run beyond the configured time/cost allowance or alter permitted tools; session revocation works; raw-audio and transcript data flows are verified in staging. Default on-device voice remains available where the browser supports it.

### ASG-SEC-04 — Voice debug endpoints are public when enabled (P1, conditional)

**Evidence.** `backend/app/routers/intake.py` exposes `GET /realtime/debug/sessions`, `GET /realtime/debug/{trace_id}` and `POST /realtime/debug` behind only `REALTIME_DEBUG_LOG_ENABLED`. A local API probe returned 200 for sessions without a credential once enabled. `backend/app/services/realtime_debug.py` writes a file with no rotation/expiry and reads it linearly. Its redaction is pattern-based and trace IDs are not redacted.

**Remediation.** Remove HTTP debug routes from production or require verified staff authorization, rate limits and a local-only feature gate. Bound file size, rotate and expire logs, and stop accepting arbitrary client detail if the feature remains. Do not put the debug path on a read-only production root filesystem.

**Acceptance.** An anonymous request is denied even if debugging is mistakenly enabled; bounded writes and reads cannot fill disk or monopolize a worker; traces expire; tests include uncommon identifiers that pattern redaction may miss.

### ASG-SEC-05 — Sensitive search terms enter URLs and a persistent cache (P1 privacy)

**Evidence.** `backend/app/routers/services.py` accepts arbitrary `search` query text without server-side redaction; the browser scrub in `frontend/src/lib/piiGuard.ts` covers only its own UI. `frontend/vite.config.ts` configures Workbox `StaleWhileRevalidate` for `/api/v1/services`, which includes searches. The browser Cache API keys entries by request URL. Direct callers can therefore put an identifier in a URL that may be retained in proxy logs, browser history and the service-worker cache. `frontend/src/lib/session.ts` clears an old `intake-results` cache but not `services-catalog`.

**Remediation.** Prefer a bounded POST search body for free text and disable caching of search requests. Cache only fixed, non-personal catalog URLs; use explicit cache rules and short retention. If GET search must remain, cap and server-redact its term and document the unavoidable URL exposure. Clear legacy search cache entries on upgrade and Start over.

**Acceptance.** A test search containing an email, phone or address is absent from cache keys and application/proxy logs; direct API callers receive the same protection as the UI; catalog browsing without free text still works offline if desired.

### ASG-SEC-06 — Resident and staff responses lack explicit no-store (P1 privacy)

**Evidence.** Local API probes found no `Cache-Control` on `POST /api/v1/intake/start` and `POST /api/v1/admin/eligibility/evaluate`. Most intake and admin route responses use FastAPI defaults. `backend/app/access_gate.py` changes `public` to `private` for gated responses but does not add `no-store`. The resident state is returned in API responses and may describe sensitive circumstances.

**Remediation.** Set `Cache-Control: no-store` on every intake response, staff response, defense token response, error containing user input, and optional voice debug response. Review CDN/proxy settings as well as browser behavior. Keep immutable caching only for hashed static assets and approved public catalog responses.

**Acceptance.** Automated tests assert the header on success and failure paths, including behind the access gate; a staging proxy test confirms no resident or staff response is stored in shared caches.

### ASG-SEC-07 — Client-held intake state needs an explicit privacy decision (P0 decision)

**Evidence.** `frontend/src/lib/session.ts` saves the redacted conversation, profile and plan in `sessionStorage`, and `backend/app/models.py` accepts that state on each request. Redaction cannot remove every name or sensitive circumstance. [ASVS 5.0 V14.3.3](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x23-V14-Data-Protection.md) calls for sensitive data to be absent from browser storage other than session tokens. The current design does not meet that target if the profile is classified as sensitive.

**Remediation.** With the municipal privacy owner, classify the data and decide whether intake is memory-only (lost on refresh), a separately protected server-side session, or a documented ASVS exception. Test shared-computer, tab duplication, crash restore and browser extension exposure. Do not describe `sessionStorage` as secure storage.

**Acceptance.** The chosen design and retention period are documented; tests prove Start over and session termination clear all relevant client state; the ASVS control is met or its exception and compensating controls are formally recorded.

### ASG-SEC-08 — Dependency and release chain are not reproducible enough (P1 process)

**Evidence.** `backend/requirements.txt`, `backend/requirements-worker.txt` and root `pyproject.toml` specify lower bounds without a lock or hashes; `Dockerfile` uses moving base-image tags. No tracked `.github` workflow was found. Current declared Python resolution had no known advisory, but a rebuild can select different packages. The npm lock currently reports 2 moderate production package entries and 23 entries with dev tools included.

**Remediation.** Lock Python dependencies separately for runtime and worker and keep Vercel/container installs aligned. Pin base images by digest with an update policy. Add CI gates for tests, SCA, secret scan, SAST, SBOM and container/IaC checks. Upgrade React Router after testing route behavior. Triage build-tool advisories by actual exposure; update affected tools or document a time-bounded exception. Avoid `npm audit fix --force` without reviewing breaking changes.

**Acceptance.** Clean builds resolve identical package versions; scans run on PR and release builds; no untriaged high/critical advisory ships in the production artifact; dev-tool advisories have an owner and deadline; an SBOM is attached to each release.

### ASG-SEC-09 — Production configuration can silently retain demo defaults (P1)

**Evidence.** `backend/app/config.py` defaults CORS to localhost origins with credentials allowed; `backend/app/main.py` leaves `/docs`, `/redoc` and OpenAPI enabled. `/docs` omits CSP because it loads CDN assets. `/api/v1/health` publicly reports version and AI configuration. `backend/app/jobs/settings.py` accepts an `http://` remote worker URL even though `jobs/proxy.py` describes HTTPS. Cloud files in `deploy/` are explicitly starter templates. Trivy flagged the AWS starter's public ALB (expected for this design), unrestricted HTTPS egress and lack of a customer-managed log encryption key; these need deployment-specific review, not automatic suppression. Its SearXNG root-user warning needs image-runtime verification because the wrapper inherits an upstream image.

**Remediation.** Add a production mode that rejects unsafe CORS origins, debug logging, raw audio without explicit approval, weak/missing defense secrets and public HTTP worker URLs. Disable interactive API docs by default in production or self-host their assets under CSP. Trim public health metadata. Publish and test a per-platform deployment profile, including trusted proxy behavior, WAF, TLS, secrets, logging, egress, backups and preview protection.

**Acceptance.** A misconfigured production boot fails with an actionable error; staging checks verify headers, origin policy, HTTPS, worker isolation, preview access, and log retention. No deploy guide presents the demo gate as staff authentication.

### ASG-SEC-10 — Catalog and free-text AI claims need a safety gate (P0 content)

**Evidence.** Current validation reports 87 unverified services and 101 unverified hours. `SECURITY.md` explains that catalog cards are grounded, while AI replies, plan summaries and per-item reasons are length-capped/redacted but not fact-checked. `validate_pack.py` also reports four categories without engine rules and six missing ZIP centroids. These can misdirect residents even if the API is technically secure.

**Remediation.** Require staff verification of each municipal data pack before publication, including phone, address, eligibility, hours, source date and crisis resources. Set freshness and re-review intervals and fail release validation when required fields are missing. Keep model prose narrowly tied to cited catalog facts; add adversarial tests for fabricated eligibility/contact details and unsafe health claims, with human review of failures.

**Acceptance.** Strict pack validation passes for the target municipality, category/ZIP warnings are resolved or deliberately documented, and a sampled content audit confirms the highest-impact services and crisis contacts. Live model tests pass in staging with the exact deployed prompts and model.

### ASG-SEC-11 — Vendor, retention and agency controls remain outside the code (P0 governance)

**Evidence.** `docs/PRIVACY.md` and `SECURITY.md` identify the lack of reviewed vendor terms, OpenAI zero-data-retention confirmation, privacy-office notice approval, translated notices, production log review and a determination about protected health information. `store=False` is not a zero-retention agreement.

**Remediation.** Agency counsel/privacy/security owners should approve data classification, vendor agreements and service configurations, notices and translations, records retention, incident response, and whether HIPAA or other obligations apply. Keep raw-audio mode off until its specific data path is approved. Verify platform and vendor logs and deletion behavior in the actual tenancy.

**Acceptance.** Signed decisions and configuration evidence are linked from the deployment record. Any feature lacking approval stays disabled. Code review alone cannot close this item.

## What appears to be working

The review found meaningful existing controls: strict intake state bounds and a 256 KiB edge limit; server-side re-redaction and catalog grounding; opt-in raw-audio gating; a constrained import parser with zip and formula protections; worker request signatures with replay checks; an SSRF-aware fetcher with tests; response security headers; a non-root container; and broad backend/frontend regression coverage. Tests passing does not establish that all misuse cases are covered. The next assessment should retest these controls after changes.

## Recommended handoff order

1. **Identity and privacy architecture:** ASG-SEC-01, 07, 11. These decide the production trust model and must precede staff data or resident persistence.
2. **Public abuse and conditional voice:** ASG-SEC-02, 03, 04. Keep raw audio/debug off until their controls are verified.
3. **Cache and search privacy:** ASG-SEC-05, 06, with local API and browser service-worker regression tests.
4. **Build and configuration:** ASG-SEC-08, 09, with CI and a hardened deployment profile.
5. **Content safety:** ASG-SEC-10, owned jointly by engineers and municipal service SMEs.

Each remediation PR should cite its ticket, include the failing-before/fixed-after test, state whether it changes resident intake, admin, or deployment behavior, and update `SECURITY.md` plus the relevant deployment guide. After these land, repeat all checks above against the new revision, run an isolated staging DAST and live-model red team, inspect the deployed image and cloud settings, and update the finding status to **closed**, **accepted exception**, or **open** with evidence. An independent penetration test is appropriate before the first municipal production launch.
