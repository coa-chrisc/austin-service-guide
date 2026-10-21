/* ------------------------------------------------------------------ */
/*  Spoken-output helpers for the on-device voice intake (pure).       */
/*                                                                     */
/*  Model-written text is never trusted for contact details: speakable */
/*  drops any sentence carrying a phone number, street address, URL or */
/*  email, and any eligibility or income-threshold statement. Contact  */
/*  details are spoken only from catalog records via catalogSpeech.    */
/* ------------------------------------------------------------------ */

import type { ServiceLocation } from "@/types";

/** Shown and spoken when a voice session starts (exact contract text). */
export const VOICE_WELCOME_TEXT =
  "Welcome to the Service Guide Voice Assistant. To protect your privacy, please do not say your name, street address, phone number, or Social Security number. Simply tell me what kind of help or services you are looking for today.";

/* ---- language codes ---- */

const BCP47_BY_LANGUAGE: Record<string, string> = {
  en: "en-US",
  es: "es-US",
  zh: "zh-CN",
  hi: "hi-IN",
  ar: "ar-SA",
  vi: "vi-VN",
  fr: "fr-FR",
  ko: "ko-KR",
};

/** Map the app's language code ("es") to a BCP-47 tag ("es-US"). */
export function toBcp47(code: string): string {
  const normalized = (code || "en").trim().replace(/_/g, "-");
  const [base, region] = normalized.split("-");
  const lower = base.toLowerCase();
  if (region) return `${lower}-${region.toUpperCase()}`;
  return BCP47_BY_LANGUAGE[lower] ?? lower;
}

/* ---- local voice selection ---- */

export interface VoiceLike {
  lang: string;
  localService: boolean;
  default?: boolean;
  name?: string;
}

/**
 * Pick an on-device synthesis voice for a BCP-47 tag. Only voices with
 * localService === true qualify; returns null when there is none.
 */
export function pickLocalVoice<V extends VoiceLike>(
  voices: readonly V[],
  bcp47: string,
): V | null {
  const want = bcp47.replace(/_/g, "-").toLowerCase();
  const wantBase = want.split("-")[0];
  const local = voices.filter((v) => v.localService === true);
  const norm = (v: V) => v.lang.replace(/_/g, "-").toLowerCase();
  const exact = local.filter((v) => norm(v) === want);
  if (exact.length) return exact.find((v) => v.default) ?? exact[0];
  const sameBase = local.filter((v) => norm(v).split("-")[0] === wantBase);
  if (sameBase.length) return sameBase.find((v) => v.default) ?? sameBase[0];
  return null;
}

/* ---- contact / eligibility detectors ---- */

const STREET_SUFFIXES = [
  "street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd",
  "drive", "dr", "lane", "ln", "way", "parkway", "pkwy", "court", "ct",
  "place", "pl", "highway", "hwy", "circle", "cir", "trail", "trl", "loop",
  "expressway", "expy", "freeway", "fwy", "terrace", "ter", "plaza",
  "square", "sq", "pike", "path", "crossing", "xing", "bend", "cove", "cv",
  "pass", "ridge", "row", "run",
];
// Street name words must start with a capital or digit ("Barton Springs",
// "5th") so ordinary phrases like "3 kids on the way" are not addresses.
const SUFFIX_ALT = STREET_SUFFIXES.map(
  (s) => `${s[0].toUpperCase()}${s.slice(1)}|${s.toUpperCase()}|${s}`,
).join("|");

const NUMBER_WORDS =
  "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|" +
  "thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|" +
  "forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";

const ADDRESS_PATTERNS: RegExp[] = [
  // 1200 Barton Springs Rd / 5202 E. Ben White Blvd
  new RegExp(
    `\\b\\d{1,6}[A-Za-z]?\\s+(?:[NSEWnsew]\\.?\\s+|(?:North|South|East|West)\\s+)?(?:[A-Z0-9][\\w.'-]*\\s+){0,4}(?:${SUFFIX_ALT})\\b`,
  ),
  // 8509 FM 969 / 1000 IH-35 / 300 US 183
  /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:FM|RM|RR|SH|US|IH|I|Highway|Hwy|State Highway|Ranch Road)[\s-]*\d{1,4}\b/,
  /\bP\.?\s?O\.?\s+Box\s+\d+/i,
  /\b(?:Suite|Ste|Apt|Unit)\.?\s*#?\s*\d+/i,
  // ZIP codes (78701, 78701-1234)
  /\b\d{5}(?:-\d{4})?\b/,
  // Lowercase street names need a 3+ digit house number ("1200 barton
  // springs road") so "3 kids on the way" still is not an address.
  new RegExp(
    `\\b\\d{3,6}\\s+(?:[a-z][\\w.'-]*\\s+){1,4}(?:${STREET_SUFFIXES.join("|")})\\b`,
    "i",
  ),
  // Spoken house numbers: two or more number words ("twelve hundred Barton
  // Springs Road"); one word alone ("one long road") is not enough.
  new RegExp(
    `\\b(?:${NUMBER_WORDS}\\s+){2,6}(?:[a-z][\\w.'-]*\\s+){0,4}(?:${STREET_SUFFIXES.join("|")})\\b`,
    "i",
  ),
];

