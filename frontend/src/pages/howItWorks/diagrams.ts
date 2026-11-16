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
  caption: "Diagram A. Core system architecture and trust boundaries.",
  arrows: false,
  lanes: [
    {
      label: "Resident browser",
      nodes: [
        { title: "Public web app", detail: "Topic browse, directory, interactive map, text chat, and voice.", tone: "success" },
        { title: "Tab-scoped state", detail: "Held in sessionStorage and scrubbed of PII before every request.", tone: "success" },
      ],
    },
    {
      label: "Stateless app server (horizontally scalable)",
      boundaryBefore: "Scrubbed intake state sent per turn",
      nodes: [
        { title: "Validation & safety gate", detail: "Payload caps, second-pass PII scrub, and deterministic crisis interception.", tone: "primary" },
        { title: "In-memory catalog", detail: "Vetted YAML Data Pack loaded at startup (zero DB dependency).", tone: "primary" },
        { title: "Deterministic matcher", detail: "Python eligibility rules compute verified service matches.", tone: "primary" },
      ],
    },
    {
      label: "OpenAI",
      boundaryBefore: "PII-scrubbed text leaves the server",
      nodes: [
        {
          title: "Foundation model",
          detail: "Conducts intake questions and ranks action steps (store=False). Optional Realtime voice connects via ephemeral token.",
          tone: "warning",
        },
      ],
    },
    {
      label: "Staff & curation plane",
      boundaryBefore: "Strictly isolated from resident intakes",
      nodes: [
        { title: "Staff console", detail: "Rule authoring, partner spreadsheet import, and synthetic demo telemetry.", tone: "success" },
        { title: "Isolated research worker", detail: "Separate service with private Postgres and SearXNG for public web discovery.", tone: "primary" },
        { title: "Versioned Data Pack", detail: "Staff review and merge approved YAML drafts manually.", tone: "success" },
      ],
    },
  ],
};

/** Diagram C: one typed chat message, start to finish. */
export const CHAT_TURN: DiagramSpec = {
  caption: "Diagram C. Lifecycle of a single resident chat turn from browser to server and back.",
  arrows: true,
  lanes: [
    {
      label: "On the resident's device",
      nodes: [
        { title: "Resident enters message", detail: "Typed input or locally transcribed speech.", tone: "success" },
        { title: "Browser PII scrub", detail: "Deterministic regex strips identifiers before network transit.", tone: "success" },
      ],
    },
    {
      label: "On the app server",
      boundaryBefore: "Scrubbed message and tab state arrive over HTTPS",
      nodes: [
        { title: "Schema & size gate", detail: "Malformed or oversized payloads fail closed immediately.", tone: "primary" },
        { title: "Server PII re-scrub", detail: "Re-sanitizes both the new message and full history.", tone: "primary" },
        { title: "Deterministic crisis check", detail: "Crisis keywords in any supported language return 988/911 immediately with zero LLM calls.", tone: "primary" },
        { title: "Bounded tool loop", detail: "Executes strictly typed catalog lookups requested by the model.", tone: "primary" },
      ],
    },
    {
      label: "At OpenAI",
      boundaryBefore: "Redacted text sent with server API key",
      nodes: [
        {
          title: "OpenAI Responses API",
          detail: "Processes turn with store=False up to the round limit.",
          tone: "warning",
        },
      ],
    },
    {
      label: "Server grounding & client update",
      boundaryBefore: "Model output returns to server",
      nodes: [
        { title: "Catalog ID allowlist", detail: "Strips any service ID absent from the loaded Data Pack.", tone: "primary" },
        { title: "Stateless response", detail: "Returns grounded cards and updated state; server wipes memory.", tone: "primary" },
        { title: "Tab update", detail: "Saved in sessionStorage until \"Start over\" or tab close.", tone: "success" },
      ],
    },
  ],
};

