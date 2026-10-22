# Security

This page summarizes the security posture of the Austin Service Guide as it exists in this repository. It is written to be checked against the code: each claim names the file (and function where useful) that enforces it, and each protection states its limits.

This is a **demonstration application**, not a production system. The "Known gaps before production" section lists what is missing. Privacy details (what is collected, what goes to OpenAI) are in [docs/PRIVACY.md](docs/PRIVACY.md). Component and data-flow detail is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Threat model summary

| Asset or input | Threat | Main controls in this repository | Residual risk |
| --- | --- | --- | --- |
| Resident data (what a resident types or says) | Identifiers (name, SSN, address, phone) reach a model, a log, or a third party | Server keeps no intake state; deterministic redaction before storage or any model call; client pre-flight scrub; logging policy | Redaction is pattern-based and misses some identifiers. In the opt-in `realtime_audio` voice mode, audio cannot be redacted before OpenAI hears it. Default voice depends on browser on-device recognition. No OpenAI zero-data-retention agreement is in place. |
| Client-held intake state | A tampered or oversized state sent to the server | Strict schema with size caps, re-redaction, re-grounding, 256 KiB body limit | The state is not signed. A resident can edit their own state; the server treats it as untrusted input and never as a source of truth for catalog facts. |
| Model output | The model invents a service, a phone number, or a plan item | Grounding gate on every service id; cards and contact details render only from catalog records | The model still writes free-text replies, plan summaries and per-item reasons. These are length-capped and redacted, but **not fact-checked**. |
| Catalog integrity | Wrong or stale service data shown as fact | JSON Schema plus validator script | All 87 services are currently **unverified**: no `last_verified_date` or `verified_by` is recorded, and 101 locations have `hours_verified: false`. |
| Admin console | Unauthorized catalog changes or data access | Catalog writes need `X-Admin-Token` | Admin auth is a demo stub. Admin reads are open and serve synthetic data. |

## Implemented hardening (in this repository)

### 1. Stateless execution

The backend keeps no intake sessions. The browser holds the intake state and sends it with every intake request. The server rebuilds a working session from it, responds, and keeps nothing.

- **Where the state lives.** `frontend/src/lib/session.ts` stores `IntakeState` (version 1) in `sessionStorage` under `asg.intake.state` (and `asg.intake.resultsView`). It never uses `localStorage` for intake data. If `sessionStorage` is blocked, an in-memory copy keeps the page working until it is closed.
- **How the server treats it.** `IntakeState` in `backend/app/models.py` is a Pydantic model with `extra="forbid"` and caps: 200 messages, 10,000 characters per message, profile string and list caps, 50 matched service ids. `session_from_state` in `backend/app/services/intake_state.py` then re-redacts every message and every profile string, re-grounds ids against the catalog, and recomputes risk flags from the profile.
- **Body limit.** `IntakeBodyLimitMiddleware` in `backend/app/middleware.py` rejects intake `POST`/`PUT`/`PATCH` bodies over 256 KiB with 413, including chunked bodies that send no `Content-Length`.
- **No session identifiers.** Intake routes under `/api/v1/intake` take no session id, and there are no shareable results links. `SESSION_TTL_HOURS` was removed. `backend/tests/test_stateless_intake.py` checks that a full intake leaves no module-level state, that interleaved intakes stay isolated, that old session stores are gone, and that oversized bodies get 413.
- **Clearing.** The header "Start over" button (`frontend/src/components/layout/StartOverButton.tsx`, via `clearIntakeState`) removes every `asg.intake.*` key, the legacy `asg.activeSession` `localStorage` key, and the legacy `intake-results` service-worker cache that older builds used. That cache is also purged on page load. Closing the tab clears `sessionStorage` too.

Limits: the state is held in the resident's browser, so anyone with access to that browser tab can read it. Nothing signs or encrypts the state. The server cannot recall or delete it, because the server never holds it.

### 2. Structured navigation first

The landing page leads with need chips, a ZIP select and a language selector, so a resident can reach relevant services without typing anything personal (`frontend/src/components/landing/NeedNavigator.tsx`, `frontend/src/components/common/catalogFilters.ts`). Chat and voice are the secondary path. The chips are Food & Nutrition, Healthcare & Clinics, Housing & Utilities, Maternal & Child Health, Financial & Benefits Assistance, and Mental Health & Support.

Limits: the catalog has no maternal-health category, so "Maternal & Child Health" opens the `childcare` category. It has no financial-assistance category either, so that chip runs a keyword search ("financial assistance"). The chips are navigation shortcuts, not an eligibility check.

### 3. Deterministic PII guard (client and server edge)

