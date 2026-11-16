/* ------------------------------------------------------------------ */
/*  The four "How it works" diagrams, as data for FlowDiagram.         */
/*  Same rule as content.ts: keep them true to the code.               */
/* ------------------------------------------------------------------ */

import type { FlowLane } from "@/components/common/FlowDiagram";

export interface DiagramSpec {
  caption: string;
  lanes: FlowLane[];
  arrows: boolean;
}

/** Diagram A: the main parts of the system. */
export const SYSTEM_MAP: DiagramSpec = {
  caption: "Diagram A. The main parts of the system and what passes between them.",
  arrows: false,
  lanes: [
    {
      label: "Resident's browser",
      nodes: [
        { title: "Resident site", detail: "Topics, directory, map, chat and voice.", tone: "success" },
        { title: "Intake held in the tab", detail: "Sent with each request, with personal details removed first.", tone: "success" },
      ],
    },
    {
      label: "App server (one process; add copies as needed)",
      boundaryBefore: "Each request carries the intake",
      nodes: [
        { title: "Checks and cleans", detail: "Size checks, personal details removed again, crisis check.", tone: "primary" },
        { title: "Catalog in memory", detail: "Loaded from the data pack when the server starts.", tone: "primary" },
        { title: "Matching rules", detail: "Fixed rules decide which services match.", tone: "primary" },
      ],
    },
    {
      label: "OpenAI",
      boundaryBefore: "Text with personal details removed leaves the server",
      nodes: [
        {
          title: "AI model",
          detail: "Asks questions and explains results, with store=False. Raw-audio voice, if turned on, connects here from the browser.",
          tone: "warning",
        },
      ],
    },
    {
      label: "Staff side",
      boundaryBefore: "Kept apart from resident intakes",
      nodes: [
        { title: "Staff console", detail: "Part of the same app. Sample data, live catalog.", tone: "success" },
        { title: "Research worker", detail: "Optional separate service with its own Postgres database.", tone: "primary" },
        { title: "Data pack", detail: "Staff merge reviewed drafts into it by hand.", tone: "success" },
      ],
    },
  ],
};

/** Diagram C: one typed chat message, start to finish. */
export const CHAT_TURN: DiagramSpec = {
  caption: "Diagram C. The path of one typed chat message, from the resident's device to OpenAI and back, in order.",
  arrows: true,
  lanes: [
    {
      label: "On the resident's device",
      nodes: [
        { title: "The resident types a message", detail: "In the chat box.", tone: "success" },
        { title: "The browser removes personal details", detail: "Fixed pattern rules, no AI.", tone: "success" },
      ],
    },
    {
      label: "On this server",
      boundaryBefore: "The message and the stored intake leave the device",
      nodes: [
        { title: "Size and shape check", detail: "Oversized or malformed requests are refused.", tone: "primary" },
        { title: "The server removes personal details again", detail: "On the new message and the whole stored intake.", tone: "primary" },
        { title: "Crisis check", detail: "A crisis statement in any offered language gets crisis lines at once, with no model call for that message.", tone: "primary" },
        { title: "Agent loop with catalog tools", detail: "The server runs the tools the model asks for.", tone: "primary" },
      ],
    },
    {
      label: "At OpenAI",
      boundaryBefore: "Redacted text leaves the server",
      nodes: [
        {
          title: "OpenAI Responses API",
          detail: "Asked not to store the response (store=False). The loop repeats up to the round limit.",
          tone: "warning",
        },
      ],
    },
    {
      label: "Back on the server, then the device",
      boundaryBefore: "The reply comes back to the server",
      nodes: [
        { title: "Catalog check", detail: "Service ids not in the catalog are dropped.", tone: "primary" },
        { title: "Reply and updated intake", detail: "Sent back; the server does not store it.", tone: "primary" },
        { title: "Saved in the browser tab", detail: "Until Start over or the tab closes.", tone: "success" },
      ],
    },
  ],
};