/** Diagram B: who holds what. */
export const WHO_HOLDS_WHAT: DiagramSpec = {
  caption: "Diagram B. Data custody matrix across browser, server, and external processors.",
  arrows: false,
  lanes: [
    {
      label: "Resident browser tab",
      nodes: [
        { title: "Holds", detail: "Active chat history, profile answers, and matched plan until \"Start over\" or tab close.", tone: "success" },
        { title: "Never receives", detail: "Server OpenAI API keys (Realtime voice receives a single-use ephemeral token) or other residents' data.", tone: "success" },
      ],
    },
    {
      label: "App server",
      nodes: [
        { title: "Holds", detail: "Vetted service catalog, runtime config, API secrets, and single-request memory during active turn processing.", tone: "primary" },
        { title: "Never receives", detail: "Raw microphone audio in either default or Realtime voice modes.", tone: "primary" },
      ],
    },
    {
      label: "OpenAI",
      nodes: [
        {
          title: "Receives",
          detail: "PII-scrubbed chat turns, structured need attributes, and catalog snippets (plus raw audio and client IP if optional Realtime voice is enabled).",
          tone: "warning",
        },
        { title: "Never receives (text & default voice)", detail: "Resident IP address, browser fingerprint, or scrubbed identifiers.", tone: "warning" },
      ],
    },
    {
      label: "Twilio & SendGrid (when configured)",
      nodes: [
        { title: "Receives", detail: "Resident-entered destination phone/email and verified catalog contact cards.", tone: "warning" },
        { title: "Never receives", detail: "Chat transcripts, intake answers, or situational context.", tone: "warning" },
      ],
    },
  ],
};

/** Diagram D: one catalog research job, from a county and topic to an export. */
export const RESEARCH_JOB: DiagramSpec = {
  caption: "Diagram D. Human-in-the-loop catalog research pipeline from topic prompt to verified YAML export.",
  arrows: true,
  lanes: [
    {
      label: "Staff initiate discovery",
      nodes: [
        { title: "Jurisdiction & topic", detail: "Staff specify county and category under hard cost, page, and draft caps.", tone: "success" },
      ],
    },
    {
      label: "Worker drafts search plan",
      boundaryBefore: "HMAC-signed job request sent to isolated worker",
      nodes: [
        { title: "Query proposal", detail: "Model suggests search queries and likely official provider domains.", tone: "primary" },
      ],
    },
    {
      label: "Staff gatekeeper approval",
      boundaryBefore: "Proposed plan returns to console",
      nodes: [
        { title: "Approve or prune", detail: "Staff edit or drop queries before a single web request fires.", tone: "success" },
      ],
    },
    {
      label: "Isolated web extraction",
      boundaryBefore: "Approved queries execute on worker",
      nodes: [
        { title: "Search", detail: "Runs via private self-hosted SearXNG or OpenAI Web Search.", tone: "primary" },
        { title: "Safe fetch", detail: "Public IPs only (SSRF-checked on every redirect), 2 MB max, robots.txt honored.", tone: "primary" },
        { title: "Quote-backed extraction", detail: "Tool-free model extracts on-topic services with verbatim HTML quotes.", tone: "primary" },
        { title: "Deterministic evidence check", detail: "Wipes any field whose cited quote does not match page text verbatim.", tone: "primary" },
        { title: "Duplicate detection", detail: "Flags overlaps against live catalog records and sibling drafts.", tone: "primary" },
      ],
    },
    {
      label: "Staff review & manual promotion",
      boundaryBefore: "Grounded drafts return to console",
      nodes: [
        { title: "Side-by-side review", detail: "Staff inspect, edit, or reject each field alongside source URLs and quotes.", tone: "success" },
        { title: "Unverified Data Pack export", detail: "Downloads clean YAML zip with verification flags cleared.", tone: "success" },
        { title: "Controlled release", detail: "Staff commit approved files into the Data Pack; zero auto-publishing.", tone: "success" },
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
