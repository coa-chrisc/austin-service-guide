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
      "A demonstration guide that helps residents find local services. It does not decide who is eligible, take applications or keep case records.",
    points: [
      "It suggests services from a catalog of city, county, state, federal and nonprofit programs. Residents can browse by topic, use the map, or answer questions by chat or voice.",
      "It is a demonstration. It is not a benefits application, a case-management system or an eligibility decision.",
      "It has two parts: the resident site and a staff console. The console shows made-up residents, analytics, staff and audit entries. Its service directory is the live catalog.",
      "The whole intake works without an account or sign-in.",
    ],
    limits: [
      "The staff console is a demo. Its sign-in is simulated in the browser and its numbers are sample data.",
      "Results are suggestions to check with each provider. They are not a promise of eligibility or of a place in a program.",
    ],
    sources: ["CLAUDE.md", "backend/app/main.py", "backend/app/services/seed_data.py", "backend/app/data/admin_demo.yaml"],
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
      "One OpenAI model runs the chat. It can look things up in the catalog through a fixed set of tools. Fixed rules, not the model, decide which services match.",
    points: [
      "Text chat uses the OpenAI Responses API. The model and its reasoning setting are shown in the box below, read from the running server.",
      "Each resident message starts a short loop. The model may ask the server to run a tool, the server runs it and sends back the result, and this repeats up to a set number of rounds before the model must reply.",
      "The model can search and read catalog records, note facts about the resident's situation, run the matching rules, switch language, show crisis lines and finish the intake. The tool names are listed below.",
      "After matching, the model picks three to five of the matched services, puts them in order and writes a short reason for each. This call has its own, lower reasoning setting. Demo personas skip it and get the rules-based order with no model call.",
      "Every text call is sent with store=False, which tells OpenAI not to store the response for later retrieval. The model's reasoning is reused only within one message and is not carried to the next.",
      "If no OpenAI key is set, DEMO_MODE is on, or a call to OpenAI fails, a fixed set of scripted questions runs instead and no model is called.",
      "Voice has two modes. In the default mode the browser turns speech into text on the device, removes identifiers, and sends only text. Replies are read aloud by the device's own voices.",
      "In the optional raw-audio mode, microphone audio streams from the browser to the OpenAI Realtime API. The voice model greets the resident first and switches language when the resident speaks a different one. Speech-to-text is not fixed to one language. This mode needs two server settings turned on, and the resident sees a badge and is asked for consent first.",
    ],
    limits: [
      "store=False is not zero data retention. OpenAI may keep inputs and outputs for a limited time for abuse monitoring.",
      "In raw-audio mode the audio reaches OpenAI before this server sees anything, so the audio cannot be redacted. The server redacts the transcript only after OpenAI returns it. OpenAI also sees the resident's network address, because the browser connects to it directly.",
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
      "The browser removes identifiers from a message before sending it, and tells the resident what was removed.",
      "The server removes them again before the message is kept in the conversation, written to a log or sent to a model. On every request it also re-runs the rules over the whole conversation and profile the browser sends back.",
      "The kinds of identifier removed are listed below, read from the server's rules. Each is replaced with a placeholder such as [phone removed].",
      "The rules are fixed patterns. No AI is involved. The browser and server versions run the same shared test cases, so they give the same result.",
      "When the server removes something, its reply starts with a short notice saying so (a crisis reply skips the notice).",
    ],
    limits: [
      "A name is removed only after a phrase such as \"my name is\" or \"me llamo\". \"Maria Lopez here\" is not caught.",
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
    title: "The server keeps no intake data",
    summary:
      "Your conversation and answers stay in your browser tab. Each request carries them to the server, which checks them, replies, and keeps nothing.",
    points: [
      "The intake is kept in the tab's sessionStorage. It is not kept in a database, in localStorage or on the server.",
      "Every request carries the stored intake. The server checks its shape and size, removes identifiers again, re-checks service ids against the catalog, replies, and forgets it.",
      "There is no account, no session id and no shareable results link.",
      "Request size, number of messages and message length are capped. The caps are shown below.",
      "\"Start over\" clears the stored intake. Closing the tab clears it too.",
    ],
    limits: [
      "Anyone with access to the open tab can read it.",
      "The stored intake is not signed or encrypted. A resident can edit their own copy, so the server treats it as untrusted.",
      "What OpenAI and the text and email vendors keep is set by their terms, not by this app.",
    ],
    sources: [
      "frontend/src/lib/session.ts",
      "backend/app/services/intake_state.py",
      "backend/app/models.py",
      "backend/app/middleware.py",
      "backend/tests/test_stateless_intake.py",
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
      "Plan steps can only name services the matching rules already found.",
    ],
    limits: [
      "The model still writes the chat replies, the plan summary and the reason for each step. These are length-capped and pass through the redaction rules, but they are not fact-checked. A reply could say something the catalog does not.",
      "Staff have not yet checked the bundled reference catalog against the providers. The count above shows how many services in this deployment record who checked them and when.",
    ],
    sources: [
      "backend/app/services/grounding.py",
      "backend/app/services/tools.py",
      "backend/app/services/plan.py",
      "backend/app/routers/intake.py",
      "docs/DATA_PACK.md",
      "config/services.schema.json",
    ],
  },
  {
    id: "crisis",
    title: "Crisis interruption",
    summary:
      "If a message contains certain crisis phrases, the server replies at once with crisis lines and does not send that message to the model.",
    points: [
      "Before any model call, the server checks each message against a short list of phrases about suicide, self-harm, domestic violence and immediate danger.",
      "On a match it replies at once with 988, 9-1-1, the National Domestic Violence Hotline and this place's local crisis lines. The model is not called for that message.",
      "The same check runs in the scripted flow and on voice transcripts.",
      "The model also has a crisis tool, and its instructions tell it to call that tool right away.",
      "Services the data pack marks as crisis-direct skip the eligibility checks and come first in the plan.",
    ],
    limits: [
      "The phrase list is short, in English, and matches exact wording. A crisis said another way, or in another language, depends on the model noticing it. In the scripted flow it is not caught.",
      "This is not a crisis service. Nobody monitors conversations.",
    ],
    sources: [
      "backend/app/services/scenarios.py",
      "backend/app/services/ai.py",
      "backend/app/services/matching.py",
      "backend/app/services/realtime.py",
      "backend/app/data/crisis_resources.yaml",
    ],
  },
  {
    id: "consistency",
    title: "Keeping answers safe and consistent",
    summary:
      "Fixed rules decide which services match, so the same answers give the same matches. The model asks the questions and explains the results.",
    points: [
      "Matching uses rules, not the model. The same profile gives the same matches with the same confidence. The model gathers facts, runs the rules through a tool, and explains what they found.",
      "A service can list eligibility requirements. If the resident's answers contradict one, the service is not shown. If the answers do not say, the service is shown at low confidence with a \"Check eligibility\" note.",
      "The model's instructions tell it to ask one question at a time, never invent services, never ask for names or ID numbers, and call the crisis tool right away when needed.",
      "Each message has a cap on tool rounds and on reply length. If a call to OpenAI fails, the scripted questions take over.",
      "In the default voice mode, phone numbers, addresses, web links, email addresses and eligibility sentences are removed from the model's text before it is read aloud. Contact details are read from catalog records only.",
    ],
    limits: [
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
    id: "security",
    title: "Security measures and their status",
    summary:
      "Basic web protections are in place. Several protections a public service needs are being built and are not active in this deployment yet.",
    points: [
      "\"In place\" means it is in the code and running. \"In progress\" means work has started but it is not active in this deployment. \"Not built\" means nothing in the code provides it.",
      "The overall plan for abuse and cost protection is issue #25. The plan for the staff console is issue #14.",
    ],
    limits: [
      "This is a demonstration. It should not hold real resident records until the items listed above as In progress and Not built are in place.",
      "The access-code gate is a shared code for private demos. It is not a sign-in and keeps no per-person record.",
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
  { status: "in_place", label: "Security headers and a content security policy on every response" },
  { status: "in_place", label: "Size caps on intake requests, messages and the stored intake" },
  { status: "in_place", label: "Optional access-code gate for private demos" },
  { status: "in_place", label: "Shared-secret check on staff catalog edits (edits are refused when no secret is set)" },
  { status: "in_place", label: "Text messages only to allowed country codes" },
  { status: "in_place", label: "Masked logging: phone numbers and emails are masked, and errors log their type, not their text" },
  { status: "in_place", label: "Container image runs as a non-root user; the sample compose file makes it read-only" },
  { status: "in_progress", issue: 26, label: "Per-route rate limits, a client identity that holds up on shared mobile networks, and a bot challenge" },
  { status: "in_progress", issue: 27, label: "Token, dollar and voice-minute budgets with circuit breakers" },
  { status: "in_progress", issue: 28, label: "Off-topic and abuse detection, strikes, blocks and an incident log" },
  { status: "in_progress", issue: 29, label: "Raw-audio voice sessions brokered by the server, with a guard on each session" },
  { status: "in_progress", issue: 30, label: "A staff page for abuse and cost, with alerts and incident review" },
  { status: "in_progress", issue: 14, label: "Staff sign-in with roles, saved catalog edits, real analytics, audit log and reports" },
  { status: "in_progress", issue: 20, label: "Eligibility rule editing and complete service authoring in the console" },
  { status: "not_planned", label: "Data processing and data retention agreements with OpenAI and the text and email vendors (contracts the operator signs; no code provides them)" },
  { status: "not_planned", label: "Staff checking each catalog record against the provider" },
  { status: "not_planned", label: "Privacy-office review of the AI, privacy and voice notices" },
];
