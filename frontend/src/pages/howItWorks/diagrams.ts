/* ------------------------------------------------------------------ */
/*  The two "How it works" diagrams, as data for FlowDiagram.          */
/*  Same rule as content.ts: keep them true to the code.               */
/* ------------------------------------------------------------------ */

import type { FlowLane } from "@/components/common/FlowDiagram";

export interface DiagramSpec {
  caption: string;
  lanes: FlowLane[];
  arrows: boolean;
}

/** Diagram A: one typed chat message, start to finish. */
export const CHAT_TURN: DiagramSpec = {
  caption: "Diagram A. What happens to one chat message, in order.",
  arrows: true,
  lanes: [
    {
      label: "On your device",
      nodes: [
        { title: "You type a message", detail: "In the chat box.", tone: "success" },
        { title: "The browser removes identifiers", detail: "Pattern rules in piiGuard.ts.", tone: "success" },
      ],
    },
    {
      label: "On this server",
      boundaryBefore: "The message and the stored intake leave your device",
      nodes: [
        { title: "Size and shape check", detail: "Oversized or malformed requests are refused.", tone: "primary" },
        { title: "The server removes identifiers again", detail: "pii.py, on the message and the whole stored intake.", tone: "primary" },
        { title: "Crisis check", detail: "A crisis phrase gets crisis lines at once, with no model call.", tone: "primary" },
        { title: "Agent loop with catalog tools", detail: "The server runs the tools the model asks for.", tone: "primary" },
      ],
    },
    {
      label: "At OpenAI",
      boundaryBefore: "Redacted text leaves the server",
      nodes: [
        {
          title: "OpenAI Responses API",
          detail: "Called with store=False. The loop repeats up to the round limit.",
          tone: "warning",
        },
      ],
    },
    {
      label: "Back on the server, then your device",
      boundaryBefore: "The reply comes back to the server",
      nodes: [
        { title: "Catalog check", detail: "Service ids not in the catalog are dropped.", tone: "primary" },
        { title: "Reply and updated intake", detail: "Sent back; the server keeps nothing.", tone: "primary" },
        { title: "Saved in your tab", detail: "sessionStorage, until Start over or the tab closes.", tone: "success" },
      ],
    },
  ],
};

/** Diagram B: who holds what. */
export const WHO_HOLDS_WHAT: DiagramSpec = {
  caption: "Diagram B. Who holds what during an intake.",
  arrows: false,
  lanes: [
    {
      label: "Your browser tab",
      nodes: [
        { title: "Holds", detail: "The conversation, your answers and your plan, until Start over or the tab closes.", tone: "success" },
        { title: "Never receives", detail: "The OpenAI key (raw-audio voice gets a short-lived key for one session), or anyone else's intake.", tone: "success" },
      ],
    },
    {
      label: "This server",
      nodes: [
        { title: "Holds", detail: "The catalog, the settings and the OpenAI key. Your intake only while it answers one request.", tone: "primary" },
        { title: "Never receives", detail: "Microphone audio, in either voice mode.", tone: "primary" },
      ],
    },
    {
      label: "OpenAI",
      nodes: [
        {
          title: "Receives",
          detail: "Redacted conversation text, a summary of your answers, and catalog search results. In raw-audio voice mode, also the microphone audio and your network address.",
          tone: "warning",
        },
        { title: "Never receives (text chat)", detail: "Your browser's network address or request headers. The server makes the call.", tone: "warning" },
      ],
    },
    {
      label: "Twilio and SendGrid, if set up",
      nodes: [
        { title: "Receives", detail: "The phone number or email you enter, and the list of services: names, phone numbers and links.", tone: "warning" },
        { title: "Never receives", detail: "Your conversation or your answers.", tone: "warning" },
      ],
    },
  ],
};

/** Which diagram sits in which section. */
export const DIAGRAMS_BY_SECTION: Record<string, DiagramSpec> = {
  architecture: CHAT_TURN,
  stateless: WHO_HOLDS_WHAT,
};