`backend/app/services/pii.py` is the authority. It removes, with fixed patterns and no AI involved: Social Security numbers (including ITIN when an SSN/ITIN keyword is present), payment cards (Luhn-checked), email addresses, phone numbers, street addresses and P.O. boxes, dates of birth after a keyword, ID/member numbers after a keyword, and names after a self-identification phrase. Each is replaced by a placeholder such as `[name removed]`. The redactor returns the cleaned text and the types found, never the removed values.

Name rule: names are removed after "my name is", "my name's", "me llamo" and "mi nombre es" in any letter case (up to three tokens, stopping at function words), and after "I am", "I'm" or "this is" only when two or three capitalized, non-stoplisted words follow. The separator may be whitespace (including non-breaking space and newlines) or a colon, comma or dash.

- **Server edge.** Applied to typed chat in `process_message` (`backend/app/services/ai.py`), to every message and profile string when state is rebuilt (`session_from_state`), to voice transcripts when they are synced back (`record_realtime_transcript` in `backend/app/services/realtime.py`), and to every string in the opt-in debug log (`_sanitize_debug_value` in `backend/app/services/realtime_debug.py`).
- **Client pre-flight.** `frontend/src/lib/piiGuard.ts` (`inspectForPII`, `scrubPII`) mirrors the server rules. The chat input (`ChatInterface.tsx`) and the directory search (`ServiceDirectory.tsx`) scrub before sending and show a notice. The server still redacts independently.
- **Parity check.** `backend/tests/fixtures/pii_cases.json` (160 cases) is run by both `backend/tests/test_pii.py` and `frontend/src/lib/piiGuard.test.ts`, which checks that both implementations give identical output.

Limits, all real: names without a self-identification phrase ("Maria Lopez here"); addresses without a house number or street suffix; spoken-number patterns beyond the supported phrasings (spelled-out digit runs and spoken street numbers are covered, see below; unusual phrasings can still be missed); raw voice audio in `realtime_audio` mode (see below); and sensitive situations described in plain language, which pass through on purpose because they are often the reason the resident is here. Known over-redaction: a lowercase word right after "my name is <name>" may be removed.

Voice has two modes, set by `VOICE_PIPELINE_MODE` (`backend/app/config.py`). The effective mode is served by `GET /api/v1/intake/voice-config`.

- **`intercepted_text` (default).** No raw audio leaves the device. The browser recognizes speech on-device (Web Speech `SpeechRecognition` with `processLocally=true`) and refuses to fall back to cloud recognition. The final transcript is scrubbed in the browser (`piiGuard.ts`), shown to the resident, and sent through the normal text path (`/api/v1/intake/message`), where the server redacts it again before any model call. Replies are spoken with on-device `speechSynthesis` voices only (`localService` voices); phone numbers, street addresses, URLs, emails and eligibility or income-threshold sentences are removed from model text before speaking, and contact details are spoken only from catalog records. Limits: on-device recognition currently needs a recent Chromium browser with the language pack installed (the resident may be offered an explicit download); other browsers get text-only, with a message telling the resident to type. The transcript still goes to OpenAI as text after redaction, with the same pattern-based limits as typed chat. Spoken-number redaction is pattern-based and can miss unusual phrasings.
- **`realtime_audio` (opt-in).** Streams raw microphone audio to OpenAI's Realtime API over WebRTC using an ephemeral client secret. It is enabled only when `VOICE_PIPELINE_MODE=realtime_audio` AND `ALLOW_RAW_AUDIO_STREAM=true` (and live AI is on). Otherwise `realtime/client-secret`, `realtime/tool` and `realtime/transcript` return 403 before doing any work. The server never sees the audio, so it cannot redact it before OpenAI hears it. Transcripts are redacted when synced back, and Realtime tracing is turned off (`"tracing": None` in `build_realtime_session_config`). This mode is intended only for deployments with an OpenAI zero-data-retention agreement. The app does not check for or verify that agreement; it is the operator's contractual responsibility. The UI shows a "Raw audio streamed to OpenAI" badge and asks for consent before the first start in each page session.

A "Clear voice session" button stops recognition or WebRTC, stops all microphone tracks, cancels speech output and clears the live transcript and voice state. It does not erase the text chat (Start over does that).

### 4. Catalog grounding

`ground_service_ids` in `backend/app/services/grounding.py` drops any service id or slug that is not in the loaded catalog. It runs wherever ids enter: model tool arguments (`backend/app/services/tools.py`), client state (`hydrate_matches` and `_ground_plan` in `intake_state.py`), plan items (`backend/app/services/plan.py`), the share endpoint, and results hydration. Only the count of dropped ids is logged, never the values.

