/* ------------------------------------------------------------------ */
/*  "How it works" copy. Plain data: no React, no live values.         */
/*                                                                     */
/*  Every claim here must match the files in its `sources` (repo-      */
/*  relative paths; content.test.ts checks they exist). When the code  */
/*  or SECURITY.md changes, change this file in the same PR: the code  */
/*  and the docs win over this page. Live values (model, effort, voice */
/*  mode, counts) come from GET /api/v1/about and are not written here.*/
/*                                                                     */
/*  Style: plain language, short sentences, one idea per point. Say a  */
/*  thing once, in the section that owns it, and link to it elsewhere. */
/* ------------------------------------------------------------------ */

export interface HowItWorksSection {
  /** Anchor id (/how-it-works#<id>). */
  id: string;
  title: string;
  /** One plain sentence or two (reading level target: grade 9). */
  summary: string;
  points: string[];
  limits: string[];
  /** Label of the collapsed panel holding `points`, specific to this section (the count is added). */
  detailsLabel: string;
  /** Label of the collapsed panel holding `limits` (the count is added). */
  limitsLabel: string;
  /**
   * "Where this is going": the planned next step for this section, shown under that heading. Planned, not
   * built: write it as a plan (for example "Phase 2 adds…"), never as if it runs today.
   */
  roadmap?: string;
  /** Repo-relative paths, shown as "Where this is in the code". */
  sources: string[];
  /** Ids of other sections that say more, shown as links. */
  related?: string[];
}

/** Icon names used by the safeguard cards; icons.ts maps each to an @mui/icons-material icon. */
export type IconKey = "crisis" | "redact" | "catalog" | "rules" | "noStore" | "policy" | "limits" | "review";

/** The safeguards, one card each, shown in the safeguards section (id "safety"). */
export interface SafetyLayer {
  icon: IconKey;
  title: string;
  /** One or two short sentences. */
  text: string;
  /** Section id with the detail, when another section owns it. */
  section?: string;
}

export const SAFETY_LAYERS: SafetyLayer[] = [
  {
    icon: "crisis",
    title: "Crisis routing first",
    section: "crisis",
    text: "Crisis keywords trigger 988, 911, and local hotlines immediately before any AI call, exempt from rate limits.",
  },
  {
    icon: "redact",
    title: "Dual-pass PII scrubbing",
    section: "pii",
    text: "Deterministic rules strip phone numbers, SSNs, emails, and street addresses in the browser and again on the server.",
  },
  {
    icon: "catalog",
    title: "Closed-catalog grounding",
    text: "Program names, phone numbers, addresses, and links render strictly from vetted YAML records, never AI prose.",
  },
  {
    icon: "rules",
    title: "Deterministic eligibility rules",
    section: "ai-model",
    text: "Python rules, not the LLM, compute service matches so identical profiles always return identical options.",
  },
  {
    icon: "noStore",
    title: "Zero server session storage",
    section: "stateless",
    text: "Conversations stay in browser sessionStorage. The server validates, answers, and discards state every turn.",
  },
  {
    icon: "policy",
    title: "Non-retention API flag (store=False)",
    section: "ai-model",
    text: "Every OpenAI request sets store=False to disable response storage (pair with an enterprise ZDR contract for production).",
  },
  {
    icon: "limits",
    title: "Budget circuit breakers",
    section: "cost",
    text: "Token caps and rate limits protect paid APIs while falling back cleanly to scripted intake and unlimited directory access.",
  },
  {
    icon: "review",
    title: "Human-approved catalog updates",
    section: "research",
    text: "Partner imports and web-researched listings stage as source-quoted drafts; nothing goes live without staff sign-off.",
  },
];

