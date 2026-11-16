/* ------------------------------------------------------------------ */
/*  Copy for the infographic at the top of "How it works", as written  */
/*  by the grant team. It describes the guide the grant builds toward. */
/*  What runs today, with its limits, is in content.ts, below the      */
/*  infographic on the page.                                           */
/* ------------------------------------------------------------------ */

/** Languages the crisis phrase check reads (backend/app/services/crisis_phrases.py; content.test.ts counts them). */
export const CRISIS_LANGUAGES = 8;

export const HERO = {
  title: "How the Service Guide Works",
  subtitle: "The right local help, in any language, in minutes—without compromised privacy.",
};

/** Image files in ./images (4:3 WebP, 800x600). Infographic.tsx imports each one. */
export type ImageKey =
  | "journey-ask"
  | "journey-match"
  | "journey-map"
  | "safety-privacy"
  | "safety-crisis"
  | "safety-staff"
  | "city-swap"
  | "cloud-hosting";

/** Icons a card can show instead of a picture (Infographic.tsx maps each to an MUI icon). */
export type CardIcon = "verified";

interface CardText {
  title: string;
  /** Text between asterisks is shown in italics, e.g. "like *“this”* here". */
  text: string;
}

/** A card with a picture (and its alt text) or a decorative icon. */
export type InfoCard = CardText & ({ image: ImageKey; alt: string } | { icon: CardIcon });

/** The card text without the italics markers, as a reader hears it. */
export const plainText = (text: string) => text.replace(/\*/g, "");

export interface InfoRow {
  title: string;
  subtitle: string;
  cards: InfoCard[];
}

export const JOURNEY: InfoRow = {
  title: "How Residents Get Help",
  subtitle: "A stateless, human-centric search pattern.",
  cards: [
    {
      image: "journey-ask",
      alt: "A resident asks for help on a phone in her own language",
      title: "Ask Naturally",
      text: "Natural phrasing like *“I’m short on rent and need baby formula”* in any language replaces rigid search forms.",
    },
    {
      image: "journey-match",
      alt: "A request matched only against the city's own service list",
      title: "Query the Closed Catalog",
      text: "System boundaries strictly lock searches to the city's pre-loaded, verified list. The AI cannot “invent” nonexistent local programs.",
    },
    {
      image: "journey-map",
      alt: "Matched services on a map with a tap-to-call button",
      title: "Get Precise Route & Contact",
      text: "Matches display direct mapped locations, transit links, and clickable phone numbers. Residents leave with immediate, actionable resources.",
    },
  ],
};

export const SAFETY: InfoRow = {
  title: "Why It's Safe",
  subtitle: "Pre-engineered safeguards designed to pass strict municipal review.",
  cards: [
    {
      image: "safety-crisis",
      alt: "Crisis hotlines pinned at the top of the screen",
      title: "988 Crisis Intervention (Always First)",
      text: "Triggered instantly by keywords (self-harm, domestic violence) before the AI is even queried. Surfaced directly at the top of the viewport to keep the human safe.",
    },
    {
      image: "safety-privacy",
      alt: "Personal details stripped on the resident's phone",
      title: "Edge PII Scrubber (Zero Data Retention)",
      text: "Name, age, and phone inputs are parsed on the user's side or stripped immediately at memory level—removing the liability of data breaches and keeping users trustful.",
    },
    {
      image: "safety-staff",
      alt: "A staff member reviews draft listings before they go live",
      title: "A “Human-in-the-Loop” Catalog",
      text: "AI parses imports, PDF forms, or site changes into Draft status first. Our administrative UI holds them until staff inspect and push live. Only human-vetted content gets served to residents.",
    },
  ],
};

export const SCALE: InfoRow = {
  title: "Why It Scales",
  subtitle: "A portable open standard built for any city, on any cloud.",
  cards: [
    {
      image: "city-swap",
      alt: "The same guide rebranded for a different city",
      title: "Rebrand Without Code",
      text: "Drop in your own directory and coordinate boundaries to change “Austin” to “Dallas” or “Fairfax” in hours. The logic remains locked.",
    },
    {
      image: "cloud-hosting",
      alt: "One container running on AWS, Azure or Google Cloud",
      title: "Pre-Vetted Cloud Landing Zones",
      text: "Leverages existing “landing zone” definitions matching whichever container environment—AWS, Azure, or Google Cloud—your municipal IT already governs.",
    },
    {
      icon: "verified",
      title: "The “USDA Organic” Proof Pattern",
      text: "Cities can test-drive this reference guide externally on our infrastructure first, build a case, and give IT the deployment blueprint when ready to adopt internally.",
    },
  ],
};

export interface Metric {
  value: string;
  /** What a screen reader says for the value, when the symbols would read badly. */
  spoken?: string;
  label: string;
  text: string;
}

/** Heading for the numbers band, for screen readers only. */
export const METRICS_TITLE = "Key numbers";

export const METRICS: Metric[] = [
  {
    value: "0",
    label: "Stored Personal Records",
    text: "Stateless by design. No logins, accounts, or persistent histories to ensure total resident safety.",
  },
  {
    value: "100%",
    spoken: "100 percent",
    label: "Vetted Catalog",
    text: "Closed-catalog grounding. Only staff-approved services and resources are accessible, entirely preventing hallucinations.",
  },
  {
    // The crisis check reads every language the guide offers.
    value: String(CRISIS_LANGUAGES),
    label: "AI-Supported Languages",
    text: "Native-quality voice and chat, spanning Spanish, Vietnamese, Arabic, and more—translating natural speech on the fly.",
  },
  {
    value: "161 KB",
    spoken: "161 kilobytes",
    label: "Page Weight",
    text: "Load-optimized for the field. Built to open in under 2 seconds on low-connectivity, prepaid mobile networks.",
  },
  {
    value: "100/100",
    spoken: "100 out of 100",
    label: "Access & Speed",
    text: "Handheld accessibility. Pre-audited to exceed municipal WCAG standards on any device, screen size, or browser.",
  },
];

/** The bar at the end of the infographic: where the grant goes next, and the page's two buttons. */
export const ROADMAP = {
  title: "Read Technical Specifications",
  subtitle:
    "Our Phase 2 Roadmap: Developing the Open AI Health Stack and Use Case Catalog in partnership with AWS, Azure, GCP, and the BCHC.",
};

export const CTA = {
  primary: "Try the Live Guide",
  primaryNote: "(PIN Required)",
  secondary: "Review Technical and Security Specs",
  secondaryNote: "(20+ Documentation Files)",
};

export const TECHNICAL_TITLE = "Technical detail for IT and security reviewers";