Result cards and contact details are built from catalog records, so the model cannot supply a phone number or address for a card. The share message is built the same way (`_share_text` in `backend/app/routers/intake.py`).

Limit: the model still writes the conversational reply, the plan summary and the per-item reasons. Those are redacted (assistant rules), length-capped, and grounded to matched services, but their wording is **not fact-checked**. A reply could state something the catalog does not say.

### 5. White-label configuration

Branding and city-specific copy are data, not code. `config/city.config.json` is the active config, validated against `config/city.config.schema.json`. Presets live in `config/presets/` (`austin-travis-tx.json`, `bchc-demo-city.json` for a fictional "Metro Public Health", and `cedar-ridge-county.json` for a fictional county). The `CITY_CONFIG` build variable (or the `CITY_PRESET` alias) selects one; `frontend/plugins/cityConfigPlugin.ts` validates it and fails the build on an unknown preset or on text below 4.5:1 contrast. The backend reads the same file for its greeting and prompt identity line. The config drives the palette and fonts, PWA manifest, page title, header, footer and logo, the privacy notice text, contact links and map center.

Not yet configurable: the backend model prompts and greeting (`prompts.py`, `realtime.py`, `scripted.py`) are Austin-specific, and so are the catalog, crisis resources, life events, personas, and the admin console's demo data. A second city today also needs those replaced.

### 6. Container and infrastructure-as-code templates

