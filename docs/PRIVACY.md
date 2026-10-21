# Privacy and PII Protection

This page describes what the Austin Service Guide demo does with resident information. For the wider security picture see [SECURITY.md](../SECURITY.md) and [ARCHITECTURE.md](../ARCHITECTURE.md). Everything below describes the code as it is in this repository. Where a protection has limits, this page says so.

The short version:

- Residents don't create accounts. The intake asks for zip code, household size, and ranges (income, insurance). It never needs a name, Social Security number, street address, phone number, date of birth, or account/member number.
- If a resident types one of those anyway, the browser scrubs it before sending, and the backend removes it again **before** the message is kept in the conversation or sent to the AI model. The resident is told it was removed.
- Voice has two modes. By default (`intercepted_text`) speech is recognized on the resident's device, no raw audio leaves it, and only the scrubbed transcript text is sent like a typed message. The opt-in `realtime_audio` mode sends raw audio straight to OpenAI, so it can't be filtered first; it is meant only for deployments with an OpenAI zero-data-retention agreement. See "Voice".
- The opening greeting tells residents the guide uses AI from OpenAI and asks them not to share names, Social Security numbers, or account numbers. It does not call the conversation confidential.
- The server keeps no intake sessions. The conversation, profile, matches, and plan live in the resident's own browser tab (`sessionStorage`) and are sent with each request. The server rebuilds a working copy for that one request, responds, and keeps nothing. "Start over" in the header wipes the browser copy, and closing the tab does too.

## What the app collects

**No resident accounts.** The intake and results work without signing in. The resident's language choice is kept in the browser's `localStorage` (`asg-language`), and the light/dark choice under `asg-theme-mode`. The staff "login" in the admin console is simulated: it keeps the entered name and email in the browser's `localStorage` and does not check them against anything on the server.

