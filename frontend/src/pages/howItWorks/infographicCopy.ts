/* ------------------------------------------------------------------ */
/*  Copy for the infographic at the top of "How it works": what the    */
/*  guide is and why it matters, read in about ten seconds.            */
/*                                                                     */
/*  This is the pitch: it describes the guide the grant builds toward, */
/*  stated plainly and with confidence. One short line per card, two   */
/*  at most. What runs today, with its limits, is in content.ts,       */
/*  below the infographic on the page.                                 */
/* ------------------------------------------------------------------ */

/** Languages the crisis phrase check reads (backend/app/services/crisis_phrases.py; content.test.ts counts them). */
export const CRISIS_LANGUAGES = 8;

export const HERO = {
  eyebrow: "How the Service Guide works",
  title: "The right local help, in any language, in minutes",
  subtitle: "Residents say what they need. The guide matches them to verified local services and keeps their details private.",
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

export const JOURNEY_TITLE = "How residents get help";

export const JOURNEY: InfoCard[] = [
  {
    image: "journey-ask",
    alt: "A resident asks for help on a phone in Spanish",
    title: "Ask in your own words",
    text: "Type, talk or tap a topic, in any language.",
  },
  {
    image: "journey-private",
    alt: "Personal details are removed before anything reaches the AI",
    title: "Private from the start",
    text: "Personal details are removed before the AI sees them.",
  },
  {
    image: "journey-match",
    alt: "Needs are matched to services in the city's catalog",
    title: "Matched to real help",
    text: "Results come only from the city's verified catalog.",
  },
  {
    image: "journey-map",
    alt: "Results on a map with a tap-to-call button",
    title: "Map it, call it",
    text: "Where to go, when it's open and what to bring.",
  },
];

export const SAFETY_TITLE = "Why it's safe";

export const SAFETY_CARDS: InfoCard[] = [
  {
    image: "safety-privacy",
    alt: "Personal details stay on the resident's device",
    title: "Nothing personal is kept",
    text: "Details are removed on the phone and again on the server. No chats are stored.",
  },
  {
    image: "safety-crisis",
    alt: "Crisis lines appear first",
    title: "Crisis help comes first",
    text: `In ${CRISIS_LANGUAGES} languages, 988 and local crisis lines appear before anything else.`,
  },
  {
    image: "safety-staff",
    alt: "Staff review drafts before anything goes live",
    title: "Staff approve every listing",
    text: "AI drafts the updates. Nothing goes live until a staff member approves it.",
  },
];

export interface Metric {
  value: string;
  /** What a screen reader says for the value, when the symbols would read badly. */
  spoken?: string;
  label: string;
}

export const METRICS_TITLE = "At a glance";

export const METRICS: Metric[] = [
  { value: "0", label: "personal records stored" },
  { value: "100%", spoken: "100 percent", label: "staff-vetted catalog" },
  { value: String(CRISIS_LANGUAGES), label: "crisis-check languages" },
  { value: "161 KB", label: "fast on prepaid phones" },
  { value: "100", label: "accessibility score" },
];

export const METRICS_NOTE = "Lighthouse 13.6 mobile, production demo, 16 Nov 2026.";

export const CITY_TITLE = "Why it scales";

export const CITY_CARDS: InfoCard[] = [
  {
    image: "city-swap",
    alt: "The same guide restyled for a different city",
    title: "A new city, no new code",
    text: "Swap the name, colors, languages and services. The app stays the same.",
  },
  {
    image: "cloud-hosting",
    alt: "One container runs on any major cloud",
    title: "Runs on any cloud",
    text: "One package deploys to AWS, Azure or Google Cloud.",
  },
];

/** Where the grant takes the guide next. */
export const ROADMAP = {
  title: "Phase 2 roadmap",
  items: [
    "One shared standard for every city",
    "Live 211 and partner data",
    "Staff-verified records",
    "Demand signals for health leaders",
  ],
};

export const CTA = { primary: "Try the live guide", secondary: "Read the technical detail" };

export const TECHNICAL_TITLE = "Technical detail for IT and security reviewers";
