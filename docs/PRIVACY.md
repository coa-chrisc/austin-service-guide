# Privacy and PII Protection

This page describes what the Austin Service Guide demo does with resident information. Everything below describes the code as it is in this repository. Where a protection has limits, this page says so.

The short version:

- Residents don't create accounts. The intake asks for zip code, household size, and ranges (income, insurance). It never needs a name, Social Security number, street address, phone number, date of birth, or account/member number.
- If a resident types one of those anyway, the backend removes it **before** the message is stored or sent to the AI model, and tells the resident it was removed.
- Voice is different. Audio goes straight from the browser to OpenAI, so it can't be filtered first. For voice we rely on model instructions and on removing identifiers from transcripts after the fact.
- The opening greeting tells residents the guide uses AI from OpenAI and asks them not to share names, Social Security numbers, or account numbers. It does not call the conversation confidential.
- Sessions live only in server memory and are deleted 24 hours after they start (`SESSION_TTL_HOURS`). Nothing is written to a database.

## What the app collects

**No resident accounts.** The intake and results work without signing in. The resident's language choice is kept in the browser's `localStorage` (`asg-language`). The staff "login" in the admin console is simulated: it keeps the entered name and email in the browser's `localStorage` and does not check them against anything on the server.

**Intake session (server memory).** Each conversation creates an `IntakeSession` held in a Python dictionary inside the backend process (`_sessions` in `backend/app/services/ai.py`). It contains:

- The conversation, with resident messages already redacted (see below).
- The profile the intake builds. Its fields are listed in the `extract_profile` tool schema: household size, zip code, housing situation, employment status, income bracket, insurance status, whether there are children, veteran status, disability, immediate needs, outdoor work, air conditioning, chronic conditions, refugee/immigrant status, primary language, and school-age children (grade, district, concerns). There are no fields for name, address, phone, email, SSN, or date of birth.
- Matched services, risk flags, and the generated plan.

Some of these fields are sensitive (disability, chronic conditions, immigration status). They are collected because eligibility depends on them, and they are not redacted.

**How long sessions last.** A session is deleted `SESSION_TTL_HOURS` after it starts (default 24, set in `app/config.py` and `backend/.env.example`). The clock runs from when the session was created, not from its last use, so opening a shared link does not extend it. Deletion is lazy: every session lookup and every new session first removes expired sessions (`_purge_expired_sessions` in `app/services/ai.py`), along with that session's background plan task, cached plan, and in-memory voice debug events. An expired session behaves exactly like one that never existed: `/message`, `/results`, `/summary`, `/share`, and the realtime endpoints return 404. A backend restart also clears every session. There is no database, file, or backup copy.

Until a session expires, anyone who has its ID (a random UUID) can read its results at `/api/v1/intake/{id}/results` and `/results/{id}`. That is how share links work, and it is also why session IDs should be treated as secrets.

## What residents are told

Every intake started from `/api/v1/intake/start` opens with a greeting that includes this notice (`AI_NOTICE_I18N` in `app/services/i18n.py`):

> This guide uses AI (OpenAI) to help match you with services. Please don't share names, Social Security numbers, or account numbers — we don't need them.

The notice is translated for Spanish, Vietnamese, Chinese, and Arabic.

- **Scripted flow:** the greeting is fixed English text (`_DEMO_STEPS[0]` in `app/services/ai.py`) that contains the English notice. The rest of the scripted flow is also in English.
- **Live AI:** the model writes the greeting in the resident's language. The greeting prompt (`_live_greeting`) gives the model the translated notice and tells it to include it word for word. For languages without a translation, it tells the model to translate the English notice and keep the name "OpenAI". If the model's greeting doesn't mention OpenAI, the backend adds the notice to the end.

The greeting no longer calls the conversation "confidential", because typed text is sent to OpenAI and voice audio goes to OpenAI directly. Demo persona sessions (`/api/v1/intake/load-persona`) open with the persona's scripted first message instead of a greeting, so they don't show this notice. They are synthetic residents for staff demos. Some frontend copy still says "confidential" or "private and secure". That copy is owned by the frontend and is tracked separately.

## PII redaction before the model

`backend/app/services/pii.py` removes high-risk identifiers from resident-written text using fixed patterns (no AI involved). Each match is replaced with a placeholder:

| What | Placeholder | How it's recognized |
| --- | --- | --- |
| Social Security number | `[SSN removed]` | `123-45-6789` / `123 45 6789` layout, or 9 digits (or "last four") after "SSN", "social security", "seguro social" |
| Payment card | `[card number removed]` | 13–19 digits (contiguous or in printed groups) that pass the Luhn checksum |
| Email | `[email removed]` | `name@domain.tld` |
| Phone | `[phone removed]` | US 10-digit numbers (optional +1, parentheses, dashes, dots, spaces); 7-digit numbers only right after "call", "text", "phone", "cell", etc. |
| Street address | `[address removed]` | House number + street name + street suffix (St, Ave, Rd, Blvd, Dr, Ln, …; words like "Way" or "Court" only when capitalized), optional apartment/unit; P.O. boxes |
| Date of birth | `[date of birth removed]` | A full date right after "DOB", "date of birth", "birthday", "born on", "fecha de nacimiento", … |
| ID / member numbers | `[ID number removed]` | A 6+ character value with at least 4 digits right after "Medicaid", "Medicare", "member", "policy", "case", "account", "SNAP", "ID", "license", "passport", … |

The patterns are tuned to leave alone what the intake needs. Zip codes (`78744`, `78744-1234`), household counts ("3 kids"), ages ("I'm 34"), and dollar amounts ("$1,200 rent") are not redacted. The test suite (`backend/tests/test_pii.py`) checks both the matches and these false-positive cases.

The redactor returns the cleaned text and the *types* it found (for example `["phone", "ssn"]`). It never returns or logs the removed values.

### Where redaction is applied

| Boundary | Code |
| --- | --- |
| Typed chat message, before it is stored in the conversation, added to the model's context, crisis-checked, or used by the scripted flow | `process_message` in `app/services/ai.py` |
| Voice transcript of what the **resident** said, before it is stored or added to the text model's context | `record_realtime_transcript` in `app/services/ai.py` |
| Voice debug log (when enabled): every string, before it is truncated, kept in memory, or written to disk | `_sanitize_debug_value` in `app/services/ai.py`, plus the transcript preview in `sync_realtime_transcript` (`app/routers/intake.py`) |

Assistant messages and catalog data are **not** redacted, because they contain service phone numbers and addresses on purpose.

Because the stored conversation is already redacted, everything built from it is too, including the plan-ranking call (`build_application_order`), which sends recent conversation to the model.

### What the resident sees

When something is removed from a typed message, the reply starts with one sentence such as:

> For your privacy, I removed some personal details (like an ID number, phone, or address) from your message — I don't need them to find services.

The sentence comes from `REDACTION_NOTICE_I18N` in `app/services/i18n.py` and is translated for Spanish, Vietnamese, Chinese, and Arabic (other languages get English). It is left off crisis responses so they stay focused. The `/message` response also returns the stored, redacted copy of the resident's message as `user_message`. Voice transcript syncs return the removed types as `redacted`.

### Model instructions

The text intake instructions (`_build_instructions`) and the voice instructions (`_build_realtime_instructions`) both tell the model to never ask for or repeat a name, SSN, full address, phone number, email, date of birth, or account/case/member ID. If the resident offers one, the model should say it doesn't need it and move on. The model is also told that placeholders like `[phone removed]` mean the detail was already removed, so it shouldn't ask again.

### Limits of redaction

Pattern-based redaction catches identifiers with a recognizable shape. It does **not** catch:

- Names. There is no reliable pattern, so the model is told not to ask for or repeat them.
- Addresses without a house number or street suffix ("the blue house behind the HEB on Riverside").
- Numbers spelled out in words ("five one two…"), which voice transcription sometimes produces.
- Sensitive situations described in plain language (health conditions, immigration status, abuse). These are often what the resident needs help with, so they pass through to the model on purpose.

## What is sent to OpenAI

### Text chat (Responses API)

When live AI is on (`OPENAI_API_KEY` set and `DEMO_MODE=false`), the backend calls the OpenAI Responses API. Each call sends the system instructions (which include the "currently known" profile snapshot), the redacted conversation, tool definitions, and tool results (catalog data). The API key stays on the server.

Every Responses API call passes `store=False` (the installed SDK, `openai` 3.31.0, accepts `store` on `responses.create`). This asks OpenAI not to keep the response for later retrieval. The agent loop also requests `include=["reasoning.encrypted_content"]` so the model's reasoning can be passed back between turns without being stored. `store=False` does not change OpenAI's separate abuse-monitoring retention; see "What a real deployment still needs".

When live AI is off, nothing is sent to OpenAI. The scripted flow runs entirely on the server.

### Voice (Realtime API)

Voice works differently, and its protection is weaker:

