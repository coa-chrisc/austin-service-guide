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
   * "Where this is going": the planned next step for this section. Planned, not built: write it as a plan
   * ("Phase 2:", "Planned:"), never in the present tense as if it runs today.
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
    title: "Crisis lines first",
    section: "crisis",
    text: "A message that states a crisis gets crisis lines at once, before any AI step. No limit or pause holds them back.",
  },
  {
    icon: "redact",
    title: "Personal details removed",
    section: "pii",
    text: "Fixed rules strip phone numbers, ID numbers and addresses in the browser, then again on the server.",
  },
  {
    icon: "catalog",
    title: "Service details from the catalog only",
    text: "Names, phone numbers, addresses and links come from catalog records, never from AI text.",
  },
  {
    icon: "rules",
    title: "Fixed matching rules",
    section: "ai-model",
    text: "Rules, not the AI, decide which services match. The same profile gives the same matches.",
  },
  {
    icon: "noStore",
    title: "Nothing kept on the server",
    section: "stateless",
    text: "The intake lives in the resident's browser tab. The server checks each request, replies and forgets it.",
  },
  {
    icon: "policy",
    title: "OpenAI asked not to store",
    section: "ai-model",
    text: "Every AI call is sent with store=False. That setting is not zero data retention.",
  },
  {
    icon: "limits",
    title: "Cost and abuse limits",
    section: "cost",
    text: "Rate limits, budgets and automatic pauses guard paid features. Chat falls back to scripted questions.",
  },
  {
    icon: "review",
    title: "Staff approve every draft",
    section: "research",
    text: "The research agent reads public pages only. Nothing it or the partner import drafts goes live without staff.",
  },
];

