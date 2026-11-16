/* ------------------------------------------------------------------ */
/*  "How it works" copy. Plain data: no React, no live values.         */
/*                                                                     */
/*  Every claim here must match the files in its `sources` (repo-      */
/*  relative paths; content.test.ts checks they exist). When the code  */
/*  or SECURITY.md changes, change this file in the same PR: the code  */
/*  and the docs win over this page. Live values (model, effort, voice */
/*  mode, counts) come from GET /api/v1/about and are not written here.*/
/* ------------------------------------------------------------------ */

export interface HowItWorksSection {
  /** Anchor id (/how-it-works#<id>). */
  id: string;
  title: string;
  /** One plain sentence or two (reading level target: grade 9). */
  summary: string;
  points: string[];
  limits: string[];
  /** Repo-relative paths, shown as "Where this is in the code". */
  sources: string[];
}

export const SECTIONS: HowItWorksSection[] = [
  {
    id: "what-this-is",
    title: "What this is",
    summary:
      "A demonstration guide that helps residents find local services. It hides services whose listed rules your answers rule out, but it does not make eligibility decisions, take applications or keep case records.",
    points: [
      "It suggests services from a catalog of city, county, state, federal and nonprofit programs. Residents can browse by topic, use the map, or answer questions by chat or voice.",
      "It is a demonstration. It is not a benefits application, a case-management system or an eligibility decision.",
      "It has two parts: the resident site and a staff console. The console shows made-up residents, analytics, staff and audit entries. Its service directory is the live catalog.",
      "The whole intake works without an account or sign-in.",
    ],
    limits: [
      "The staff console is a demo. Its sign-in is simulated in the browser and its numbers are sample data.",
      "Results are suggestions to check with each provider. They are not a promise of eligibility or of a place in a program.",
      "The resident \"Sign In\" page is a demo too. It creates no account on the server, but it saves the email typed into it in this browser's localStorage until the resident signs out.",
    ],
    sources: [
      "CLAUDE.md",
      "backend/app/main.py",
      "backend/app/services/seed_data.py",
      "backend/app/data/admin_demo.yaml",
      "frontend/src/hooks/useAuth.tsx",
    ],
  },
  {
    id: "architecture",
    title: "How the parts fit together",
    summary:
      "A web page in your browser talks to one server. The server holds the service catalog in memory and calls OpenAI for the chat.",
    points: [
      "The browser app is built with React. The server is one FastAPI process.",
      "The catalog is a set of YAML files (the data pack) read into memory when the server starts. There is no database. The data pack format is described in docs/DATA_PACK.md, with schemas in config/schemas/.",
      "Only the server calls OpenAI for text. The OpenAI key never reaches the browser.",
      "If the operator sets them up, Twilio (text messages) and SendGrid (email) send a resident the list of services they asked for.",
      "In the optional raw-audio voice mode, the browser connects to OpenAI directly, using a short-lived key the server creates for that one voice session.",
      "If the operator sets one up, a separate job worker runs the staff catalog research agent, described further down. Resident intakes never go to it.",
    ],
    limits: [
      "Catalog edits made in the staff console live in one server's memory. They are lost on restart and are not shared between server copies.",
      "The diagrams on this page are drawn by hand from the code. They are not generated from it.",
    ],
    sources: [
      "ARCHITECTURE.md",
      "backend/app/main.py",
      "backend/app/routers/intake.py",
      "backend/app/services/catalog_loader.py",
      "backend/app/services/notify.py",
      "docs/DATA_PACK.md",
    ],
  },
  {
    id: "ai-model",
    title: "The AI model and how it is used",
    summary:
      "One OpenAI model runs the text chat; raw-audio voice uses a separate realtime model. The model can look things up in the catalog through a fixed set of tools. Fixed rules, not the model, decide which services match.",
    points: [
      "Text chat uses the OpenAI Responses API. The model and its reasoning setting are shown in the box below, read from the running server.",
      "Each resident message starts a short loop. The model may ask the server to run a tool, the server runs it and sends back the result, and this repeats up to a set number of rounds. If the model has not replied by then, the resident gets a fixed message pointing to the results.",
      "The model can search and read catalog records, note facts about the resident's situation, run the matching rules, switch language, show crisis lines and finish the intake. The box below lists every tool the text model is offered, including wait_for_user, which is meant for voice.",
      "After matching, a separate model call picks three to five of the first twelve matched services, puts them in order and writes a short reason for each. Its reasoning setting is low by default. Demo personas skip it and get the rules-based order with no model call. When results are shown in a language other than English, a step's reason is replaced by a fixed translated reason where one exists.",
      "Every text call is sent with store=False, which tells OpenAI not to store the response for later retrieval. The model's reasoning is reused only within one message and is not carried to the next.",
      "If no OpenAI key is set or DEMO_MODE is on, a fixed set of scripted questions runs and no model is called. If one call to OpenAI fails, only that message is answered by the scripted questions, with a short notice; the next message tries the model again. A failed plan call falls back to the rules-based order.",
      "If OpenAI says the account is out of credits or over its spend limit, the AI pauses for five minutes at a time on that server instance, then one message tries it again; meanwhile the scripted questions carry on. The chat says why once, and the intake page shows it as a banner, using the operator's own words from the city config, shown in English in every language.",
      "Voice has two modes. In the default mode the browser turns speech into text on the device, removes identifiers, and sends only text. Replies are read aloud by the device's own voices.",
      "In the optional raw-audio mode, microphone audio streams from the browser to the OpenAI Realtime API. This mode needs two server settings turned on and live AI, and the resident sees a badge and is asked for consent first.",
      "In raw-audio mode the voice model greets the resident first. Its instructions tell it to switch language when the resident speaks a different one; that is an instruction to the model, and the model may not follow it. Speech-to-text is not fixed to one language.",
    ],
    limits: [
      "store=False is not zero data retention. OpenAI may keep inputs and outputs for a limited time for abuse monitoring.",
      "In raw-audio mode the audio reaches OpenAI before this server sees anything, so the audio cannot be redacted. The server redacts the transcript only after OpenAI returns it.",
      "In raw-audio mode OpenAI also sees the resident's network address, because the browser connects to it directly.",
      "Raw-audio mode should be turned on only after the operator has a data retention agreement with OpenAI that covers it. The app cannot check for one.",
      "The default voice mode needs a recent browser with an on-device speech pack. Other browsers get text chat only.",
    ],
    sources: [
      "backend/app/config.py",
      "backend/app/services/ai.py",
      "backend/app/services/tool_schemas.py",
      "backend/app/services/tools.py",
      "backend/app/services/plan.py",
      "backend/app/services/scripted.py",
      "backend/app/services/realtime.py",
      "frontend/src/hooks/useOnDeviceVoiceIntake.ts",
      "frontend/src/hooks/useRealtimeVoiceSession.ts",
      "frontend/src/components/chat/useIntakeVoice.ts",
      "frontend/src/components/chat/voiceStart.ts",
    ],
  },
  {
    id: "pii",
    title: "Keeping personal identifiers out of the model",
    summary:
      "Before a message reaches the model, fixed pattern rules remove things like phone numbers, Social Security numbers and street addresses. The rules run twice: in the browser, then again on the server.",
    points: [
      "The browser removes identifiers from a message before sending it. It shows a general notice that personal details were removed, and the sent message has a placeholder where each one was.",
      "The server removes them again before the message is kept in the conversation, written to a log or sent to a model. On every request it also re-runs the rules over the whole conversation and profile the browser sends back.",
      "The kinds of identifier removed are listed below, read from the server's rules. Each is replaced with a placeholder such as [phone removed].",
      "The rules are fixed patterns. No AI is involved. The browser and server versions agree on all shared test cases.",
      "When the server removes something, its reply starts with a short notice saying so (a crisis reply skips the notice).",
    ],
    limits: [
      "A name is removed only after \"my name is\", \"me llamo\" or \"mi nombre es\", or when it is two or three capitalized words after \"I am\", \"I'm\" or \"this is\". \"I'm Maria\" and \"Maria Lopez here\" are not caught.",
      "Phone numbers are matched in US formats only. Phone numbers from other countries are not caught unless they happen to look like a US number.",
      "An address without a house number or a street word (such as Street or Ave) is not caught.",
      "Unusual ways of saying numbers out loud can be missed.",
      "Things described in plain words, such as a diagnosis or a family situation, are sent on purpose. They are usually why the resident is here.",
      "Directory search text is scrubbed in the browser, but it travels in the page address, so it can appear in hosting request logs.",
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
    id: "stateless",
    title: "The server does not store your intake",
    summary:
      "Your conversation and answers stay in your browser tab. Each request carries them to the server, which checks them, replies, and does not store them.",
    points: [
      "The intake is kept in the tab's sessionStorage. It is not kept in a database, in localStorage or on the server.",
      "Every request carries the stored intake. The server checks its shape and size, removes identifiers again, re-checks service ids against the catalog, replies, and forgets it.",
      "There is no account, no session id and no shareable results link.",
      "Request size, number of messages and message length are capped. The caps are shown below.",
      "\"Start over\" clears the stored intake. Closing the tab clears it too. Reloading the page does not.",
    ],
    limits: [
      "Anyone with access to the open tab can read it.",
      "The stored intake is not signed or encrypted. A resident can edit their own copy, so the server treats it as untrusted.",
      "What OpenAI and the text and email vendors keep is set by their terms, not by this app.",
      "The hosting platform's request logs (network address, time and page path) are kept however the operator has set them up. This app does not control them.",
      "If the operator turns on the voice troubleshooting log (off by default), redacted voice events are written to a file on the server, and anyone who can open the site can read them back through its debug endpoints.",
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
  },
  {
    id: "grounding",
    title: "Only real catalog services are shown",
    summary:
      "Service cards, phone numbers and addresses come from the catalog, not from the model. A service the model or the browser names that is not in the catalog is dropped.",
    points: [
      "Every service id from the model, or from the browser's stored intake, is checked against the loaded catalog. Unknown ids are dropped. Only the number dropped is logged.",
      "Cards, phone numbers, addresses and links are built from catalog records.",
      "The text or email a resident can send themselves is built from catalog records only.",
      "Plan steps can only name services in the resident's match list.",
    ],
    limits: [
      "The model still writes the chat replies, the plan summary and the reason for each step. They are length-capped and reach the browser as the model wrote them. When the browser sends them back, only email addresses, card numbers, Social Security numbers, dates of birth and ID numbers are removed from them, not phone numbers, addresses or names.",
      "That model text is not fact-checked. A reply could say something the catalog does not.",
      "Staff have not yet checked the bundled reference catalog against the providers. The count above shows how many services in this deployment record who checked them and when.",
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
  },
  {
    id: "crisis",
    title: "Crisis interruption",
    summary:
      "If a message states a crisis, in any language this app offers, the server replies at once with crisis lines, and the lines stay on screen for the rest of the intake.",
    points: [
      "Before any model call, the server checks each typed message and voice transcript against phrase lists about suicide, self-harm, domestic violence and immediate danger, in English, Spanish, French, Vietnamese, Chinese, Korean, Arabic and Hindi. Case, accents and punctuation do not change the result.",
      "On a match it replies at once with 988, 9-1-1, the National Domestic Violence Hotline and this place's local crisis lines. The model is not called for that message. A statement of immediate danger leads with 9-1-1. The same check runs in the scripted flow.",
      "The model also has a crisis tool, and its instructions tell it to call that tool right away. When it calls the tool, or records a crisis while noting facts about the resident, the intake is marked as a crisis, and if the model's reply leaves out 988 the full list of crisis lines is added to it.",
      "Once a crisis is marked, the chat and the results page keep a crisis-lines block at the top with tap-to-call buttons. 9-1-1, 988 and the National Domestic Violence Hotline are built into the page, so the block shows even when the server's list of crisis lines cannot be loaded.",
      "The plan always starts with the services the data pack marks as crisis-direct, whether the rules or the model ordered it. A crisis-direct service the model left out is added at the top.",
      "In raw-audio voice, a crisis transcript or crisis tool call gets a reply limited to reading the crisis lines, with no tool calls.",
      "The resident can carry on with the intake after the crisis lines are shown.",
      "Rate limits, AI budgets and circuit breakers never hold back a crisis turn: it gets the crisis reply even when the resident is over a limit or the AI is paused, and the crisis-lines list has no limit.",
    ],
    limits: [
      "The non-English phrase lists are the project's own translations and still need review by native speakers. No list catches every way a crisis can be said: a crisis described indirectly depends on the model noticing it, and in the scripted flow it is not caught.",
      "The lists leave out common ordinary sentences such as \"we are in danger of losing our apartment\", but a message with no crisis can still match. Showing crisis lines when they were not needed is the accepted trade-off.",
      "The crisis reply text is written in English and Spanish; other languages get the English text. The crisis-lines block is in English in the chat and translated on the results page for Spanish, Vietnamese, Chinese and Arabic. In raw-audio voice the voice model reads, and for other languages translates, the crisis message, and could misread it.",
      "In raw-audio mode the audio has already reached OpenAI before the check runs on the transcript.",
      "This is not a crisis service. Nobody monitors conversations.",
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
    id: "consistency",
    title: "How matching stays consistent",
    summary:
      "Fixed rules decide which services match, so the same profile gives the same matches. The model asks the questions, fills in the profile and explains the results.",
    points: [
      "Matching uses rules, not the model. The same profile gives the same matches with the same confidence. The model gathers facts, runs the rules through a tool, and explains what they found.",
      "A service can list eligibility requirements. If the resident's answers contradict one, the service is not shown. If the answers do not say, the service is shown at low confidence with a \"Check eligibility\" note.",
      "The model's instructions tell it to ask one question at a time, never invent services, never ask for names or ID numbers, and call the crisis tool right away when needed.",
      "Each message has a cap on tool rounds and on reply length. If a call to OpenAI fails, that message is answered by the scripted questions.",
      "In the default voice mode, any sentence in the model's text that contains a phone number, address, web link, email address or eligibility statement is skipped when the reply is read aloud. Contact details are read from catalog records only.",
    ],
    limits: [
      "The model turns the resident's words into profile fields, so the same words can give a different profile, and so different matches, on another run.",
      "Wording changes from one run to the next.",
      "The repository has no automated test of answer quality.",
      "Replies in other languages are written by the model as it goes. No translator has reviewed them.",
      "In raw-audio mode the voice model speaks for itself, so the read-aloud filter above does not apply.",
    ],
    sources: [
      "backend/app/services/prompts.py",
      "backend/app/services/matching.py",
      "backend/app/services/eligibility.py",
      "backend/app/models.py",
      "frontend/src/lib/speech.ts",
    ],
  },
  {
    id: "research",
    title: "The catalog research agent for staff",
    summary:
      "Staff enter a county and a topic, such as food pantries, and get back draft catalog entries built from public web pages, with a source link and a quote for each value. Staff review every draft, and nothing reaches the live catalog on its own.",
    points: [
      "A job runs in steps, shown in the diagram below. The model proposes a search plan, staff approve it, and the worker searches the web, reads the pages, and has the model pull out the service listings on each page. The worker checks the evidence and looks for duplicates, then staff review the drafts and export the ones they accept.",
      "By default nothing is searched until staff approve the plan, and they can drop any planned search first.",
      "Every value the model fills in must cite a short quote from the page. The worker checks that each quote is on the page it stored. A text field without a quote that checks out is left blank. A phone number or email must appear on the page, a website must be the page or a link on it, and an address the page does not state drops that location.",
      "A field the page does not state is left blank, not guessed. The reviewer sees which fields are missing and why.",
      "Listings outside the job's topic, such as public computers on a community center page in a food pantry job, are skipped and counted in the job log. They never become drafts.",
      "Each draft is checked against the catalog and the job's other drafts. A possible duplicate needs a similar service name plus the same organisation, address, phone number or website. It is shown to the reviewer; nothing is merged automatically.",
      "The operator picks the search engine. A private SearXNG instance keeps the searches on the operator's own servers and has no per-search fee. OpenAI web search needs nothing hosted, but the searches go to OpenAI and each one has a fee. Either way the worker reads each page itself to check the evidence.",
      "Measured on two test jobs for Travis County, Texas, topic food pantries, each stopping at 10 drafts after reading about 20 pages: about $0.17 with SearXNG and about $0.76 with OpenAI web search.",
      "Every page fetch is checked first: the site must be at a public internet address, not a private or internal one, and the check runs again on every redirect. A page is capped at 2 MB, after decompression too. robots.txt is respected, requests to one site are spaced out, and social media and people-search sites are skipped.",
      "Each job has hard caps on estimated cost, searches, pages, drafts and running time. Reaching one stops the job and keeps its drafts for review.",
      "The worker is a separate service. In the reference setup it runs on Railway with its own Postgres database and a private SearXNG instance, neither given a public address. The main app reaches the worker only through requests signed with a shared secret, each valid for a short time and only once.",
      "The agent works only from public web pages and the place and topic staff enter. Resident intakes never reach it. Its OpenAI calls are sent with store=False.",
    ],
    limits: [
      "Every draft is unverified. Accepting one in review does not verify it: the export strips the verification fields, and checking an entry with the provider is a separate staff step.",
      "Nothing is written to the live catalog. Staff copy the exported files into the data pack by hand.",
      "Jobs run one at a time. A second job waits in the queue.",
      "When a site's robots.txt cannot be reached, the fetch goes ahead.",
      "The cost cap is an estimate from list prices the operator sets, checked before each step, so a job can end a little over it. The figures above are the worker's own estimates from one job each and leave out hosting costs.",
      "The model writes descriptions and eligibility summaries in its own words. Quotes back them, but a reviewer still needs to read them against the source.",
      "Pages that are PDFs, or that need JavaScript to show their text, are not read.",
      "The agent is off unless the operator runs the worker and gives it an OpenAI key.",
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
    id: "security",
    title: "Security measures and their status",
    summary:
      "Basic web protections are in place. Several protections a public service needs are still being worked on and are not active in this deployment yet.",
    points: [
      "\"In place\" means it is in the code and running. \"In progress\" means work on it has started and an open issue tracks it. It is not active in this deployment yet. \"Not built\" means nothing in the code provides it.",
      "The overall plan for abuse and cost protection is issue #25. The plan for the staff console is issue #14.",
    ],
    limits: [
      "This is a demonstration. It should not hold real resident records until the items listed above as In progress and Not built are in place.",
      "The access-code gate is for private demos. Codes are one per person or group. It is not a sign-in and keeps no record of visits.",
    ],
    sources: [
      "backend/app/security_headers.py",
      "backend/app/access_gate.py",
      "backend/app/routers/admin.py",
      "backend/app/middleware.py",
      "Dockerfile",
      "SECURITY.md",
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
  not_planned: "Not built",
};

export const PROTECTIONS: Protection[] = [
  { status: "in_place", label: "Security headers on every response, and a content security policy on every page except the API documentation pages (/docs and /redoc)" },
  { status: "in_place", label: "Size caps on intake requests, messages and the stored intake" },
  { status: "in_place", label: "Optional access-code gate for private demos" },
  { status: "in_place", label: "Shared-secret check on staff catalog edits (edits are refused when no secret is set)" },
  { status: "in_place", label: "Text messages only to allowed country codes" },
  { status: "in_place", label: "Masked logging: phone numbers and emails are masked, and errors log their type, not their text" },
  { status: "in_place", label: "Container image runs as a non-root user; the sample compose file makes it read-only" },
  { status: "in_place", issue: 26, label: "Per-route rate limits keyed to a per-device token as well as the network address, so people on a shared mobile network do not share one limit. Counters are kept in memory on each server instance. Crisis lines are never rate limited. The optional bot challenge is off on access-code deployments" },
  { status: "in_place", issue: 27, label: "Token and voice-minute budgets with circuit breakers that pause the AI (never the directory or crisis lines), kept in memory on each server instance. Voice budgets are advisory until voice runs through the server (#29)" },
  { status: "in_progress", issue: 28, label: "Off-topic and abuse detection, strikes, blocks and an incident log" },
  { status: "in_progress", issue: 29, label: "Raw-audio voice sessions brokered by the server, with a guard on each session" },
  { status: "in_progress", issue: 30, label: "A staff page for abuse and cost, with alerts and incident review" },
  { status: "in_progress", issue: 14, label: "Staff sign-in with roles, saved catalog edits, real analytics, audit log and reports" },
  { status: "in_place", issue: 20, label: "Eligibility rule editing and service authoring in the console, checked against the data-pack contract (edits stay on one server instance until exported)" },
  { status: "in_place", issue: 18, label: "A catalog research agent for staff that drafts service records from public web pages, with a source link and quote for each field. Its worker runs on Railway and stays off until an OpenAI key is set there. Staff approve each search plan before it runs, review every draft, and merge exported drafts into the data pack by hand; nothing it drafts goes live on its own" },
  { status: "not_planned", label: "Data processing and data retention agreements with OpenAI and the text and email vendors (contracts the operator signs; no code provides them)" },
  { status: "not_planned", label: "Staff checking each catalog record against the provider" },
  { status: "not_planned", label: "Privacy-office review of the AI, privacy and voice notices" },
];