- The browser asks the backend for a short-lived client secret (`/api/v1/intake/{id}/realtime/client-secret`; it expires after `OPENAI_REALTIME_SECRET_TTL_SECONDS`, default 600). The real API key is never sent to the browser.
- The session instructions are built on the server. They contain the intake rules, the profile snapshot, and the selected scenario. They do not contain the conversation itself.
- **Audio streams directly from the browser to OpenAI over WebRTC.** The backend never sees the audio, so it **cannot redact what the resident says before OpenAI hears it**. If a resident reads out their SSN, the voice model and OpenAI's transcription model receive it.
- Mitigations: the voice instructions tell the model never to ask for or repeat these details and to steer back if they're offered. Resident transcripts are redacted when the browser syncs them back to the backend, so the stored conversation and anything later sent to the text model are clean. Realtime tracing is turned off (`"tracing": None`), so sessions are not written to the OpenAI Traces dashboard.
- The Realtime API has no `store` parameter. Retention of voice sessions follows OpenAI's API data policy for the account.
- Typed messages: after each send, the browser replaces its local copy of what the resident typed with the redacted `user_message` the backend returns, so the chat history replayed into a voice session never contains the raw identifiers. Voice transcripts are likewise swapped for the redacted server copy once synced, and client debug events carry only transcript lengths, not text.

## Sharing results (SMS / email)

`POST /api/v1/intake/{id}/share` sends the matched services by SMS (Twilio) or email (SendGrid). The phone number or email address is checked for format, used for that one send, and not saved on the session. Without Twilio/SendGrid credentials the send is stubbed, and the log shows only the last two characters of the recipient (`app/services/notify.py`). With credentials, the recipient and message go to Twilio or SendGrid. The message lists service names, service phone numbers, and links. If there are more than 8 matches, the text message also includes a link to `/results/{session_id}`. The email always includes it. Whenever the results link is included, the message says it expires within `SESSION_TTL_HOURS` hours (24 by default), because the session it points to is deleted then.

If Twilio or SendGrid rejects a send, the backend logs only the HTTP status and a provider code: Twilio's numeric error `code`, or the request field paths SendGrid flags (for example `personalizations.0.to.0.email`). The response body is never logged, because provider error messages can repeat the phone number or email address. The resident gets a generic "Could not send right now" error.

## Debug logging

The voice debug trace (`REALTIME_DEBUG_LOG_ENABLED`) is **off by default**. When it is off, nothing is recorded in memory or on disk, and the debug endpoints return 404. When it is on, events go to memory and to `REALTIME_DEBUG_LOG_PATH` (default `backend/logs/realtime_debug.jsonl`), and every string in an event is PII-redacted and truncated first. In-memory events are deleted when their session expires. The file is not trimmed when sessions expire: it keeps growing until someone deletes it, and the debug read endpoints can still return a deleted session's events from it. Log files created before redaction was added may still contain raw transcript text. Delete them once you no longer need them.

## Admin console

Admin read endpoints (`GET /api/v1/admin/...`) are open. They return synthetic demo residents, generated analytics, and the public service catalog. They expose no real resident data.

Admin write endpoints (`POST`, `PATCH`, `DELETE` under `/api/v1/admin/services`) change the catalog that residents are matched against. They require an `X-Admin-Token` header that matches the server's `ADMIN_API_TOKEN` setting, compared in constant time. If `ADMIN_API_TOKEN` is empty (the default), every write returns 403 with a message explaining how to enable it. This is a shared-secret stopgap, not staff authentication.

## What a real deployment still needs

This is a demo. Before it handles real residents, it needs at least:

- **Authentication and authorization.** Real staff identity (for example Entra ID) with role-based access for the admin console. Resident results should be protected by more than an unguessable session ID.
- **Vendor agreements.** A data processing agreement with OpenAI and the notification vendors. If any data could be protected health information, a HIPAA BAA review, including which OpenAI endpoints (Responses, Realtime, transcription) it covers.
- **OpenAI retention settings.** By default OpenAI may keep API inputs and outputs for a limited time for abuse monitoring, even with `store=False`. Apply for Zero Data Retention (or the equivalent current option) for the project, and confirm it covers Realtime.
- **A retention policy.** In-memory sessions expire after `SESSION_TTL_HOURS`, but the expiry time should be set by a records-retention decision, not a demo default. Any persistent store must be encrypted and covered by records-retention rules.
- **Clear notice to residents before they start.** The greeting now says the guide uses OpenAI and what not to share. A real deployment should also say so before the intake begins (on the landing page and before the microphone turns on), and should state plainly that voice audio goes directly to OpenAI.
- **Logging review.** Twilio/SendGrid error bodies are no longer logged. Still confirm no recipients, transcripts, or other upstream bodies reach production logs, and keep the debug trace off.
- **Broader PII review.** Pattern redaction is a safety net, not a guarantee. Add a review of names and other free-text identifiers if the risk assessment calls for it.