// Digit groups with phone-like separators; a phone has 7+ digits.
const DIGIT_RUN = /\+?\(?\d[\d\s().-]*\d/g;
const VANITY_PHONE = /\b1?[-. ]?8(?:00|33|44|55|66|77|88)[-. ]?[A-Z0-9]{3}[-. ]?[A-Z0-9]{4}\b/i;
const URL_PATTERNS: RegExp[] = [
  /\bhttps?:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:gov|org|com|net|edu|us|info|io|co)\b(?:\/\S*)?/i,
];
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const MONEY_OR_PERCENT =
  /\$\s?\d|\b\d[\d,.]*\s?(?:dollars|dólares|usd)\b|\b\d{1,3}\s?%|\b\d+\s?(?:percent|por ciento)\b/i;
const ELIGIBILITY =
  /\b(?:eligib\w*|qualif\w*|income|earn(?:s|ed|ing)?|makes?|making|salary|wages?|poverty|FPL|AMI|median family|thresholds?|requirements?|limits?|elegib\w*|califica\w*|ingresos?|gana\w*|pobreza|requisitos?|l[ií]mites?)\b/i;
// Amounts the model writes without a currency sign: "2,500", "1200", "900 a month",
// "two thousand five hundred". Statements carrying one are not spoken,
// because a model-written figure may be a wrong limit or price.
const LARGE_AMOUNT =
  /\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b|\b\d{3}\s+(?:a|per|each|al|por)\s+(?:month|year|week|mes|año|semana)\b|\b(?:hundred|thousand|million|cien|cientos|mil|millones)\b/i;

function hasPhone(text: string): boolean {
  if (VANITY_PHONE.test(text)) return true;
  for (const m of text.match(DIGIT_RUN) ?? []) {
    if (m.replace(/\D/g, "").length >= 7) return true;
  }
  return false;
}

function hasContact(text: string): boolean {
  return (
    hasPhone(text) ||
    EMAIL.test(text) ||
    URL_PATTERNS.some((p) => p.test(text)) ||
    ADDRESS_PATTERNS.some((p) => p.test(text))
  );
}

function isEligibilityStatement(sentence: string): boolean {
  if (MONEY_OR_PERCENT.test(sentence)) return true;
  // A question asking about income is fine to speak; a statement of who
  // qualifies is not (the model may get it wrong).
  if (/[?？]\s*$/.test(sentence)) return false;
  return ELIGIBILITY.test(sentence) || LARGE_AMOUNT.test(sentence);
}

/* ---- markdown + sentence handling ---- */

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|[.,!?;:]|$)/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+•]|\d{1,2}[.)])\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "");
}

// A period after one of these is not a sentence end ("5202 E. Ben White
// Blvd", "P.O. Box 12", "Dr. Lee"); keep the pieces together so a split
// cannot hide half of an address from the detectors.
const ABBREVIATION_END =
  /(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|No|Jr|Sr|vs|P\.O|e\.g|i\.e|U\.S)\.$/;

function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    let pending = "";
    for (const piece of line.split(/(?<=[.!?。！？])\s+/)) {
      pending = pending ? `${pending} ${piece}` : piece;
      if (!ABBREVIATION_END.test(pending)) {
        out.push(pending);
        pending = "";
      }
    }
    if (pending) out.push(pending);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Turn model-written reply text into something safe to speak aloud: no
 * phone numbers, street addresses, URLs, emails, or eligibility/income
 * statements. Whole sentences are dropped rather than patched so no
 * fragment of a contact detail survives.
 */