export const SECTIONS: HowItWorksSection[] = [
  {
    id: "what-this-is",
    title: "Connects residents to vetted programs; agencies decide eligibility",
    detailsLabel: "Scope and operational boundaries",
    limitsLabel: "Current scope limits",
    summary:
      "An open-source reference application that connects residents with local health and social services. It narrows options to relevant programs; it never determines legal eligibility, accepts benefit applications, or stores case files.",
    points: [
      "Queries a curated directory of municipal, county, state, federal, and nonprofit programs for a single jurisdiction.",
      "Excludes a program only when a resident's stated situation directly rules out a documented requirement. Every returned result is a referral to verify with the operating provider.",
      "Ships two interfaces in one codebase: a public resident guide and an administrative staff console.",
      "Requires zero resident accounts. Full intake and service matching run anonymously without sign-in.",
      "Released under the MIT license so any health department or coalition can deploy an isolated instance.",
    ],
    limits: [
      "Referrals indicate potential fit, not guaranteed eligibility or program capacity.",
      "The resident \"Sign In\" screen is a UI demonstration. It creates no server-side account, though any typed email stays in local browser storage until sign-out.",
    ],
    sources: ["CLAUDE.md", "LICENSE", "backend/app/main.py", "frontend/src/hooks/useAuth.tsx", "docs/CUSTOMIZING.md"],
  },
  {
    id: "journey",
    title: "Residents browse directly or talk naturally, then leave with an action plan",
    detailsLabel: "Step-by-step resident flow",
    limitsLabel: "Browsing and voice constraints",
    summary:
      "Residents filter the directory themselves or answer one plain-language question at a time via text or voice. Both paths produce a clear shortlist of programs with contact details and next steps.",
    points: [
      "Self-directed browse: Residents pick a category (such as Food & Nutrition or Housing & Utilities), select a language, and optionally enter a ZIP code to filter the directory immediately.",
      "Zero-AI browsing: Category views, individual program pages, and map pins run without AI calls.",
      "Guided intake: In text or voice chat, the guide asks one focused question at a time to understand what the resident needs.",
      "Actionable results: Matching programs render as cards paired with a prioritized step-by-step checklist. Programs with unconfirmed criteria display a \"Check eligibility\" badge.",
      "Optional handoff: When SMS or email gateways are configured, residents can text or email their shortlist to themselves.",
      "Instant wipe: Clicking \"Start over\" purges the active browser tab immediately.",
    ],
    limits: [
      "If live AI is disabled or rate-limited, guided chat automatically switches to a deterministic scripted questionnaire.",
      "Default privacy-preserving voice mode requires a modern browser with local speech recognition support. Unsupported browsers present text chat only.",
    ],
    sources: [
      "frontend/src/components/landing/NeedNavigator.tsx",
      "frontend/src/components/common/catalogFilters.ts",
      "frontend/src/pages/Results.tsx",
      "backend/app/services/eligibility.py",
      "backend/app/routers/intake.py",
    ],
  },
  {
    id: "architecture",
    title: "Single-service backend locked to an agency-controlled catalog",
    detailsLabel: "System components and data flow",
    limitsLabel: "Diagram maintenance note",
    roadmap:
      "Phase 2 adds persistent PostgreSQL storage with pgvector semantic search so staff edits persist across restarts and searches match concepts alongside exact keywords.",
    summary:
      "A lightweight React frontend communicates with a single Python FastAPI service. The server holds the verified service catalog in memory, enforces deterministic matching rules, and brokers text model requests.",
    points: [
      "Frontend runs in React; backend runs as a single stateless Python (FastAPI) process.",
      "Jurisdiction data lives in a portable Data Pack: version-controlled YAML files defining local services, categories, and crisis hotlines (docs/DATA_PACK.md).",
      "The server loads the Data Pack into RAM at startup, requiring zero database queries during resident lookups.",
      "Localization and branding live in city.config.json. Standing up a new city requires swapping only this config file and the Data Pack.",
      "Server-side model brokering keeps OpenAI API keys strictly on the backend for text chat.",
      "Optional messaging gateways: Twilio (SMS) and SendGrid (email) deliver resident-requested resource lists when configured by the agency.",
      "Optional Realtime voice: When enabled, the browser opens a WebRTC/WebSocket audio stream to OpenAI using a single-session ephemeral token minted by the server.",
      "Isolated research worker: An optional background service drafts catalog updates from public web pages and never touches resident traffic.",
    ],
    limits: [
      "Architecture diagrams on this page are maintained manually against the codebase rather than auto-generated at build time.",
    ],
    sources: [
      "ARCHITECTURE.md",
      "backend/app/main.py",
      "backend/app/routers/intake.py",
      "backend/app/services/catalog_loader.py",
      "backend/app/services/data_pack.py",
      "backend/app/services/city.py",
      "backend/app/services/notify.py",
      "docs/DATA_PACK.md",
    ],
    related: ["stateless", "scaling"],
  },
  {
    id: "scaling",
    title: "Portable across cities, clouds, and low-signal mobile networks",
    detailsLabel: "Hosting model, multi-city isolation, and mobile performance",
    limitsLabel: "Current scaling constraints",
    roadmap:
      "Phase 2 establishes an Open AI Health Stack data and deployment standard alongside production-tested landing zones for AWS, Azure, and Google Cloud. Cities can pilot externally in a mirrored cloud environment first, then hand central IT a pre-vetted package for internal hosting.",
    summary:
      "Because the backend stores zero resident session state, any container replica can serve any request. Agencies can scale horizontally, survive restarts without dropping active intakes, and deploy onto AWS, Azure, or Google Cloud.",
    points: [
      "Client-carried state: Each request sends the scrubbed intake payload from the browser, removing the need for sticky sessions or a shared session cache.",
      "Cloud-agnostic packaging: Runs identically as a Docker container or serverless Vercel function. Starter infrastructure templates for AWS, Azure, and Google Cloud default to one to three replicas.",
      "In-memory speed: Service lookups resolve directly from RAM with zero database latency.",
      "Tenant isolation: Every jurisdiction runs an independent container, cloud project, and secret store. New cities deploy by supplying their own city.config.json and Data Pack (docs/CUSTOMIZING.md).",
      "Workload separation: The optional catalog research worker runs in its own environment with a dedicated Postgres instance so background scraping never competes with resident traffic.",
      "Strict payload budget: Initial load ships roughly 161 KB of compressed JavaScript, enforced by automated CI build checks and route-level code splitting.",
      "Verified field performance: Production mobile Lighthouse audits on 16 November 2026 (throttled slow 4G) scored 98 to 100 on performance and 100 on accessibility across home, directory, and intake views.",
    ],
    limits: [
      "Per-process counters: Rate limits and token budgets currently track in memory per replica. Multi-replica or serverless deployments multiply effective ceilings until centralized counters land.",
      "Budget backstop: Centralized Redis/shared state tracking is scheduled under ASG-SEC-02. Until then, hard billing caps in the operator's OpenAI project serve as the financial ceiling.",
      "Ephemeral console edits: Staff edits made in the demo console live in single-replica RAM and reset on container restart unless exported as a Data Pack.",
      "Keyword-only search today: Semantic vector search (pgvector) is scheduled for Phase 2; current directory search matches text tokens.",
      "Reference cloud templates: AWS, Azure, and GCP deployment templates are starter configurations awaiting live agency landing-zone hardening.",
      "Demo PIN routing: Enabling the private demo PIN gate on Vercel routes static assets through the function layer rather than edge CDN cache, which is acceptable at demonstration traffic volumes.",
    ],
    sources: [
      "deploy/README.md",
      "deploy/vercel/README.md",
      "deploy/railway/README.md",
      "backend/app/services/intake_state.py",
      "backend/app/defense/store_memory.py",
      "frontend/scripts/check-bundle-size.mjs",
      "docs/SECURITY_REMEDIATION_PLAN.md",
    ],
    related: ["cost"],
  },
  {
    id: "stateless",
    title: "Zero server-side conversation storage",
    detailsLabel: "Browser storage mechanics and server validation",
    limitsLabel: "Client-side storage boundaries",
    summary:
      "Conversation history and intake answers live exclusively in the resident's active browser tab. Every server request validates, scrubs, answers, and immediately discards the payload from memory.",
    points: [
      "Tab-scoped memory: Intake state lives in browser sessionStorage. Nothing writes to localStorage, cookies, or a backend database.",
      "Zero-trust request cycle: On every turn, the server validates schema and payload size, re-runs PII scrubbing, verifies service IDs against the loaded catalog, returns the response, and drops the request state.",
      "No persistent identifiers: The app generates no user accounts, session IDs, or shareable result URLs.",
      "Hard payload ceilings: Request byte size, turn count, and message length enforce strict maximums displayed in the \"Live runtime config\" panel.",
      "Clean exit: Clicking \"Start over\" or closing the browser tab erases sessionStorage immediately (standard page reloads preserve the active tab).",
    ],
    limits: [
      "Physical device access: Anyone viewing an unlocked, open browser tab can read the active screen.",
      "Untrusted client state: Because sessionStorage is unencrypted in the browser, the backend treats incoming client state as untrusted input and re-validates every field on every turn.",
      "Third-party processor retention: Retention at OpenAI, Twilio, or SendGrid is governed by the agency's vendor contracts rather than application code.",
      "Infrastructure access logs: Standard cloud load-balancer or hosting logs (IP address, timestamp, URL path) follow the operator's cloud logging policy.",
      "Debug voice logging: An optional Realtime voice diagnostic log (disabled by default) writes redacted event traces to disk; keep this off in resident-facing environments.",
    ],
    sources: [
      "frontend/src/lib/session.ts",
      "backend/app/services/intake_state.py",
      "backend/app/models.py",
      "backend/app/middleware.py",
      "backend/tests/test_stateless_intake.py",
      "backend/app/services/realtime_debug.py",
      "frontend/src/components/layout/StartOverButton.tsx",
    ],
    related: ["pii"],
  },
  {
    id: "pii",
    title: "Dual-pass deterministic PII scrubbing before model execution",
    detailsLabel: "Client and server scrubbing pipeline",
    limitsLabel: "Known pattern-matching gaps",
    roadmap:
      "Phase 2 adds a self-hosted multilingual named-entity recognition (NER) pass inside the agency's private network to catch uncued names and non-standard addresses before external API calls.",
    summary:
      "Deterministic regex and pattern rules strip phone numbers, SSNs, emails, and street addresses before text ever reaches an AI model. Scrubbing runs twice: first in the resident's browser, then again on the server.",
    points: [
      "Edge redaction: The browser replaces detected identifiers with tokens like [phone removed] prior to network transmission and notifies the resident inline.",
      "Server re-verification: Before logging, processing, or calling OpenAI, the server re-runs identical scrubbing rules across both the new message and the full conversation history.",
      "Transparent redaction notices: Whenever server-side scrubbing catches an identifier, the reply prepends a brief confirmation (suppressed only during active crisis responses so emergency numbers stay prominent).",
      "Shared test suite: Active redaction categories appear in the \"Scrubbed on this deployment\" panel and pass a shared cross-stack test suite covering both TypeScript and Python implementations.",
    ],
    limits: [
      "Uncued names: Names strip reliably after cues like \"my name is\", \"me llamo\", or \"mi nombre es\", or when two to three capitalized words follow \"I am\" or \"this is\". Standalone sign-offs like \"I'm Maria\" or \"Maria Lopez here\" can pass through.",
      "International phone formats: Phone matching targets US numbering formats; non-US numbers pass through unless structured like US digits.",
      "Partial addresses: Street references lacking a house number or standard street suffix (St, Ave, Blvd) are not stripped.",
      "Spoken number variations: Unconventional spoken phrasing of digits can evade pattern rules.",
      "Necessary situational context: Plain-language descriptions of health needs, household size, or housing loss pass through intentionally so the guide can match relevant services.",
      "URL query parameters: Directory keyword searches scrub in the browser but travel in the URL query string, which hosting access logs may record.",
      "Streaming audio exception: In optional Realtime raw-audio mode, live audio streams directly to OpenAI before text regex rules can fire; transcripts are scrubbed immediately upon return.",
    ],
    sources: [
      "frontend/src/lib/piiGuard.ts",
      "backend/app/services/pii.py",
      "backend/app/services/ai.py",
      "backend/app/services/intake_state.py",
      "backend/app/services/i18n.py",
      "backend/tests/fixtures/pii_cases.json",
    ],
  },
  {
    id: "ai-model",
    title: "AI handles multilingual conversation; deterministic rules decide service matches",
    detailsLabel: "Agent loop, deterministic matching, and voice modes",
    limitsLabel: "Model and voice operational limits",
    roadmap:
      "Phase 2 introduces native-speaker-verified evaluation suites across all supported languages executed automatically prior to every release.",
    summary:
      "The language model conducts empathetic, one-question-at-a-time intake and summarizes next steps, while deterministic Python rules compute program matches. Identical resident profiles always produce identical eligible service sets.",
    points: [
      "OpenAI Responses API: Active model IDs and reasoning levels appear live in the \"Live runtime config\" panel.",
      "Constrained tool execution: On each turn, the model can invoke strictly typed server tools to search the catalog, inspect a record, log structured profile attributes, run deterministic matching, switch languages, trigger crisis lines, or complete intake (wait_for_user supports voice pacing).",
      "Bounded agent rounds: Tool execution caps at a fixed round limit per turn; if exceeded, the server exits cleanly and links directly to matched results.",
      "Deterministic eligibility engine: Program rules evaluate in Python, never inside the LLM. Contradicted requirements exclude a service; unanswered criteria retain the service with a \"Check eligibility\" notice.",
      "Grounded action-plan ranking: A secondary, low-reasoning model call selects 3 to 5 priority services from the top 12 rule matches and explains why each matters. Demo personas bypass this call for pure rules ordering, and non-English plans substitute pre-translated reason strings whenever available.",
      "Strict system prompt guardrails: Prompt instructions enforce single-question turns, forbid inventing programs, prohibit asking for names or ID numbers, and mandate immediate crisis tool execution when risk surfaces.",
      "Zero-retention API flag: Every OpenAI call passes store=False so responses are not stored for retrieval beyond single-turn reasoning.",
      "Resilient fallback: When run without an API key, in demo mode, or during an upstream outage, chat seamlessly drops back to scripted intake questions for that turn and retries live AI on the next message.",
      "Default voice (on-device STT/TTS): Speech converts to text locally in the browser, passes through PII scrubbing, and sends text only. Device text-to-speech reads conversational replies while skipping phone numbers, URLs, addresses, and eligibility caveats so contact info comes strictly from visual catalog cards.",
      "Optional Realtime voice: With explicit server flags and resident consent, browser audio streams to OpenAI's Realtime API for low-latency multilingual voice conversation.",
    ],
    limits: [
      "store=False vs. Zero Data Retention (ZDR): Passing store=False disables API response storage, but OpenAI may retain abuse-monitoring logs up to 30 days unless covered by an enterprise ZDR agreement.",
      "Non-deterministic slot extraction: While matching rules are deterministic, natural-language extraction into profile fields can vary across phrasing or repeated runs.",
      "Unreviewed dynamic translations: Conversational AI replies in non-English languages generate dynamically without human translator sign-off.",
      "Evaluation coverage: Automated multilingual answer-quality benchmarks are not yet in CI.",
      "Raw-audio privacy trade-off: Streaming Realtime voice sends unredacted audio and client IP directly to OpenAI prior to transcript scrubbing, and bypasses local read-aloud filtering.",
      "Contracting prerequisite: Agencies should enable Realtime raw-audio mode only after executing an appropriate Zero Data Retention or BAA/DPA contract with OpenAI.",
    ],
    sources: [
      "backend/app/config.py",
      "backend/app/services/ai.py",
      "backend/app/services/prompts.py",
      "backend/app/services/tool_schemas.py",
      "backend/app/services/tools.py",
      "backend/app/services/matching.py",
      "backend/app/services/eligibility.py",
      "backend/app/services/plan.py",
      "backend/app/services/scripted.py",
      "backend/app/services/realtime.py",
      "frontend/src/lib/speech.ts",
      "frontend/src/hooks/useOnDeviceVoiceIntake.ts",
      "frontend/src/hooks/useRealtimeVoiceSession.ts",
      "frontend/src/components/chat/useIntakeVoice.ts",
      "frontend/src/components/chat/voiceStart.ts",
    ],
  },
  {
    id: "safety",
    title: "Defense-in-depth guardrails from crisis routing to catalog grounding",
    detailsLabel: "Closed-catalog grounding checks",
    limitsLabel: "Conversational prose and unverified demo records",
    roadmap:
      "Phase 2 adds named staff verification workflows with provider sign-off timestamps displayed publicly on every program card.",
    summary:
      "Independent technical controls prevent hallucinated contact info, intercept acute emergencies, strip PII, and gate catalog changes behind human review.",
    points: [
      "Strict ID allowlisting: Every service ID returned by the model or submitted by client state is validated against the in-memory catalog; unrecognized IDs are dropped silently and counted only in aggregate metrics.",
      "Structured card rendering: Program names, phone numbers, street addresses, and URLs render exclusively from verified YAML catalog objects, never from model prose.",
      "Verified SMS/email payloads: Outbound text and email summaries pull contact fields solely from catalog records.",
      "Match-locked action plans: Ranked next steps can reference only service IDs already validated in the resident's deterministic match set.",
    ],
    limits: [
      "Unchecked freeform prose: While cards are strictly grounded, conversational chat text and step summaries come from the model (capped by length). On round-trip requests, prose scrubs emails, payment cards, SSNs, DOBs, and IDs, though not street names or phone strings.",
      "Potential prose drift: Model-generated explanations are not fact-checked line-by-line against provider policies.",
      "Unverified seed catalog: Records bundled in the reference Austin demo dataset have not yet undergone formal provider sign-off. Live counts of staff-verified entries appear in the \"Live runtime config\" box.",
    ],
    sources: [
      "backend/app/services/grounding.py",
      "backend/app/services/tools.py",
      "backend/app/services/plan.py",
      "backend/app/services/intake_state.py",
      "backend/app/routers/intake.py",
      "docs/DATA_PACK.md",
      "config/services.schema.json",
    ],
    related: ["status"],
  },
  {
    id: "crisis",
    title: "Deterministic crisis interception fires before any AI call",
    detailsLabel: "Multilingual crisis detection and pinned routing",
    limitsLabel: "Crisis detection boundaries",
    roadmap:
      "Phase 2 delivers native-speaker clinical review across all eight language lists alongside published latency and recall benchmarks.",
    summary:
      "Any message indicating suicide, self-harm, domestic violence, or immediate physical danger in any supported language triggers instant emergency contacts before an AI model is ever called. Crisis resources remain pinned for the rest of the session.",
    points: [
      "Pre-AI phrase matching: Every text turn and voice transcript runs against normalized phrase lists (case-, accent-, and punctuation-insensitive) across English, Spanish, French, Vietnamese, Chinese, Korean, Arabic, and Hindi.",
      "Instant deterministic response: On any match, the server bypasses OpenAI completely and returns 988, 911, the National Domestic Violence Hotline, and local jurisdiction crisis lines (leading with 911 for immediate physical danger). Scripted fallback mode runs the exact same check.",
      "Secondary AI safety net: System instructions also equip the model with a dedicated crisis tool for indirect phrasing; invoking it flags the session and forces full 988 and hotline display even if omitted from model text.",
      "Offline-resilient UI banner: Once flagged, a high-contrast tap-to-call banner pins to the top of chat and results views. Core national hotlines (911, 988, NDVH) are compiled into the frontend bundle so they render even if backend requests fail.",
      "Priority plan ordering: Crisis-designated catalog services automatically lock to the top of every action plan.",
      "Exempt from rate limits: Spending caps, rate limiters, and circuit breakers never block or throttle crisis responses.",
      "Constrained Realtime voice handling: If a live audio session detects crisis intent, spoken output restricts strictly to reading emergency hotline numbers.",
      "Non-blocking continuation: Residents can still browse or continue searching for social services while the crisis banner stays pinned.",
    ],
    limits: [
      "Pending native-speaker audit: Non-English crisis phrase lists were translated internally and await formal clinical/native-speaker review.",
      "Indirect phrasing: Subtle or indirect expressions of distress that miss deterministic phrase lists rely on the active AI model (and will not trigger when AI is off in scripted mode).",
      "False-positive trade-off: Exclusion rules filter out benign phrases like \"in danger of losing our apartment,\" but edge-case false positives remain accepted by design so real emergencies are never missed.",
      "Partial banner localization: Deterministic crisis reply text currently ships in English and Spanish (defaulting to English elsewhere), while results-page crisis cards translate across English, Spanish, Vietnamese, Chinese, and Arabic. Realtime voice translates dynamically, carrying minor pronunciation or phrasing risk.",
      "Audio stream timing: In optional Realtime raw-audio mode, spoken audio reaches OpenAI before transcript interception runs.",
      "Unmonitored tool: This application is an automated directory, not a staffed crisis hotline; no human monitors live chats.",
    ],
    sources: [
      "backend/app/services/crisis.py",
      "backend/app/services/crisis_phrases.py",
      "backend/app/services/ai.py",
      "backend/app/services/tools.py",
      "backend/app/services/plan.py",
      "backend/app/services/realtime.py",
      "frontend/src/hooks/useRealtimeVoiceSession.ts",
      "frontend/src/components/common/CrisisLinesBlock.tsx",
      "backend/app/data/crisis_resources.yaml",
    ],
  },
  {
    id: "cost",
    title: "Abuse defenses and hard budget circuit breakers that never block help",
    detailsLabel: "Rate limiting, proof-of-work, and circuit breakers",
    limitsLabel: "Current cost-control limits",
    roadmap:
      "Upcoming sprints move quota state into a shared store across replicas (ASG-SEC-02) and add real-time budget alerting in the staff console (issue #30).",
    summary:
      "Paid capabilities (LLM turns, Realtime voice, SMS/email) enforce per-client rate limits, token budgets, and automatic circuit breakers. If a cap trips, chat degrades gracefully to scripted intake while directory search, maps, and crisis lines stay 100% available.",
    points: [
      "Granular per-feature quotas: Default limits cap individual users (e.g., 20 chat turns/minute, 300/day), keyed by demo PIN, browser device token, or salted network hash.",
      "NAT-friendly proof-of-work: On public deployments without PIN gates, the browser completes a lightweight cryptographic puzzle before its first AI call to earn a 24-hour device token, preventing families or clinic kiosks on shared cellular/Wi-Fi IPs from exhausting a single quota.",
      "Token and dollar metering: Every model call tracks input/output tokens and estimated spend against per-user hourly/daily limits and site-wide ceilings.",
      "Automatic circuit breakers: Paid AI, voice, and messaging pause automatically if budgets trip, upstream OpenAI credits run dry, error rates exceed 50% across 20+ calls in five minutes, or an operator flips the manual kill switch.",
      "Self-healing cooldowns: Credit-exhaustion pauses retry automatically every five minutes and display a customizable agency notice banner.",
      "Privacy-preserving counters: Quota keys hash truncated IP addresses with a daily-rotating secret key; raw IPs and message content are never written to limiter memory, and SMS/email destination hashes cap at three sends per day.",
    ],
    limits: [
      "Replica-local memory: Counters reset on container restart and scale linearly across multiple replicas until shared state lands.",
      "Estimated pricing: Dollar figures calculate from static token rate tables rather than live OpenAI billing webhooks.",
      "Advisory voice duration: Until server-brokered Realtime audio lands (issue #29), active WebRTC voice sessions can run slightly past initial budget checks.",
      "Bot deterrence scope: Client proof-of-work stops casual scraping scripts, not well-resourced distributed attacks.",
      "Passive alerting: Tripped circuit breakers log internally today; automated staff alerting arrives in issue #30.",
    ],
    sources: [
      "backend/app/defense/limits.py",
      "backend/app/defense/budget.py",
      "backend/app/defense/breakers.py",
      "backend/app/defense/principal.py",
      "backend/app/defense/challenge.py",
      "backend/app/services/city.py",
      "SECURITY.md",
      "docs/PRIVACY.md",
    ],
    related: ["scaling"],
  },
  {
    id: "staff-tools",
    title: "Staff console and PII-guarded partner spreadsheet imports",
    detailsLabel: "Console workflows and partner-import safeguards",
    limitsLabel: "Console and importer constraints",
    roadmap:
      "Phase 2 connects recurring 211 and coalition partner feeds into a persistent staff review queue and introduces privacy-office-approved anonymized demand signals (counts by need category, language, and ZIP code, with zero conversation text).",
    summary:
      "The administrative console previews how public health staff curate service rules, audit catalog health, and convert partner spreadsheets into clean draft listings. Resident and analytics views display synthetic demo data while reading the live service catalog.",
    points: [
      "Safe demonstration views: Utilization charts, audit logs, and sample cases use synthetic records so reviewers can evaluate agency workflows with zero resident privacy risk.",
      "Schema-validated authoring: Staff edit eligibility logic and program listings against strict JSON/YAML Data Pack contracts and export clean packages in one click.",
      "Partner spreadsheet ingestion: Disabled by default behind a staff secret, the importer converts partner .xlsx, .csv, and .docx program rosters into structured draft records.",
      "Automated staff/client PII stripping: Columns containing staff mobile numbers, direct emails, contact names, or internal notes drop automatically, and cell-level regex scrubs stray identifiers from kept fields.",
      "Client-roster rejection: Any file containing client-level headers (such as Client Name, DOB, or SSN) is rejected outright before parsing.",
      "In-memory macro-safe parsing: Uploaded files parse in memory for a single request without executing spreadsheet formulas or macros, returning a downloadable .zip of drafts directly to the staff browser.",
      "Optional AI field structuring: When explicitly enabled, an AI helper formats operating hours, addresses, and categories from pre-scrubbed cells without ever receiving phone numbers, emails, or URLs.",
    ],
    limits: [
      "Synthetic analytics today: Demand dashboards currently render static sample datasets.",
      "Single-replica edit memory: Console catalog edits stay in process RAM until exported as a Data Pack.",
      "Uncued prose names: Pattern filters cannot catch every freeform personal name inside program descriptions (e.g., \"Run by Jordan Smith\"), making human review mandatory on every draft.",
      "Manual Git/Data Pack promotion: Exported drafts never overwrite production automatically; staff commit reviewed YAML files into the Data Pack.",
    ],
    sources: [
      "backend/app/routers/admin.py",
      "backend/app/routers/admin_pack.py",
      "backend/app/data/admin_demo.yaml",
      "frontend/src/hooks/useAuth.tsx",
      "backend/app/routers/partner_import.py",
      "backend/app/services/partner_import/guard.py",
      "backend/app/services/partner_import/filters.py",
      "docs/PRIVACY.md",
    ],
    related: ["research"],
  },
  {
    id: "research",
    title: "Citation-backed catalog research agent with mandatory staff sign-off",
    detailsLabel: "Grounded discovery, SSRF defenses, and evidence verification",
    limitsLabel: "Research worker boundaries",
    roadmap:
      "Phase 2 schedules recurring background checks against provider URLs to catch changed hours, phone numbers, or closures automatically and stage diffs for staff approval.",
    summary:
      "Staff enter a county and service category (such as food pantries) to generate draft directory records from public provider websites. Every extracted field requires a verbatim source quote and URL, and nothing reaches residents without human approval.",
    points: [
      "Human-gated pipeline (Diagram D): The AI proposes an official-site search plan, staff edit and approve the plan, the isolated worker fetches public pages, the model extracts structured listings, deterministic code verifies verbatim quotes and flags duplicates, and staff review before export.",
      "Pre-execution approval: Zero web searches run until a staff reviewer approves or trims the proposed query list.",
      "Verbatim quote verification: Every extracted attribute must include an exact substring quote from the fetched HTML. Any field lacking a verified on-page quote is wiped blank and flagged for human inspection rather than guessed.",
      "Grounded contact info: Phone numbers and emails must appear verbatim on the source page, URLs must match the page or an on-page link, and locations missing an explicit street address are discarded.",
      "Off-topic pruning: Programs outside the requested category (such as computer labs listed on a food pantry page) are skipped and logged.",
      "Fuzzy deduplication: Drafts cross-check against existing catalog records and sibling drafts across name, organization, address, phone, and URL, flagging potential overlaps without auto-merging.",
      "SSRF and crawler hygiene: The fetcher blocks private/internal IP ranges on initial requests and every HTTP redirect, enforces a 2 MB page ceiling, obeys robots.txt, throttles per-domain request rates, and skips social media and people-search domains.",
      "Pluggable search backend: Operators choose between self-hosted SearXNG (zero per-query cost, search queries stay internal) or OpenAI Web Search (managed, per-query fee).",
      "Benchmarked unit cost: Two Travis County food-pantry test runs (capped at 10 drafts across ~20 pages) cost ~$0.17 via private SearXNG and ~$0.76 via OpenAI Web Search.",
      "Hard job budgets: Every job enforces strict ceilings on dollar spend, queries, pages fetched, drafts created, and wall-clock runtime, preserving partial drafts if a cap hits.",
      "Network-isolated worker: Runs as a standalone service (deployed on Railway with private Postgres and SearXNG in our reference setup), reachable from the main app exclusively via short-lived, single-use HMAC-signed requests.",
      "Zero resident data exposure: The worker processes only public web pages and staff topic prompts, with all OpenAI calls passing store=False.",
    ],
    limits: [
      "Unverified draft export: Accepting a draft exports clean YAML with verification flags stripped; direct provider confirmation remains a separate staff step.",
      "Manual promotion: Exported .zip packages never auto-publish into the live resident directory.",
      "Single-job queue: Research jobs execute sequentially one at a time.",
      "Unreachable robots.txt behavior: If a target server's robots.txt times out or errors, page fetch proceeds under standard rate throttling.",
      "Pre-step cost estimation: Spend caps evaluate prior to each step using static token price tables (excluding hosting overhead), so final job cost can land a few cents above the threshold.",
      "Paraphrased summaries: While backed by verified quotes, plain-language service descriptions and eligibility summaries are phrased by the model and require staff review.",
      "HTML-only parser: PDF documents and client-rendered single-page JavaScript sites are currently skipped.",
      "Disabled by default: Requires deploying the standalone worker service with an active OpenAI API key.",
    ],
    sources: [
      "backend/app/research/pipeline.py",
      "backend/app/research/plan.py",
      "backend/app/research/search.py",
      "backend/app/research/fetch.py",
      "backend/app/research/extract.py",
      "backend/app/research/evidence.py",
      "backend/app/research/export.py",
      "backend/app/services/dedupe.py",
      "backend/app/jobs/auth.py",
      "backend/app/jobs/settings.py",
      ".railway/railway.ts",
      "deploy/railway/README.md",
    ],
  },
  {
    id: "status",
    title: "Production readiness: active today, in progress, and Phase 2 grant roadmap",
    detailsLabel: "How readiness states are tracked",
    limitsLabel: "Current demonstration boundaries",
    summary:
      "Core privacy, crisis-first routing, closed-catalog grounding, and web security controls run live today. Role-based staff authentication, centralized rate-limit stores, and enterprise vendor agreements are tracked next. Phase 2 delivers the grant-funded multi-city standard, cloud landing zones, and verified catalog workflows.",
    points: [
      "Three clear states: \"In place\" means running in this deployment today. \"In progress\" means tracked in an active GitHub issue and under development. \"Phase 2 roadmap\" defines the multi-city replication, governance, and hardening milestones scoped for grant execution.",
      "Issue tracking: Abuse and budget hardening track under issue #25; full staff console persistence and RBAC track under issue #14.",
      "Formal security review: Our 16 November 2026 security assessment and prioritized remediation plan document every prerequisite prior to open public launch (linked in the footer).",
    ],
    limits: [
      "Reference demo posture: Do not enter real resident case records until \"In progress\" engineering items, enterprise vendor DPAs/ZDRs, provider catalog sign-offs, and agency privacy-office reviews are complete.",
      "Simulated staff auth: Staff console login is currently a client-side UI stub; read endpoints are open behind the demo gate, and write endpoints authenticate via a single shared secret rather than named staff accounts.",
      "Private demo PIN gate: Access codes gate preview builds per reviewer group without user accounts or visitor tracking logs.",
    ],
    sources: [
      "backend/app/security_headers.py",
      "backend/app/access_gate.py",
      "backend/app/routers/admin.py",
      "backend/app/middleware.py",
      "Dockerfile",
      "SECURITY.md",
      "docs/SECURITY_ASSESSMENT_2026-11-16.md",
      "docs/SECURITY_REMEDIATION_PLAN.md",
    ],
  },
];

