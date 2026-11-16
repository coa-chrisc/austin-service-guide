/** The `degraded` fields on /start, /message and voice-config responses. */
export interface DegradedInfo {
  degraded?: string | null;
  degraded_notice?: string | null;
}

/**
 * The out-of-credits notice to show, or null. The text is the deployment's
 * own (city config `serviceGuide.creditsExhaustedMessage`, sent by the
 * server) and is shown as written, never translated.
 */
export function creditsNotice(info: DegradedInfo | null | undefined): string | null {
  if (info?.degraded !== "ai_credits") return null;
  const text = info.degraded_notice?.trim();
  return text || null;
}