export function speakable(modelText: string): string {
  const kept = splitSentences(stripMarkdown(modelText || "")).filter(
    (s) => !hasContact(s) && !isEligibilityStatement(s),
  );
  let out = kept.join(" ").replace(/\s+/g, " ").trim();
  // Joining can, in principle, line up digits across a sentence boundary;
  // re-check the result as a whole and drop it if anything slipped through.
  if (hasContact(out)) {
    out = splitSentences(out)
      .filter((s) => !hasContact(s))
      .join(" ")
      .trim();
    if (hasContact(out)) return "";
  }
  return out;
}

/** Split text into chunks short enough for speechSynthesis to finish reliably. */
export function splitForSpeech(text: string, maxLen = 220): string[] {
  const chunks: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
      continue;
    }
    let rest = sentence;
    while (rest.length > maxLen) {
      const cut = rest.lastIndexOf(" ", maxLen);
      const at = cut > 0 ? cut : maxLen;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks;
}

/* ---- catalog-sourced speech ---- */

/** Read a phone number digit by digit in groups: "5 1 2, 9 7 4, 2 0 0 0". */
export function spokenPhone(phone: string): string {
  const main = phone.split(/\s*(?:x|ext\.?|extension)\s*\d/i)[0];
  const digits = main.replace(/\D/g, "");
  if (!digits) return "";
  const groups: string[] = [];
  let rest = digits;
  if (rest.length === 11 && rest.startsWith("1")) {
    groups.push("1");
    rest = rest.slice(1);
  }
  if (rest.length === 10) {
    groups.push(rest.slice(0, 3), rest.slice(3, 6), rest.slice(6));
  } else if (rest.length === 7) {
    groups.push(rest.slice(0, 3), rest.slice(3));
  } else {
    groups.push(rest);
  }
  return groups.map((g) => g.split("").join(" ")).join(", ");
}

/** The fields catalogSpeech reads; Service and CrisisResource both fit. */
export interface CatalogContact {
  name: string;
  phone?: string;
  locations?: Pick<ServiceLocation, "address" | "city" | "phone" | "is_primary">[];
}

/**
 * Spoken contact line built only from a catalog record: name, catalog phone
 * and primary catalog address. Never pass model-written text here.
 */
export function catalogSpeech(service: CatalogContact): string {
  const locations = service.locations ?? [];
  const location =
    locations.find((l) => l.is_primary && l.address) ??
    locations.find((l) => l.address);
  const phone =
    service.phone ||
    location?.phone ||
    locations.find((l) => l.is_primary && l.phone)?.phone ||
    locations.find((l) => l.phone)?.phone ||
    "";
  const parts = [service.name.trim()];
  const spoken = phone ? spokenPhone(phone) : "";
  if (spoken) parts.push(spoken);
  if (location?.address) {
    parts.push(
      [location.address.trim(), location.city?.trim()].filter(Boolean).join(", "),
    );
  }
  return parts.filter(Boolean).join(". ") + ".";
}

function listNames(names: string[], and: string): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  const comma = and === "and" ? "," : "";
  return `${names.slice(0, -1).join(", ")}${comma} ${and} ${names[names.length - 1]}`;
}

/**
 * Short spoken summary at intake completion, built from catalog service
 * names only. Spanish and English templates; other languages get English
 * (the returned `lang` tells the caller which voice to use).
 */
export function completionSummary(
  matches: { service: { name: string } }[],
  language: string,
  maxNames = 3,
): { text: string; lang: string } {
  const names = matches
    .map((m) => m.service?.name?.trim())
    .filter((n): n is string => !!n)
    .slice(0, maxNames);
  const count = matches.length;
  if (toBcp47(language).startsWith("es")) {
    const text =
      count === 0
        ? "Su entrevista está completa. Seleccione See my plan para ver los siguientes pasos."
        : `Su plan está listo. Encontré ${count} ${count === 1 ? "servicio que puede" : "servicios que pueden"} ayudarle, ${count === 1 ? "" : "incluidos "}${listNames(names, "y")}. Seleccione See my plan para ver los detalles.`;
    return { text: text.replace(/\s+/g, " "), lang: "es-US" };
  }
  const text =
    count === 0
      ? "Your intake is complete. Select See my plan to review your next steps."
      : `Your plan is ready. I found ${count} ${count === 1 ? "service" : "services"} that may help${count === 1 ? ":" : ", including"} ${listNames(names, "and")}. Select See my plan to see the details.`;
  return { text, lang: "en-US" };
}