**Intake state (in the resident's browser).** The server holds no intake sessions. The browser keeps one `IntakeState` (version 1) in `sessionStorage` under `asg.intake.state` (plus `asg.intake.resultsView`, the simple/all view choice), in `frontend/src/lib/session.ts`. It is never written to `localStorage`. If `sessionStorage` is blocked, the page keeps an in-memory copy for its own lifetime. The state contains:

- The conversation, with resident messages already redacted by the server (see below).
- The profile the intake builds. Its fields are listed in the `extract_profile` tool schema: household size, zip code, housing situation, employment status, income bracket, insurance status, whether there are children, veteran status, disability, immediate needs, outdoor work, air conditioning, chronic conditions, refugee/immigrant status, primary language, and school-age children (grade, district, concerns). There are no fields for name, address, phone, email, SSN, or date of birth.
- The ids of matched services, and the generated plan (summary and ordered items).

Some of these fields are sensitive (disability, chronic conditions, immigration status). They are collected because eligibility depends on them, and they are not redacted.

**How the server treats it.** Every intake request sends the state. The server does not trust it:

- `IntakeState` (`backend/app/models.py`) rejects unknown keys and caps the size: 200 messages, 10,000 characters per message, profile string and list lengths, and 50 matched service ids. Anything else gets a 422.
- Intake request bodies over 256 KiB, including chunked ones with no `Content-Length`, get a 413 (`backend/app/middleware.py`).
- `session_from_state` (`backend/app/services/intake_state.py`) re-redacts every message and every profile string, drops any service id or slug that is not in the catalog (`backend/app/services/grounding.py`), re-reads service names from the catalog, and recomputes risk flags from the profile.
- The server responds with the updated state and keeps nothing. There are no session ids, no TTL, and no `/results/{id}` links. `backend/tests/test_stateless_intake.py` checks that a full intake leaves no module-level state and that interleaved intakes do not mix.

What the server does hold is the service catalog, loaded from YAML at startup. The only other thing it can write is the opt-in voice debug file (see "Debug logging").

**What this does not give you.** The state is not signed or encrypted. Anyone using the same browser tab can read it, and a resident can edit their own copy. A server restart loses nothing, because nothing resident-specific is there. The server also cannot delete a resident's data on request, because it does not have it.

**Clearing it.** The "Start over" button in the header (`frontend/src/components/layout/StartOverButton.tsx`, calling `clearIntakeState`) asks for confirmation, then removes every `asg.intake.*` key from `sessionStorage`, drops any response still in flight, removes the legacy `asg.activeSession` key from `localStorage`, and deletes the legacy `intake-results` cache, then returns to the home page. Older builds cached `/results` responses (profile and matches) in that service-worker cache and kept a results-link id in `localStorage`. The current build also deletes that cache every time the page loads. Closing the tab clears `sessionStorage` without any action.

**Other browser storage.** The service worker caches the public service catalog (`/api/v1/services`, up to 7 days) and map/font assets. It does not cache intake requests (`frontend/vite.config.ts`).

## What residents are told

Every intake started from `POST /api/v1/intake/start` opens with a greeting that includes this notice (`AI_NOTICE_I18N` in `app/services/i18n.py`):

> This guide uses AI (OpenAI) to help match you with services. Please don't share names, Social Security numbers, or account numbers — we don't need them.

The notice is translated for Spanish, Vietnamese, Chinese, and Arabic.

- **Scripted flow:** the greeting is fixed English text (`DEMO_STEPS[0]` in `app/services/scripted.py`) that contains the English notice. The rest of the scripted flow is also in English.
- **Live AI:** the model writes the greeting in the resident's language. The greeting prompt (`_live_greeting` in `app/services/ai.py`) gives the model the translated notice and tells it to include it word for word. For languages without a translation, it tells the model to translate the English notice and keep the name "OpenAI". If the model's greeting doesn't mention OpenAI, the backend adds the notice to the end.

The greeting no longer calls the conversation "confidential", because typed text is sent to OpenAI and, in the opt-in `realtime_audio` voice mode, voice audio goes to OpenAI directly. Demo persona sessions (`POST /api/v1/intake/load-persona`) open with the persona's scripted first message instead of a greeting, so they don't show this notice. They are synthetic residents for staff demos. The landing page and the chat welcome say the same thing in short form ("Uses AI (OpenAI)", don't share names or ID numbers) and make no confidentiality promise.

## PII redaction before the model

`backend/app/services/pii.py` removes high-risk identifiers from resident-written text using fixed patterns (no AI involved). It is the authority; the browser runs a mirror of it first (see "Client pre-flight"). Each match is replaced with a placeholder:

| What | Placeholder | How it's recognized |
| --- | --- | --- |
| Social Security number | `[SSN removed]` | `123-45-6789` / `123 45 6789` layout, or 9 digits (or "last four") after "SSN", "ITIN", "social security", "seguro social" |
| Payment card | `[card number removed]` | 13–19 digits (contiguous or in printed groups) that pass the Luhn checksum |
| Email | `[email removed]` | `name@domain.tld` |
| Phone | `[phone removed]` | US 10-digit numbers (optional +1, parentheses, dashes, dots, spaces); 7-digit numbers only right after "call", "text", "phone", "cell", etc. |
| Street address | `[address removed]` | House number + street name + street suffix (St, Ave, Rd, Blvd, Dr, Ln, …; words like "Way" or "Court" only when capitalized), optional apartment/unit; P.O. boxes |
| Date of birth | `[date of birth removed]` | A full date right after "DOB", "date of birth", "birthday", "born on", "fecha de nacimiento", … |
| ID / member numbers | `[ID number removed]` | A 6+ character value with at least 4 digits right after "Medicaid", "Medicare", "member", "policy", "case", "account", "SNAP", "ID", "license", "passport", … |
| Name | `[name removed]` | Only right after a self-identification phrase. After "my name is", "my name's", "me llamo", "mi nombre es" (any letter case): up to 3 words, stopping at function words such as "on", "is", "the". After "I am", "I'm", "this is": only when 2–3 Capitalized words follow that are not common descriptors (common descriptors such as "Veteran", nationalities, days and months are skipped, so "I am Veteran Affairs" is left alone). The gap may be spaces (including non-breaking spaces or a newline), or a colon, comma, or dash |

The patterns are tuned to leave alone what the intake needs. Zip codes (`78744`, `78744-1234`), household counts ("3 kids"), ages ("I'm 34"), and dollar amounts ("$1,200 rent") are not redacted. The test suite (`backend/tests/test_pii.py`) checks both the matches and these false-positive cases.

The redactor returns the cleaned text and the *types* it found (for example `["phone", "ssn"]`). It never returns or logs the removed values.

### Where redaction is applied

| Boundary | Code |
| --- | --- |
| Typed text in the chat box and the directory search box, scrubbed in the browser before it is sent | `scrubPII` in `frontend/src/lib/piiGuard.ts`, called from `ChatInterface.tsx` and `ServiceDirectory.tsx` |
| Typed chat message, before it is added to the conversation, added to the model's context, crisis-checked, or used by the scripted flow | `process_message` in `app/services/ai.py` |
| Every message and profile string in the state the browser sends, on every intake request (so a tampered or stale state is cleaned too) | `session_from_state` in `app/services/intake_state.py` (resident rules for resident turns; the assistant rules below for assistant turns and plan text) |
| Voice transcript of what the **resident** said, before it is added to the conversation or the text model's context | `record_realtime_transcript` in `app/services/realtime.py` |
| Voice transcript of what the **assistant** said (partial rules, see below) | `record_realtime_transcript` in `app/services/realtime.py` |
| Voice debug log (when enabled): every string, including keys, before it is truncated or written to disk | `_sanitize_debug_value` in `app/services/realtime_debug.py`, plus the transcript preview in `sync_realtime_transcript` (`app/routers/intake.py`) |

### Client pre-flight

`frontend/src/lib/piiGuard.ts` (`inspectForPII`, `scrubPII`) is a TypeScript mirror of `pii.py`'s resident rules. The chat input and the directory search scrub what the resident typed before sending it, and show a short notice listing the kinds removed (`PrivacySnackbar`). A permanent privacy notice from the brand config (`copy.privacyNotice`) sits above both boxes (`PrivacyNotice.tsx`). The backend is still the authority and redacts again, so the pre-flight is a convenience for the resident, not a control the server relies on.

The two implementations are kept identical by a shared fixture, `backend/tests/fixtures/pii_cases.json` (160 cases). `backend/tests/test_pii.py` (pytest) and `frontend/src/lib/piiGuard.test.ts` (`npm test`) both run every case and check the same output. Neither side logs the raw text. In default voice mode the browser scrubs the on-device transcript with the same guard; the pre-flight cannot apply to raw audio in `realtime_audio` mode.

The voice model hears the resident directly, so it could read back a number it heard. Assistant voice transcripts are therefore redacted for SSNs, payment cards, dates of birth, ID numbers, and emails (`ASSISTANT_KINDS` in `pii.py`). Phone numbers and addresses are left in, and so are the service email addresses listed in the catalog, because the assistant reads out service contact details on purpose. A resident's phone number or address that the voice assistant repeats back is therefore **not** removed from its transcript.

Typed-chat assistant replies and catalog data are **not** redacted. They contain service phone numbers and addresses on purpose, and the text model only ever sees redacted resident text.

Because the conversation is redacted every time the state is rebuilt, everything built from it is too, including the plan-ranking call (`build_application_order` in `app/services/plan.py`), which sends recent conversation to the model. The plan summary and per-item reasons that come back are redacted with the assistant rules, capped in length, and kept only for service ids that are in the catalog and were matched.

### What the resident sees

When something is removed from a typed message, the reply starts with one sentence such as:

> For your privacy, I removed some personal details (like an ID number, phone, or address) from your message — I don't need them to find services.

The sentence comes from `REDACTION_NOTICE_I18N` in `app/services/i18n.py` and is translated for Spanish, Vietnamese, Chinese, and Arabic (other languages get English). It is left off crisis responses so they stay focused. The `/message` response also returns the redacted copy of the resident's message as `user_message`. Voice transcript syncs return the removed types as `redacted` and the stored, redacted text as `redacted_content`, including when nothing new was added (a repeated turn, or a turn sent after the intake finished).

### Model instructions

The text intake instructions (`build_instructions` in `app/services/prompts.py`) and the voice instructions (`build_realtime_instructions` in `app/services/realtime.py`) both tell the model to never ask for or repeat a name, SSN, full address, phone number, email, date of birth, or account/case/member ID. If the resident offers one, the model should say it doesn't need it and move on. The model is also told that placeholders like `[phone removed]` mean the detail was already removed, so it shouldn't ask again.

### Limits of redaction

Pattern-based redaction catches identifiers with a recognizable shape. It does **not** catch:

- Names that are not introduced by a self-identification phrase ("Maria Lopez here", "ask for Maria", a name typed on its own). The model is told not to ask for or repeat names.
- Addresses without a house number or street suffix ("the blue house behind the HEB on Riverside").
- Unusual phrasings of spoken numbers. Spelled-out digit runs and spoken street numbers are now covered (see "Spoken numbers"), but the rules are pattern-based and can miss phrasings they were not written for.
- Sensitive situations described in plain language (health conditions, immigration status, abuse). These are often what the resident needs help with, so they pass through to the model on purpose.

The name rule can also remove too much. After "my name is <name>", a word that is not on the rule's stop list, even a lowercase one, may be removed with the name. The rule favors removing a name over keeping a word.

## What is sent to OpenAI

### Text chat (Responses API)

When live AI is on (`OPENAI_API_KEY` set and `DEMO_MODE=false`), the backend calls the OpenAI Responses API. Each call sends the system instructions (which include the "currently known" profile snapshot), the redacted conversation, tool definitions, and tool results (catalog data). The API key stays on the server. The OpenAI client is built with the API key only (`_openai_client` in `app/services/ai.py`; the plan call builds its own the same way in `plan.py`), so no inbound request headers, such as `X-Forwarded-For`, are forwarded to OpenAI.

Every Responses API call passes `store=False` (the installed SDK, `openai` 3.31.0, accepts `store` on `responses.create`). This asks OpenAI not to keep the response for later retrieval. The agent loop also requests `include=["reasoning.encrypted_content"]` so the model's reasoning items can be passed back between tool rounds inside one turn without being stored. Reasoning items, tool calls, and tool outputs are not carried across turns: each turn's model input is rebuilt from the visible, redacted conversation (`_conversation_input`). `store=False` is not zero data retention. There is no per-request zero-data-retention setting in the OpenAI API: that is an organization- or project-level agreement with OpenAI, and none is in place for this demo. `store=False` does not change OpenAI's separate abuse-monitoring retention; see "What a real deployment still needs".

When live AI is off, nothing is sent to OpenAI. The scripted flow runs entirely on the server.

### Voice

`VOICE_PIPELINE_MODE` selects the voice mode; the browser reads the effective mode from `GET /api/v1/intake/voice-config` (no body, no resident data; returns `mode`, `raw_audio_allowed` and `live_ai`).

#### Default: `intercepted_text`

- No raw audio leaves the device. Speech is recognized in the browser with Web Speech `SpeechRecognition` and `processLocally=true`. If the on-device language pack is downloadable, the resident is offered an explicit "Download speech pack" button. The app never starts recognition with `processLocally=false` and never falls back to cloud recognition. It records no audio and keeps no audio buffers.
- On-device recognition currently needs a recent Chromium browser with the language pack. Other browsers, or languages with no pack available, get text-only chat and a message telling the resident to type.
- The final transcript is scrubbed in the browser (`piiGuard.ts`), shown to the resident as the sanitized transcript, and sent through the normal stateless text path (`POST /api/v1/intake/message`). The server redacts it again (`pii.py`) before any model call, exactly as for typed text. The text then goes to OpenAI under the same terms as typed chat (see "Text chat").
- Replies are spoken with `speechSynthesis` using only on-device voices (`localService`). If none exists for the language, the reply is text only and the UI says so. Phone numbers, street addresses, URLs, emails and eligibility or income-threshold sentences are removed from the model's text before it is spoken. Contact details are spoken only from catalog records (service name, catalog phone and address). On completion, a short summary built from catalog matches (service names) is spoken.
- At voice start the resident hears and sees: "Welcome to the Service Guide Voice Assistant. To protect your privacy, please do not say your name, street address, phone number, or Social Security number. Simply tell me what kind of help or services you are looking for today."
- A "Clear voice session" button stops recognition, releases the microphone, cancels speech output and clears the live transcript. It does not erase the text chat; Start over does that.

#### Spoken numbers

Transcribed speech often spells numbers out. `pii.py` and `piiGuard.ts` (kept identical by the shared fixture) now redact a run of seven or more digits that includes at least two spoken number words ("five one two five five five one two three four") as a phone number; a run of four to nine digits with at least one spoken word after an SSN keyword ("my social is one two three ...", "last four of my social is ...") as an SSN; and two to six spoken number words before a street suffix ("twelve oh four main street") as an address. Ordinary small numbers ("I have three kids", "two adults and one child", "about five hundred dollars a month") are left alone. The spoken rules recognize English number words only; Spanish or other spoken numbers are not yet covered. This is pattern-based redaction and can miss unusual phrasings.

#### Opt-in: `realtime_audio` (Realtime API)

This mode is available only when `VOICE_PIPELINE_MODE=realtime_audio` AND `ALLOW_RAW_AUDIO_STREAM=true` (and live AI is on). Otherwise the three realtime endpoints (`client-secret`, `tool`, `transcript`) return 403 before doing any work. It is intended only for deployments with an OpenAI zero-data-retention agreement. The app does not verify such an agreement; that is the operator's contractual responsibility. While it is active the UI shows a "Raw audio streamed to OpenAI" badge, and a consent dialog appears before the first start in each page session. Its protection is weaker:

- The browser asks the backend for a short-lived client secret (`POST /api/v1/intake/realtime/client-secret`, which carries the browser-held state; it expires after `OPENAI_REALTIME_SECRET_TTL_SECONDS`, default 600). The real API key is never sent to the browser, and no inbound request headers are forwarded to OpenAI when the secret is minted.
- The session instructions are built on the server. They contain the intake rules, the profile snapshot (built from the re-redacted state), and the selected scenario. They do not contain the conversation itself.
- **Audio streams directly from the browser to OpenAI over WebRTC.** The backend never sees the audio, so it **cannot redact what the resident says before OpenAI hears it**. If a resident reads out their SSN, the voice model and OpenAI's transcription model receive it.
- Mitigations: the voice instructions tell the model never to ask for or repeat these details and to steer back if they're offered. Resident transcripts are redacted when the browser syncs them back to the backend, so the conversation kept in the browser state and anything later sent to the text model are clean. Realtime tracing is turned off (`"tracing": None`), so sessions are not written to the OpenAI Traces dashboard.
- The Realtime API has no `store` parameter. Retention of voice sessions follows OpenAI's API data policy for the account.
- Typed messages: after each send, the browser replaces its local copy of what the resident typed with the redacted `user_message` the backend returns, so the chat history replayed into a voice session never contains the raw identifiers. If the send fails, the browser drops its copy of the message and shows an error, so the resident retypes it. In `realtime_audio` mode, voice transcripts are likewise swapped for the redacted server copy once synced. If a resident transcript's sync fails, or its result arrives after voice has stopped without a redacted copy, the browser shows "[details removed]" in its place. Client debug events carry only transcript lengths, not text.

## Sharing results (SMS / email)

`POST /api/v1/intake/share` sends a list of matched services by SMS (Twilio) or email (SendGrid). The request carries the channel, the recipient, and the service ids, and no intake state. The ids are grounded to the catalog, and the message is built only from catalog data: service names, service phone numbers, and `/services/{slug}` links (at most 8, then a link to the service directory). It contains no results link and nothing from the resident's profile or conversation. There are no shareable `/results/{id}` links any more, because the server keeps no results to link to.

The phone number or email address is checked for format, used for that one send, and not stored. Without Twilio/SendGrid credentials the send is stubbed, and the log shows only the last two characters of the recipient (`app/services/notify.py`). With credentials, the recipient and message go to Twilio or SendGrid, which have their own retention.

If Twilio or SendGrid rejects a send, the backend logs only the HTTP status and a provider code: Twilio's numeric error `code`, or the request field paths SendGrid flags (for example `personalizations.0.to.0.email`). The response body is never logged, because provider error messages can repeat the phone number or email address. The resident gets a generic "Could not send right now" error.

The results page also offers the browser's native share sheet and print. The share sheet text is built in the browser from catalog service names and phone numbers plus a link to the public service directory (`handleShare` in `frontend/src/pages/Results.tsx`). A service's QR code points at that service's public page (`ServiceCard.tsx`). None of them carries the resident's profile or conversation.

## Logging

Application logs carry no resident text (`backend/tests/test_stateless_intake.py::test_resident_text_never_logged` captures logs during an intake and checks for it). Error logs record exception type names and counts, not messages, because an SDK error can quote the request. The grounding gate logs only how many ids it dropped. `notify.py` masks recipients as above. This covers the application's own logs. Logs written by the platform around it (load balancer, proxy) are not configured by this repository.

## Debug logging

The voice debug trace (`REALTIME_DEBUG_LOG_ENABLED`) is **off by default**. When it is off, nothing is recorded anywhere, and the debug endpoints (`/api/v1/intake/realtime/debug*`) return 404. When it is on, each event is appended to the file at `REALTIME_DEBUG_LOG_PATH` (default `backend/logs/realtime_debug.jsonl`) and nothing is kept in server memory (`app/services/realtime_debug.py`). Events are keyed by a random trace id that the browser makes up for each voice session. They hold event names, statuses, counts, lengths, and field names, and every string in them is PII-redacted and truncated first. Long strings are cut to twice the kept length before redaction, so a huge value can't stall the server, and a client event's `detail` is refused if it serializes to more than 32,000 characters. The trace can include redacted transcript previews, which is why it should stay off in production. If the OpenAI client-secret request fails, the redacted upstream error text goes into this trace (and nowhere else). The file is never trimmed or expired: it grows until someone deletes it, and the debug read endpoints return whatever is in it. Log files created before redaction was added may still contain raw transcript text. Delete them once you no longer need them.

## Admin console

Admin read endpoints (`GET /api/v1/admin/...`) are open. They return synthetic demo residents, generated analytics, and the public service catalog. They expose no real resident data.

Admin write endpoints (`POST`, `PATCH`, `DELETE` under `/api/v1/admin/services`) change the catalog that residents are matched against. They require an `X-Admin-Token` header that matches the server's `ADMIN_API_TOKEN` setting, compared in constant time. If `ADMIN_API_TOKEN` is empty (the default), every write returns 403 with a message explaining how to enable it. This is a shared-secret stopgap, not staff authentication.

## What a real deployment still needs

This is a demo. Before it handles real residents, it needs at least:

- **Authentication and authorization.** Real staff identity (for example Entra ID) with role-based access for the admin console. Resident data now stays in the resident's browser, so there is no server-side results store to protect. If a persistent "save my plan" feature is added, it will need real access control.
- **Vendor agreements.** A data processing agreement with OpenAI and the notification vendors. If any data could be protected health information, a HIPAA BAA review, including which OpenAI endpoints (Responses, Realtime, transcription) it covers.
- **OpenAI retention settings.** By default OpenAI may keep API inputs and outputs for a limited time for abuse monitoring, even with `store=False`. Zero data retention is an organization- or project-level arrangement with OpenAI, not a request header. Apply for Zero Data Retention (or the equivalent current option) for the project, and confirm it covers Realtime.
- **A retention policy.** The server stores no resident data today, so there is nothing to expire. If a persistent store is ever added, it must be encrypted and covered by records-retention rules. The retention that matters now is OpenAI's, Twilio's and SendGrid's, and any platform logs.
- **Clear notice to residents before they start.** The greeting, landing page, and chat welcome say the guide uses OpenAI and what not to share, and the voice option says "Your voice is sent to OpenAI to understand you" before the microphone turns on (that wording applies to `realtime_audio` mode; the voice consent and welcome wording also needs privacy-office review). A real deployment should have this wording reviewed by the City's privacy office and translated with the rest of the intake screen. The brand-config privacy notice (`copy.privacyNotice`) is English-only today.
- **Logging review.** Twilio/SendGrid error bodies are not logged. Still confirm no recipients, transcripts, or other upstream bodies reach production logs (including platform and load-balancer logs), and keep the debug trace off.
- **Broader PII review.** Pattern redaction is a safety net, not a guarantee. Names without a self-identification phrase still pass. Add a review of names and other free-text identifiers if the risk assessment calls for it. A container-local multilingual NER layer is listed as future work in [SECURITY.md](../SECURITY.md).
- **Rate limiting and WAF.** The intake endpoints call a paid model API and have neither.