export const SECTIONS: HowItWorksSection[] = [
  {
    id: "what-this-is",
    title: "Points residents to services; providers decide eligibility",
    detailsLabel: "What the guide does and does not do",
    limitsLabel: "Known limits of its role",
    summary:
      "A demonstration guide that helps residents find local services. It suggests services. It does not make eligibility decisions, take applications or keep case records.",
    points: [
      "It draws on a catalog of city, county, state, federal and nonprofit programs for one place.",
      "It hides a service only when the resident's answers rule out one of its listed requirements. Everything it shows is a suggestion to check with the provider.",
      "It has two parts: the resident site, and a staff console for the agency that runs it.",
      "Residents need no account. The whole intake works without signing in.",
      "The code is open source (MIT license). Any agency can run its own copy for its own place.",
    ],
    limits: [
      "Results are suggestions to check with each provider. They are not a promise of eligibility or of a place in a program.",
      "The resident \"Sign In\" page is a demo. It creates no account on the server, but it saves the email typed into it in this browser until the resident signs out.",
    ],
    sources: ["CLAUDE.md", "LICENSE", "backend/app/main.py", "frontend/src/hooks/useAuth.tsx", "docs/CUSTOMIZING.md"],
  },
  {
    id: "journey",
    title: "Residents browse or ask, then leave with services to contact",
    detailsLabel: "Walk through the resident's steps",
    limitsLabel: "Known limits of browsing and voice",
    summary:
      "Residents can browse on their own or answer a few questions. Either way they end with a list of services to contact.",
    points: [
      "Browse: the home page offers topic buttons (such as Food & Nutrition or Housing & Utilities), an optional ZIP code and a language. A topic opens the service directory, filtered to that topic.",
      "The directory, each service's own page and the map use no AI.",
      "Ask: in chat or by voice, the guide asks one question at a time about the resident's situation and needs.",
      "Results: matching services appear as cards, with an ordered plan of first steps and a reason for each. A \"Check eligibility\" note marks services the answers did not settle.",
      "The resident can send the list to their own phone or email, if the operator has set up text and email sending.",
      "\"Start over\" clears everything the tab holds.",
    ],
    limits: [
      "When live AI is off or paused, chat runs a fixed set of scripted questions instead.",
      "Voice in its default mode needs a recent browser with an on-device speech pack. Other browsers get text chat only.",
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
    title: "One server and a closed catalog the city controls",
    detailsLabel: "View the architecture and data flow",
    limitsLabel: "A note on these diagrams",
    roadmap:
      "Phase 2: move the catalog into a database (PostgreSQL with pgvector), so staff edits are saved for good and search matches meaning, not only words.",
    summary:
      "A web page in the resident's browser talks to one server. The server holds the service catalog in memory, applies the matching rules, and makes every AI call for text.",
    points: [
      "The browser app is built with React. The server is one Python process (FastAPI).",
      "The catalog is a data pack: text files (YAML) that describe one place's services, categories and crisis lines.",
      "The server reads the data pack into memory when it starts. There is no database. The format is in docs/DATA_PACK.md.",
      "A settings file (the city config) sets each place's name, colors, logo and languages. Changing place means changing this file and the data pack.",
      "Only the server calls OpenAI for text, so the OpenAI key never reaches the browser.",
      "Optional, if the operator sets them up: Twilio sends text messages and SendGrid sends email, carrying the list of services a resident asks for.",
      "Optional raw-audio voice: the browser connects to OpenAI directly, using a short-lived key the server creates for that one voice session.",
      "Optional research worker: a separate service runs the staff catalog research agent. Resident intakes never go to it.",
    ],
    limits: ["The diagrams on this page are drawn by hand from the code. They are not generated from it."],
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
    title: "One codebase any city can configure, host and scale",
    detailsLabel: "See hosting, scale and page-weight details",
    limitsLabel: "Known limits at scale",
    roadmap:
      "Phase 2: a shared multi-city standard for service data and city settings, built from this guide's data-pack format, plus tested cloud setups (landing zones) for AWS, Azure and Google Cloud. The approach: prove the guide outside city systems first, then move it inside city IT once it has earned trust.",
    summary:
      "The server keeps no resident sessions, so any copy of it can answer any request. Copies can be added or replaced as traffic changes, and a restart loses nothing a resident needs.",
    points: [
      "Each request carries the resident's intake from the browser. Copies of the server need no shared session store, and a resident does not have to reach the same copy twice.",
      "The same code runs as one container (Docker) or as one Vercel function. Starter templates for AWS, Azure and Google Cloud are included, set to one to three copies, and operators can change that.",
      "The catalog sits in memory, so looking up a service needs no database call.",
      "Each agency runs its own copy. In the hosting-partner setup, each place gets its own container, cloud project and secrets, shared with no other place. A new place brings its own city config and data pack (docs/CUSTOMIZING.md).",
      "The staff research worker is a separate service with its own Postgres database, so long research jobs run outside the resident site.",
      "The first page load is small: about 161 KB of compressed JavaScript. The build fails if it grows past a set budget, and other pages load their code only when opened.",
      "Lighthouse mobile tests of the production demo on 16 November 2026, with simulated slow 4G, scored 98 to 100 for performance and 100 for accessibility on the home, directory and intake pages.",
    ],
    limits: [
      "Rate limits and spending budgets are counted inside each server copy. With several copies, or on Vercel where each warm function counts on its own, the real limits are several times higher.",
      "A shared store for those counters is planned (item ASG-SEC-02 in the security remediation plan). Until then, the OpenAI project's own spending limit is the backstop.",
      "Catalog edits made in the staff console stay in one server copy's memory. They are lost on restart and are not shared with other copies.",
      "A database with search by meaning (PostgreSQL with pgvector) is the planned home for the catalog. It is not built. Search today matches words.",
      "The AWS, Azure and Google Cloud templates are starters. They have not been applied to live cloud accounts.",
      "On Vercel with the access code on, every file is served through the app rather than Vercel's content network. The deploy guide judges this fine at demo scale.",
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
    title: "The server keeps no resident conversations",
    detailsLabel: "See what the browser holds and what the server checks",
    limitsLabel: "Known limits of browser-held data",
    summary:
      "The resident's conversation and answers stay in their browser tab. Each request carries them to the server, which checks them, replies and keeps nothing.",
    points: [
      "The intake is kept in the tab's own short-term storage (sessionStorage). It is not kept in a database, in the browser's long-term storage or on the server.",
      "On every request the server checks the intake's shape and size, removes personal details again, re-checks service ids against the catalog, replies, and forgets it.",
      "There is no account, no session id and no shareable results link.",
      "Request size, the number of messages and message length are capped. The caps are shown in the \"On this deployment\" box.",
      "\"Start over\" clears the stored intake. Closing the tab clears it too. Reloading the page does not.",
    ],
    limits: [
      "Anyone with access to the open tab can read it.",
      "The stored intake is not signed or encrypted. A resident can edit their own copy, so the server treats it as untrusted.",
      "What OpenAI and the text and email vendors keep is set by their terms, not by this app.",
      "The hosting platform's request logs (network address, time and page address) are kept however the operator has set them up. This app does not control them.",
      "If the operator turns on the voice troubleshooting log (off by default), redacted voice events are written to a file on the server, and anyone who can open the site can read them back through its debug pages.",
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
    title: "Fixed rules remove personal details before the AI sees text",
    detailsLabel: "See the personal-details removal rules",
    limitsLabel: "What the removal rules can miss",
    roadmap:
      "Planned: a second layer that finds names and addresses in many languages, running inside the deployment's own network, after the fixed rules and before any AI call.",
    summary:
      "Before a message reaches the AI, fixed pattern rules remove details such as phone numbers, Social Security numbers and street addresses. The rules run twice: in the browser, then again on the server. No AI is involved in this step.",
    points: [
      "The browser removes these details before sending a message. Each one is replaced with a placeholder such as [phone removed], and the resident sees a short notice.",
      "The server removes them again before the message is kept in the conversation, written to a log or sent to a model. On every request it re-runs the rules over the whole conversation and profile the browser sends back.",
      "When the server removes something, its reply starts with a short notice saying so. A crisis reply skips the notice.",
      "The kinds of detail removed are listed in the \"Removed on this deployment\" box, read from the server's rules. The browser and server rules agree on every shared test case.",
    ],
    limits: [
      "A name is removed only after \"my name is\", \"me llamo\" or \"mi nombre es\", or when it is two or three capitalized words after \"I am\", \"I'm\" or \"this is\". \"I'm Maria\" and \"Maria Lopez here\" are not caught.",
      "Phone numbers are matched in US formats only. Numbers from other countries are not caught unless they happen to look like a US number.",
      "An address without a house number or a street word (such as Street or Ave) is not caught.",
      "Unusual ways of saying numbers out loud can be missed.",
      "Things described in plain words, such as a diagnosis or a family situation, are sent on purpose. They are usually why the resident is here.",
      "Directory search text is cleaned in the browser, but it travels in the page address, so it can appear in hosting request logs.",
      "In the optional raw-audio voice mode, the audio reaches OpenAI before these rules can run. They clean the transcript afterwards (see the AI section).",
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
    title: "AI asks the questions; fixed rules decide the matches",
    detailsLabel: "See how the AI, its tools and the matching rules work",
    limitsLabel: "Known limits of the AI",
    roadmap:
      "Planned: an automated test set for answer quality in every offered language, reviewed by native speakers, run before each release.",
    summary:
      "The AI asks the questions, fills in a profile and explains the results. Fixed rules, not the AI, decide which services match, so the same profile always gives the same matches.",
    points: [
      "Text chat uses OpenAI's Responses API. The model and its settings are shown in the \"On this deployment\" box, read from the running server.",
      "For each message, the AI can ask the server to run a tool: search the catalog, read a service record, note facts about the resident, run the matching rules, switch language, show crisis lines or finish the intake. Every tool is listed in that box; wait_for_user is meant for voice.",
      "The server runs each tool and returns the result. This repeats up to a set number of rounds. If the AI has not replied by then, the resident gets a fixed message pointing to the results.",
      "Matching uses fixed rules. A service can list eligibility requirements.",
      "If the resident's answers contradict a requirement, the service is not shown. If the answers do not say, it is shown with a \"Check eligibility\" note.",
      "After matching, a second AI call, at a lower reasoning setting, picks three to five of the first twelve matches, puts them in order and writes a reason for each. Demo personas skip this call and get the rules-based order. In languages other than English, a step's reason is replaced by a fixed translated reason where one exists.",
      "The AI's instructions tell it to ask one question at a time, never invent services, never ask for names or ID numbers, and call the crisis tool right away when needed.",
      "Every call is sent with store=False, a setting that asks OpenAI not to store the response for later retrieval. The AI's reasoning is reused only within one message.",
      "With no OpenAI key, or with demo mode on, a fixed set of scripted questions runs and no AI is called.",
      "If one AI call fails, only that message gets the scripted questions, with a short notice. The next message tries the AI again, and a failed plan call falls back to the rules-based order.",
      "Voice, default mode: the browser turns speech into text on the device, removes personal details and sends only text. Replies are read aloud by the device's own voices, skipping any sentence with a phone number, address, web link, email or eligibility statement. Contact details are read from catalog records only.",
      "Voice, optional raw-audio mode: microphone audio streams from the browser to OpenAI's Realtime API. It needs two server settings and live AI turned on, and the resident sees a badge and is asked for consent first. The voice model greets the resident and is told to switch language when the resident does, which it may not always follow.",
    ],
    limits: [
      "store=False is not zero data retention. OpenAI may keep inputs and outputs for a limited time for abuse monitoring.",
      "The AI turns the resident's words into profile fields, so the same words can give a different profile, and so different matches, on another run. Wording also changes from run to run.",
      "Replies in other languages are written by the AI as it goes. No translator has reviewed them.",
      "The repository has no automated test of answer quality.",
      "In raw-audio mode the audio reaches OpenAI before this server sees anything, so personal details cannot be removed from it. The server cleans the transcript only after OpenAI returns it. OpenAI also sees the resident's network address, and the read-aloud filter does not apply.",
      "Raw-audio mode should be turned on only after the operator has a data retention agreement with OpenAI that covers it. The app cannot check for one.",
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
    title: "Layered safeguards, from crisis lines to staff review",
    detailsLabel: "See the catalog-grounding checks",
    limitsLabel: "Known limits: AI-written text and an unchecked catalog",
    roadmap:
      "Phase 2: named staff check each catalog record with its provider, and the site shows who checked it and when. Today no record in the bundled reference catalog has that check.",
    summary:
      "Several separate safeguards work together. Each card links to the section with its detail, and the status list near the end shows which are running.",
    points: [
      "Every service id from the AI, or from the browser's stored intake, is checked against the catalog. An unknown id is dropped, and only the number dropped is logged.",
      "Service cards, phone numbers, addresses and links are built from catalog records.",
      "The list a resident can send themselves by text or email is built from catalog records only.",
      "Plan steps can only name services in the resident's match list.",
    ],
    limits: [
      "The AI still writes the chat replies, the plan summary and the reason for each step. They are length-capped and reach the browser as the AI wrote them. When the browser sends them back, only email addresses, card numbers, Social Security numbers, dates of birth and ID numbers are removed from them, not phone numbers, addresses or names.",
      "That AI text is not fact-checked. A reply could say something the catalog does not.",
      "Staff have not yet checked the bundled reference catalog against the providers. The \"On this deployment\" box shows how many services in this deployment record who checked them and when.",
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
    title: "Crisis lines come first, before any AI step",
    detailsLabel: "See the crisis phrase checks and replies",
    limitsLabel: "What the crisis check can miss",
    roadmap:
      "Phase 2: native speakers review every phrase list, and a published test measures how quickly and how reliably the check responds in each language. No speed has been measured yet.",
    summary:
      "If a message states a crisis, in any language the guide offers, the server replies at once with crisis lines, before any AI step. The lines then stay on screen for the rest of the intake.",
    points: [
      "Every typed message and voice transcript is checked against phrase lists about suicide, self-harm, domestic violence and immediate danger, in English, Spanish, French, Vietnamese, Chinese, Korean, Arabic and Hindi. Case, accents and punctuation do not change the result.",
      "On a match, the reply lists 988, 9-1-1, the National Domestic Violence Hotline and this place's local crisis lines. The AI is not called for that message. A statement of immediate danger leads with 9-1-1. The scripted questions run the same check.",
      "The AI also has a crisis tool, and its instructions tell it to call that tool right away. If it does, or records a crisis while noting facts, the intake is marked as a crisis. If its reply leaves out 988, the full list of crisis lines is added.",
      "Once a crisis is marked, the chat and the results page keep a crisis-lines block at the top with tap-to-call buttons. 9-1-1, 988 and the National Domestic Violence Hotline are built into the page, so the block shows even when the server's list cannot be loaded.",
      "The plan always starts with the services the data pack marks as crisis services, whether the rules or the AI ordered it. One the AI left out is added at the top.",
      "Rate limits, spending budgets and automatic pauses never hold back a crisis reply, and the crisis-lines list has no limit.",
      "In raw-audio voice, a crisis transcript or crisis tool call gets a reply limited to reading the crisis lines.",
      "The resident can carry on with the intake after the crisis lines are shown.",
    ],
    limits: [
      "The non-English phrase lists are the project's own translations and still need review by native speakers.",
      "No list catches every way a crisis can be said. A crisis described indirectly depends on the AI noticing it, and the scripted questions do not catch it.",
      "The lists leave out common ordinary sentences such as \"we are in danger of losing our apartment\", but a message with no crisis can still match. Showing crisis lines when they were not needed is the accepted trade-off.",
      "The crisis reply text is written in English and Spanish; other languages get the English text. The crisis-lines block is in English in the chat, and translated on the results page for Spanish, Vietnamese, Chinese and Arabic. In raw-audio voice the voice model reads, and for other languages translates, the crisis message, and could misread it.",
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
    id: "cost",
    title: "Rate limits and spending caps that never hold back crisis lines",
    detailsLabel: "See the rate limits, budgets and pauses",
    limitsLabel: "Known limits of the cost controls",
    roadmap:
      "Planned: one shared store for the counters, so limits hold across every server copy (ASG-SEC-02), and a staff page with alerts (issue #30).",
    summary:
      "Features that cost money (AI calls, voice, and text or email sending) have rate limits, spending budgets and automatic pauses. When a limit is reached, chat carries on with the scripted questions instead of failing. The directory, the map and the crisis lines have no limits.",
    points: [
      "Rate limits are set per feature. For example, one person can send 20 chat messages a minute and 300 a day. A person is counted by their access code, by a device token, or else by their network.",
      "On sites without access codes, the browser solves a small computing puzzle (proof of work) before its first AI request and gets a device token for 24 hours. People on a shared mobile network then do not share one limit.",
      "Every AI call is metered in tokens (the units OpenAI bills by) and estimated dollars. Each person has hourly and daily caps, and the whole site has token caps. Site-wide dollar caps exist but are off unless the operator sets them.",
      "Automatic pauses (circuit breakers) stop AI chat, voice or sending when a budget is spent, when OpenAI reports the account is out of credits, when more than half of at least 20 calls in five minutes fail, or when the operator turns on a kill switch. Raw-audio voice and text or email sending stay off until the pause ends.",
      "When OpenAI reports the account is out of credits, the AI pauses for five minutes at a time on that server copy, then one message tries it again. The chat says why once, and the intake page shows a banner, in the operator's own words from the city config.",
      "The counters hold no resident data. A network address is shortened and scrambled with a key that changes every day, and raw addresses and message text are never stored. A text or email recipient is counted by a scrambled form of the address, up to three messages a day.",
    ],
    limits: [
      "The counters are kept in memory in each server copy. A restart resets them, and with several copies the real limits are higher (see the hosting and scale section).",
      "Dollar figures are estimates from a copied price list, not OpenAI's bill.",
      "Voice budgets are advisory until raw-audio sessions run through the server (issue #29). A session can run longer than it was charged for.",
      "Proof of work slows scripts. It does not stop a well-funded attacker.",
      "Refusals do not send alerts yet. A staff page with alerts is planned (issue #30).",
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
    title: "Staff console: partner lists become drafts that staff review",
    detailsLabel: "See the console and import safeguards",
    limitsLabel: "Known limits of the console and import",
    roadmap:
      "Phase 2: regular updates from 211 and partner lists arrive as drafts for staff review, and health leaders get demand signals: counts of needs by topic, language and ZIP code, with no conversation text, designed with a privacy office before any data is collected. Today the console's analytics are sample data.",
    summary:
      "The staff console shows the screens an agency would use to run the guide. Most of its data is made up for the demo. Its service directory is the live catalog.",
    points: [
      "The console shows made-up residents, analytics, staff and audit entries, so reviewers can see the intended screens without real records.",
      "Staff can edit eligibility rules and write new service entries. Each edit is checked against the data pack's rules, and staff can export the result as a data pack.",
      "Partner-list import turns an organization's spreadsheet or Word table of programs (.xlsx, .csv or .docx) into draft catalog entries. It is off unless the operator turns it on and sets the staff edit secret.",
      "Columns about people, such as contact names, direct or mobile lines, personal emails and notes, are dropped by default. Filters also remove contact names, personal phone numbers and resident identifiers from the cells that are kept.",
      "A file that looks like records about residents, with headers such as Client Name, DOB or SSN, is refused whole.",
      "The file is read in memory for one request and never saved. Formulas and macros are never run. The drafts stay in the staff member's browser until they download them as a zip.",
      "An optional AI step can suggest hours, address parts, categories and eligibility from the filtered rows. It never sends phone numbers, emails or websites, and it is off unless the operator turns it on.",
    ],
    limits: [
      "The console's records and analytics are sample data.",
      "Catalog edits stay in one server copy's memory until exported. They are lost on restart.",
      "The import filters work on patterns. A person's name written into a description with no phrase around it (\"Run by Jordan Smith\") gets through, so every draft needs a person to review it.",
      "Import drafts are downloads. Nothing is written to the live catalog; staff merge the files into the data pack by hand.",
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
    title: "Research agent: drafts with sources, and staff decide what goes live",
    detailsLabel: "See how a research job runs and is checked",
    limitsLabel: "Known limits of the research agent",
    roadmap:
      "Phase 2: the agent rechecks provider websites on a schedule for changed hours and contact details, and stages each change for staff review. Today it drafts new entries only, when staff start a job.",
    summary:
      "Staff enter a county and a topic, such as food pantries, and get back draft catalog entries built from public web pages, with a source link and a quote for each value. Staff review every draft, and nothing reaches the live catalog on its own.",
    points: [
      "A job runs in steps, shown in Diagram D: the AI proposes a search plan, staff approve it, the worker searches and reads pages, the AI pulls out the service listings, the worker checks the evidence and looks for duplicates, and staff review and export.",
      "By default nothing is searched until staff approve the plan, and they can drop any planned search first.",
      "Every value the AI fills in must cite a short quote from the page, and the worker checks that the quote is on the page. A field the page does not state is left blank, not guessed, and the reviewer sees which fields are missing and why.",
      "A phone number or email must appear on the page. A website must be the page or a link on it. A location whose address the page does not state is dropped.",
      "Listings outside the job's topic, such as public computers on a community center page in a food pantry job, are skipped and counted in the job log.",
      "Each draft is checked against the catalog and the job's other drafts. A possible duplicate needs a similar name plus the same organization, address, phone number or website. It is shown to the reviewer; nothing is merged automatically.",
      "Before fetching a page, the worker checks that the site is on the public internet, not a private or internal network address. It checks again on every redirect, and caps a page at 2 MB.",
      "robots.txt (a site's instructions to automated readers) is respected, requests to one site are spaced out, and social media and people-search sites are skipped.",
      "The operator picks the search engine. A private SearXNG search service keeps searches on the operator's own servers with no per-search fee. OpenAI web search needs nothing hosted, but the searches go to OpenAI and each has a fee.",
      "Measured on two test jobs for Travis County, Texas, topic food pantries, each stopping at 10 drafts after reading about 20 pages: about $0.17 with SearXNG and about $0.76 with OpenAI web search.",
      "Each job has hard caps on estimated cost, searches, pages, drafts and running time. Reaching one stops the job and keeps its drafts for review.",
      "The worker is a separate service. In the reference setup it runs on Railway with its own Postgres database and a private SearXNG, neither with a public address. The main app reaches it only through requests signed with a shared secret, each valid for a short time and only once.",
      "The agent works only from public web pages and the place and topic staff enter. Resident intakes never reach it. Its OpenAI calls are sent with store=False.",
    ],
    limits: [
      "Every draft is unverified. Accepting one in review does not verify it: the export strips the verification fields, and checking an entry with the provider is a separate staff step.",
      "Nothing is written to the live catalog. Staff copy the exported files into the data pack by hand.",
      "Jobs run one at a time. A second job waits in the queue.",
      "When a site's robots.txt cannot be reached, the fetch goes ahead.",
      "The cost cap is an estimate from list prices the operator sets, checked before each step, so a job can end a little over it. The cost figures in this section are the worker's own estimates from one job each and leave out hosting costs.",
      "The AI writes descriptions and eligibility summaries in its own words. Quotes back them, but a reviewer still needs to read them against the source.",
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
    id: "status",
    title: "Running today, in progress, and the Phase 2 roadmap",
    detailsLabel: "See how each status is defined and tracked",
    limitsLabel: "Known limits before real resident use",
    summary:
      "Basic web protections and the safeguards described on this page are running. Staff sign-in, abuse detection and vendor agreements are still to come. The Phase 2 roadmap is the path the grant would fund: a multi-city standard, replication in more cities, a staff-checked catalog, and the agreements and reviews that real resident use needs.",
    points: [
      "\"In place\" means it is in the code and running. \"In progress\" means work has started and an open issue tracks it; it is not active in this deployment yet. \"Phase 2 roadmap\" lists planned next steps; nothing in the code provides them yet.",
      "The overall plan for abuse and cost protection is issue #25. The plan for the staff console is issue #14.",
      "A security assessment dated 16 November 2026 lists what must change before real residents use the guide. A remediation plan sets the order of work. Both files are listed under Where this is in the code.",
    ],
    limits: [
      "This is a demonstration. It should not hold real resident records until the In progress items, and the vendor agreements, staff catalog checks and privacy-office review on the roadmap, are in place.",
      "Staff sign-in is a stub. It is simulated in the browser, the server does not check who reads the console's data, and edits are checked with one shared secret, not individual accounts.",
      "The access-code gate is for private demos. Codes are one per person or group. It is not a sign-in and keeps no record of visits.",
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
  { status: "in_place", label: "Security headers on every response, and a content security policy on every page except the API documentation pages (/docs and /redoc)" },
  { status: "in_place", label: "Size caps on intake requests, messages and the stored intake" },
  { status: "in_place", label: "Optional access-code gate for private demos" },
  { status: "in_place", label: "Shared-secret check on staff catalog edits (edits are refused when no secret is set)" },
  { status: "in_place", label: "Text messages only to allowed country codes" },
  { status: "in_place", label: "Masked logging: phone numbers and emails are masked, and errors log their type, not their text" },
  { status: "in_place", label: "Container image runs as a non-root user; the sample compose file makes it read-only" },
  { status: "in_place", issue: 26, label: "Per-feature rate limits counted per device token as well as per network, so people on a shared mobile network do not share one limit. Counted in memory on each server copy. Crisis lines are never rate limited. The optional bot check is off on access-code deployments" },
  { status: "in_place", issue: 27, label: "Token and voice-minute budgets with automatic pauses (circuit breakers) that stop the AI, never the directory or crisis lines. Counted in memory on each server copy. Voice budgets are advisory until voice runs through the server (#29)" },
  { status: "in_progress", issue: 28, label: "Off-topic and abuse detection, strikes, blocks and an incident log" },
  { status: "in_progress", issue: 29, label: "Raw-audio voice sessions brokered by the server, with a guard on each session" },
  { status: "in_progress", issue: 30, label: "A staff page for abuse and cost, with alerts and incident review" },
  { status: "in_progress", issue: 14, label: "Staff sign-in with roles, saved catalog edits, real analytics, audit log and reports" },
  { status: "in_place", issue: 20, label: "Eligibility rule editing and service authoring in the console, checked against the data-pack contract (edits stay on one server copy until exported)" },
  { status: "in_place", issue: 18, label: "A catalog research agent for staff that drafts service records from public web pages, with a source link and quote for each field. Its worker runs on Railway and stays off until an OpenAI key is set there. Staff approve each search plan before it runs, review every draft, and merge exported drafts into the data pack by hand; nothing it drafts goes live on its own" },
  // Phase 2 roadmap (status not_planned): planned next steps, none of them built. Write each as a plan.
  { status: "not_planned", label: "A shared multi-city standard for service data and city settings, built from this guide's data-pack format, so any city or partner can publish and check records the same way" },
  { status: "not_planned", label: "Replication: more cities run their own copy from the standard, each proved outside city systems first and then moved inside city IT" },
  { status: "not_planned", label: "Tested cloud setups (landing zones) for AWS, Azure and Google Cloud, applied to live accounts; today's templates are starters" },
  { status: "not_planned", label: "Staff checking each catalog record against the provider, with the site showing who checked it and when" },
  { status: "not_planned", label: "Regular updates from 211 and partner lists, arriving as drafts for staff review" },
  { status: "not_planned", label: "The research agent rechecking provider websites for changed hours and contact details, with each change staged for staff review" },
  { status: "not_planned", label: "Demand signals for health leaders: counts of needs by topic, language and ZIP code, with no conversation text, designed with a privacy office first" },
  { status: "not_planned", label: "Name and address detection in many languages, running inside the deployment's own network as a second layer after the fixed rules" },
  { status: "not_planned", label: "A published measurement of crisis-check speed and accuracy in each language, with native-speaker review of the phrase lists" },
  { status: "not_planned", label: "Data processing and data retention agreements with OpenAI and the text and email vendors (contracts the operator signs; no code provides them)" },
  { status: "not_planned", label: "Privacy-office review of the AI, privacy and voice notices" },
];
