/*
 * Crisis lines shown when the intake detects a crisis.
 *
 * The national lines are built in so the block renders even when
 * /api/v1/crisis-resources cannot be reached (offline, rate-limited,
 * server error). The data pack's lines are merged in after them.
 */
import type { CrisisResource, ResidentProfile } from "@/types";

export const NATIONAL_CRISIS_LINES: CrisisResource[] = [
  {
    name: "9-1-1 Emergency",
    description: "Immediate danger or a life-threatening emergency",
    phone: "911",
    available_24_7: true,
    languages: ["en", "es"],
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    description: "Call or text 988 any time, day or night",
    phone: "988",
    available_24_7: true,
    languages: ["en", "es"],
  },
  {
    name: "National DV Hotline",
    description: "Domestic violence support",
    phone: "1-800-799-7233",
    available_24_7: true,
    languages: ["en", "es"],
  },
];

/** Profile crisis indicators that are not a safety crisis. */
const NOT_A_SAFETY_CRISIS = new Set(["homelessness"]);

export function phoneDigits(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

/**
 * National lines first, then the pack's crisis-topic lines, then its other
 * lines. A line whose number is already listed is skipped.
 */
export function mergeCrisisLines(fetched: CrisisResource[]): CrisisResource[] {
  const topical = fetched.filter((r) => r.crisis_topic);
  const rest = fetched.filter((r) => !r.crisis_topic);
  const seen = new Set<string>();
  const merged: CrisisResource[] = [];
  for (const line of [...NATIONAL_CRISIS_LINES, ...topical, ...rest]) {
    const digits = phoneDigits(line.phone);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    merged.push(line);
  }
  return merged;
}

/** Lines read aloud on a crisis turn: the national lines and the pack's crisis-topic lines. */
export function crisisLinesToSpeak(fetched: CrisisResource[]): CrisisResource[] {
  return mergeCrisisLines(fetched.filter((r) => r.crisis_topic));
}

/** True when the profile records a safety crisis (not only homelessness). */
export function hasSafetyCrisis(
  profile: Pick<ResidentProfile, "crisis_indicators"> | null | undefined,
): boolean {
  return (profile?.crisis_indicators ?? []).some(
    (kind) => !NOT_A_SAFETY_CRISIS.has(kind),
  );
}