/** Diagram B: who holds what. */
export const WHO_HOLDS_WHAT: DiagramSpec = {
  caption: "Diagram B. Who holds which data during an intake, and what each party never receives.",
  arrows: false,
  lanes: [
    {
      label: "The resident's browser tab",
      nodes: [
        { title: "Holds", detail: "The conversation, the answers and the plan, until Start over or the tab closes.", tone: "success" },
        { title: "Never receives", detail: "The OpenAI key (raw-audio voice gets a short-lived key for one session), or anyone else's intake.", tone: "success" },
      ],
    },
    {
      label: "This server",
      nodes: [
        { title: "Holds", detail: "The catalog, the settings and the OpenAI key. The intake only while it answers one request.", tone: "primary" },
        { title: "Never receives", detail: "Microphone audio, in either voice mode.", tone: "primary" },
      ],
    },
    {
      label: "OpenAI",
      nodes: [
        {
          title: "Receives",
          detail: "Conversation text with personal details removed, a summary of the answers, and catalog search results. In raw-audio voice mode, also the microphone audio and the resident's network address.",
          tone: "warning",
        },
        { title: "Never receives (text chat)", detail: "The resident's network address or browser details. The server makes the call.", tone: "warning" },
      ],
    },
    {
      label: "Twilio and SendGrid, if set up",
      nodes: [
        { title: "Receives", detail: "The phone number or email the resident enters, and the list of services: names, phone numbers and links.", tone: "warning" },
        { title: "Never receives", detail: "The conversation or the answers.", tone: "warning" },
      ],
    },
  ],
};

/** Diagram D: one catalog research job, from a county and topic to an export. */
export const RESEARCH_JOB: DiagramSpec = {
  caption: "Diagram D. One research job, from a county and a topic to drafts that staff review and export.",
  arrows: true,
  lanes: [
    {
      label: "Staff start a job",
      nodes: [
        { title: "A county and a topic", detail: "With caps on cost, pages and drafts.", tone: "success" },
      ],
    },
    {
      label: "The job worker plans",
      boundaryBefore: "A signed request goes to the separate job worker",
      nodes: [
        { title: "Plan", detail: "The model proposes searches and the likely official websites.", tone: "primary" },
      ],
    },
    {
      label: "Staff approve the plan",
      boundaryBefore: "The plan comes back to staff",
      nodes: [
        { title: "Approve or trim", detail: "Staff keep or drop each planned search before any runs.", tone: "success" },
      ],
    },
    {
      label: "The job worker researches",
      boundaryBefore: "The approved plan goes back to the worker",
      nodes: [
        { title: "Search", detail: "Private SearXNG or OpenAI web search, as the operator chose.", tone: "primary" },
        { title: "Fetch", detail: "Public internet addresses only, checked on every redirect. 2 MB cap. robots.txt respected.", tone: "primary" },
        { title: "Extract", detail: "The model lists the on-topic services on each page, with quotes. It has no tools.", tone: "primary" },
        { title: "Evidence check", detail: "Each quote must be on the page. A field without one is left blank.", tone: "primary" },
        { title: "Duplicate check", detail: "Against the catalog and the job's other drafts.", tone: "primary" },
      ],
    },
    {
      label: "Staff review and export",
      boundaryBefore: "Drafts come back for review",
      nodes: [
        { title: "Review", detail: "Staff accept, edit or reject each draft, with its sources beside it.", tone: "success" },
        { title: "Export", detail: "A zip laid out like a data pack. Entries stay unverified.", tone: "success" },
        { title: "Merge by hand", detail: "Staff copy the files into the data pack. Nothing goes live on its own.", tone: "success" },
      ],
    },
  ],
};

/** Which diagram sits in which section. */
export const DIAGRAMS_BY_SECTION: Record<string, DiagramSpec> = {
  architecture: SYSTEM_MAP,
  stateless: WHO_HOLDS_WHAT,
  "ai-model": CHAT_TURN,
  research: RESEARCH_JOB,
};