- `Dockerfile`: multi-stage build, non-root user (uid 10001), `HEALTHCHECK`. FastAPI serves the built SPA when `STATIC_DIR` is set (`backend/app/spa.py`).
- `docker-compose.yml`: read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`.
- `deploy/aws/ecs-fargate.tf`, `deploy/azure/container-app.bicep`, `deploy/gcp/cloud-run.yaml`: starter templates.

What was actually run is listed in [deploy/README.md](deploy/README.md): `docker build` and a container run (healthy, uid 10001), `terraform validate`, `az bicep build`, and a YAML parse. The templates have **not** been applied to live cloud accounts. They are starting points, not a reviewed production configuration.

### 7. Logging policy

- No resident text in application logs. `backend/tests/test_stateless_intake.py::test_resident_text_never_logged` captures logs during an intake and checks for it.
- Error logs record exception type names and counts, not messages: for example `ai.py` (`_route_user_turn`), `plan.py`, `tools.py`, and `grounding.py`.
- `backend/app/services/notify.py` masks recipients (last two characters only) and logs only the HTTP status and a Twilio error code or SendGrid field path on failure, never the response body.
- The opt-in voice debug log (`REALTIME_DEBUG_LOG_ENABLED`, off by default) writes redacted, length-clipped events to a file, keyed by a random client trace id, and keeps nothing in memory (`backend/app/services/realtime_debug.py`). With it off, the debug endpoints return 404. With it on, the file has no expiry; delete it when finished.

Limit: platform logs (load balancer access logs, proxy logs) are outside the application and are not configured here. The AWS template, for example, enables no ALB access logs.

### 8. OpenAI usage

- Every Responses API call passes `store=False` (`ai.py`, `plan.py`). The agent loop requests `reasoning.encrypted_content` so reasoning items can be replayed inside one turn; they are not kept across turns.
- The OpenAI client is built server-side from the API key only. No inbound request headers (for example `X-Forwarded-For`) are forwarded.
- The Realtime client secret is minted server-side (`create_realtime_client_secret` in `routers/intake.py`) and expires after `OPENAI_REALTIME_SECRET_TTL_SECONDS` (default 600).

Limit: `store=False` is not zero data retention. There is no per-request zero-data-retention setting in the OpenAI API. Zero data retention is an organization- or project-level agreement with OpenAI, and none is in place for this demo. See "Known gaps".

## Known gaps before production

These are not implemented. Do not treat the demo as ready for real resident data until they are addressed.

1. **Authentication and authorization.** Staff identity (for example Entra ID) with role-based access. Today `X-Staff-Role` is read but not enforced, admin `GET` routes are open (they serve synthetic data), and the staff "login" in the console is simulated in the browser. Admin catalog writes require `X-Admin-Token` matching `ADMIN_API_TOKEN`, compared in constant time; with the token unset, writes are refused. That is a shared-secret stopgap.
2. **Vendor agreements.** A data processing agreement with OpenAI, Twilio and SendGrid. If any data could be protected health information, a HIPAA BAA review, including which OpenAI endpoints (Responses, Realtime, transcription) a BAA would cover. Nothing in this repository makes the app HIPAA compliant.
3. **OpenAI zero data retention.** Apply for Zero Data Retention (or the current equivalent) for the project and confirm it covers Realtime. This is required before enabling `realtime_audio` voice, and the app cannot verify it. By default OpenAI may keep API inputs and outputs for a limited time for abuse monitoring, even with `store=False`.
4. **Rate limiting and WAF.** None exists in the application or the templates. The intake endpoints call a paid model API, so they need request throttling and abuse protection at the edge.
5. **Catalog verification.** `python backend/scripts/validate_catalog.py` (`npm run validate:catalog` from `frontend/`) reports 0 errors, 87 unverified services and 101 locations with `hours_verified: false`. `--strict` promotes the unverified warnings to errors, so it fails until staff record verification. Until then the catalog must not be described as verified.
6. **Privacy-office review of notices.** The wording of the AI notice, the privacy notice and the voice notice has not been reviewed by a privacy office.
7. **Translation of the privacy notice.** The city-config privacy notice (`serviceGuide.copy.privacyNotice`) is English-only. The greeting notice and redaction notice are translated for Spanish, Vietnamese, Chinese and Arabic only (`backend/app/services/i18n.py`).
8. **Retention and logging review.** Any persistent store added later needs encryption and a records-retention decision. Confirm no recipients, transcripts, or upstream response bodies reach production logs, and keep the voice debug trace off.
9. **Broader PII review.** Pattern redaction is a safety net, not a complete control. Add a review of free-text identifiers the risk assessment cares about (see roadmap item 3).
10. **Cloud deployment review.** The IaC templates are not applied to live accounts and need review against the city's own network and security standards.

## Phase 2 grant-funded engineering roadmap

The three items below are **future work. None of them is implemented in this repository.**

### 1. AI Onboarding & Ingestion Agent

Goal: let a new city turn the messy source material it already has (spreadsheets, PDFs, web pages of program listings) into catalog entries without hand-typing 80-plus YAML files.

- Input: municipal spreadsheets and PDFs in whatever shape they exist.
- Output: draft entries in the existing catalog format, one YAML file per service under `backend/app/data/services/`.
- Hard requirement: every draft must pass `backend/scripts/validate_catalog.py` against `config/services.schema.json` (including the cross-reference rules the schema cannot express) before it is accepted into the review queue. Drafts that fail are returned with the validator's errors, not edited silently.
- Drafts are marked unverified. They never publish on the strength of the agent alone (see item 2).

### 2. Human-in-the-Loop SME Verification Portal

Goal: make "verified" mean a named person checked it.

- Designated public-health staff review each AI-extracted or changed entry against its source and sign off in a portal.
- Sign-off writes `last_verified_date` and `verified_by` (the fields the validator already looks for) and, for locations, `hours_verified`.
- An entry cannot publish until it is signed off. This ties into `validate_catalog.py --strict`: a build or deploy gate that fails while any published service is unverified.
- Depends on real staff authentication (Known gap 1).

### 3. VPC-isolated multilingual NER guardrails

Goal: catch names and addresses the regex layer cannot, without sending the text anywhere new.

- A named-entity-recognition model, packaged as a container-local service, covering 10 or more languages.
- Runs inside the deployment boundary (the city's or BCHC's VPC or VNet), with no outbound call for the text it checks.
- Runs after the existing deterministic rules in `pii.py`, as an additional layer for names without a self-identification phrase and for addresses without a street suffix, before text reaches storage or any model.
- Needs its own evaluation set per language before any accuracy claim is made. It would still not cover raw audio sent directly to OpenAI in `realtime_audio` mode; see the voice roadmap below.

### Phase 2 roadmap: voice

**Not implemented. None of the items below exists in this repository.**

- **VPC-isolated speech models.** Open-weight or enterprise speech-to-text and text-to-speech models hosted inside the authority's own network, so recognition and synthesis work in browsers without on-device support and without audio leaving the trust boundary.
- **Acoustic-stream PII redaction.** Detect and mask spoken identifiers in the audio itself before any audio leaves a trust boundary, rather than only redacting transcripts.
- **Community-validated multilingual and dialect testing.** Evaluate recognition and spoken replies with low-literacy and visually impaired residents, per language and dialect, before any accuracy or accessibility claim is made.

## Reporting a vulnerability

The repository does not reference a City of Austin security disclosure process, so none is cited here. Please do not open a public issue for a security concern. Open a private security advisory on the repository (GitHub: Security tab, "Report a vulnerability"), as [CONTRIBUTING.md](CONTRIBUTING.md) asks that security concerns go to the maintainers privately. Do not include real resident information in a report.
