/* ------------------------------------------------------------------ */
/*  Copy for the infographic at the top of "How it works": what the    */
/*  guide is and why it matters, in a few words per card. The detail   */
/*  and the limits live in content.ts, below it on the page.           */
/*                                                                     */
/*  Same rule as content.ts: true to the code, present tense for what  */
/*  runs today, planned work labelled as planned. One short line per   */
/*  card, two at most; anything longer belongs in the sections.        */
/* ------------------------------------------------------------------ */

/** Languages the crisis phrase check reads (backend/app/services/crisis_phrases.py; content.test.ts counts them). */
export const CRISIS_LANGUAGES = 8;

export const HERO = {
  title: "How the Service Guide works",
  subtitle: "An AI-assisted directory that keeps residents' details private and connects them with local help.",
};

/** Image files in ./images (4:3 WebP, 800x600). Infographic.tsx imports each one. */
export type ImageKey =
  | "journey-ask"
  | "journey-private"
  | "journey-match"
  | "journey-map"
  | "safety-privacy"
  | "safety-crisis"
  | "safety-staff"
  | "city-swap"
  | "cloud-hosting";

export interface InfoCard {
  image: ImageKey;
  alt: string;
  title: string;
  /** One short sentence, two at most. */
  text: string;
}

export const JOURNEY_TITLE = "The resident journey";

export const JOURNEY: InfoCard[] = [
  {
    image: "journey-ask",
    alt: "A resident asks for help on a phone in Spanish",
    title: "Ask in your own words",
    text: "Type, talk or tap a topic, in your own language.",
  },
  {
    image: "journey-private",
    alt: "Personal details are removed before anything reaches the AI",
    title: "Private by design",
    text: "Personal details are removed before any AI step.",
  },
  {
    image: "journey-match",
    alt: "Needs are matched to services in the city's catalog",
    title: "Matched to real services",
    text: "Fixed rules pick from the city's catalog; the AI adds none.",
  },
  {
    image: "journey-map",
    alt: "Results on a map with a tap-to-call button",
    title: "Map and call",
    text: "Hours, what to bring and tap-to-call numbers, on a map.",
  },
];

export const SAFETY_TITLE = "Safe, grounded and built to scale";

export const SAFETY_CARDS: InfoCard[] = [
  {
    image: "safety-privacy",
    alt: "Personal details stay on the resident's device",
    title: "Personal details stay out",
    text: "Removed on the device and again on the server, which keeps no chats.",
  },
  {
    image: "safety-crisis",
    alt: "Crisis lines appear first",
    title: "Crisis lines come first",
    text: `A check in ${CRISIS_LANGUAGES} languages puts 988 and local lines on top, before any AI step.`,
  },
  {
    image: "safety-staff",
    alt: "Staff review drafts before anything goes live",
    title: "Staff decide what goes live",
    text: "The research agent and partner import only make drafts. Staff review each one.",
  },
];

export interface Metric {
  value: string;
  /** What a screen reader says for the value, when the symbols would read badly. */
  spoken?: string;
  label: string;
}

export const METRICS_TITLE = "Performance & safety";

export const METRICS: Metric[] = [
  { value: "0", label: "conversations stored on the server" },
  { value: "~161 KB", spoken: "About 161 KB", label: "to open on a phone" },
  { value: String(CRISIS_LANGUAGES), label: "crisis-check languages" },
  { value: "98–100", spoken: "98 to 100", label: "mobile speed score" },
  { value: "100", label: "accessibility score" },
];

export const METRICS_NOTE = "Lighthouse 13.6 mobile, production demo, 16 Nov 2026.";

export const CITY_TITLE = "One codebase, any city";

export const CITY_CARDS: InfoCard[] = [
  {
    image: "city-swap",
    alt: "The same guide restyled for a different city",
    title: "Any city, no code changes",
    text: "A settings file and a data pack set the name, colors, languages and services.",
  },
  {
    image: "cloud-hosting",
    alt: "One container runs on any major cloud",
    title: "One container image",
    text: "Runs on Vercel and Railway today; starter templates for AWS, Azure, Google Cloud.",
  },
];

/** Planned work. Every item is also in the Phase 2 roadmap group of PROTECTIONS (content.ts). */
export const ROADMAP = {
  title: "Phase 2 roadmap (with the grant)",
  status: "planned" as const,
  statusLabel: "Planned",
  items: [
    "A shared multi-city standard",
    "Staff-checked catalog records",
    "211 and partner data updates",
    "Demand signals for health leaders",
  ],
  note: "Not built yet.",
  noteLink: "Full list below.",
};

export const CTA = { primary: "Try the live guide", secondary: "Read the technical detail" };

export const TECHNICAL_TITLE = "Technical detail for IT and security reviewers";