/* ---- protection status: flip `status` when an item lands ---- */

export type ProtectionStatus = "in_place" | "in_progress" | "not_planned";

export interface Protection {
  label: string;
  status: ProtectionStatus;
  /** GitHub issue that tracks it (linked when the city config names the repo). */
  issue?: number;
}

export const STATUS_LABELS: Record<ProtectionStatus, string> = {
  in_place: "In place",
  in_progress: "In progress",
  not_planned: "Phase 2 roadmap: multi-city standard and replication",
};

export const PROTECTIONS: Protection[] = [
  { status: "in_place", label: "Strict HTTP security headers on every response and Content Security Policy (CSP) across all resident and staff routes (excluding /docs and /redoc)" },
  { status: "in_place", label: "Hard byte, turn-count, and message-length caps on all intake payloads" },
  { status: "in_place", label: "Configurable PIN access gate for private reviewer deployments" },
  { status: "in_place", label: "Shared-secret authentication on staff catalog write endpoints (writes fail closed when unset)" },
  { status: "in_place", label: "Country-code allowlisting on outbound SMS referrals" },
  { status: "in_place", label: "Redacted server logging: phone numbers and emails mask automatically, and exceptions log class types rather than raw message payloads" },
  { status: "in_place", label: "Hardened Docker runtime executing as a non-root user with a read-only root filesystem in reference Compose configs" },
  { status: "in_place", issue: 26, label: "Per-feature rate limiting keyed by proof-of-work device tokens and rotated IP hashes so shared clinic or mobile networks never share one quota (per-replica memory; crisis routes exempt)" },
  { status: "in_place", issue: 27, label: "Token and voice-minute circuit breakers that pause paid AI calls while keeping directory browse and crisis hotlines 100% live (advisory on streaming voice until #29)" },
  { status: "in_progress", issue: 28, label: "Automated off-topic/prompt-abuse detection with progressive strikes, temporary blocks, and structured incident logs" },
  { status: "in_progress", issue: 29, label: "Server-brokered Realtime voice proxy enforcing hard per-session duration and budget cutoffs" },
  { status: "in_progress", issue: 30, label: "Dedicated staff operations view for token spend, tripped circuit breakers, and abuse alerts" },
  { status: "in_progress", issue: 14, label: "Role-based staff authentication (RBAC), persistent database catalog storage, audit trails, and live utilization reporting" },
  { status: "in_place", issue: 20, label: "Schema-validated service authoring and eligibility rule editing in the staff console (in-memory until exported as a Data Pack)" },
  { status: "in_place", issue: 18, label: "Isolated catalog research worker on Railway that drafts source-quoted program entries from public web pages behind staff search-plan approval and manual Data Pack merge" },
  // Phase 2 roadmap (status not_planned): planned next steps, none of them built. Write each as a plan.
  { status: "not_planned", label: "Open AI Health Stack specification standardizing municipal service Data Packs and city.config.json schemas across jurisdictions" },
  { status: "not_planned", label: "Multi-city cohort replication (\"prove outside, adopt inside\") enabling partner cities to pilot in mirrored cloud environments before internal IT cutover" },
  { status: "not_planned", label: "Production-hardened AWS, Azure, and Google Cloud landing-zone templates validated in live municipal cloud accounts" },
  { status: "not_planned", label: "Named staff verification workflows displaying provider confirmation dates and reviewer attribution on public service cards" },
  { status: "not_planned", label: "Automated staging pipelines ingesting recurring 211 exports and coalition partner rosters directly into the staff review queue" },
  { status: "not_planned", label: "Scheduled drift detection re-checking provider websites for changed hours, phone numbers, or eligibility rules and staging diffs for staff sign-off" },
  { status: "not_planned", label: "Privacy-office-vetted anonymized demand telemetry reporting unmet needs by category, language, and ZIP code with zero stored conversation text" },
  { status: "not_planned", label: "Self-hosted multilingual named-entity recognition (NER) catching uncued personal names and international addresses inside the private network prior to LLM calls" },
  { status: "not_planned", label: "Published crisis-interception latency and recall benchmarks backed by native-speaker clinical review across all supported languages" },
  { status: "not_planned", label: "Executed agency Data Processing Agreements (DPAs) and Zero Data Retention (ZDR) contracts covering OpenAI, Twilio, and SendGrid" },
  { status: "not_planned", label: "Formal municipal privacy-office and legal sign-off on resident AI, voice consent, and data-handling disclosures" },
];
