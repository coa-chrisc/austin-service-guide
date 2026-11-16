/* ------------------------------------------------------------------ */
/*  Pure start decisions for the realtime (raw audio) voice mode.      */
/*                                                                     */
/*  Nothing here speaks on the device: in realtime_audio mode the      */
/*  voice model itself greets the resident, and the privacy reminder  */
/*  is shown on screen (VoiceWelcome, the consent dialog).             */
/* ------------------------------------------------------------------ */

import type { IntakeMessage } from "@/types";

/**
 * Longest the mic stays closed while the greeting plays. The lock also
 * lifts as soon as the greeting response finishes, and the assistant-audio
 * gate keeps the mic closed while any audio is still playing.
 */
export const REALTIME_GREETING_MIC_LOCK_MS = 8000;

export interface RealtimeVoiceStartOptions {
  speakInitialGreeting: boolean;
  startupMicLockMs: number;
  onStartupGreeting?: () => void;
}

/**
 * The model greets only on the first voice start of an intake the resident
 * hasn't spoken in yet. A retry after a dropped connection, or a restart
 * after "End voice chat", goes straight to listening.
 */
export function realtimeStartOptions(
  messages: Pick<IntakeMessage, "role">[],
  alreadyGreeted: boolean,
): RealtimeVoiceStartOptions {
  const residentHasSpoken = messages.some((m) => m.role === "user");
  const speakInitialGreeting = !alreadyGreeted && !residentHasSpoken;
  return {
    speakInitialGreeting,
    startupMicLockMs: speakInitialGreeting ? REALTIME_GREETING_MIC_LOCK_MS : 0,
  };
}

export interface RealtimeStarter {
  start: (
    language: string,
    conversation: IntakeMessage[],
    options: RealtimeVoiceStartOptions,
  ) => unknown;
}

/** Open the realtime session. There is no local text-to-speech step. */
export function startRealtimeVoice({
  realtime,
  language,
  messages,
  alreadyGreeted,
  onStartupGreeting,
}: {
  realtime: RealtimeStarter;
  language: string;
  messages: IntakeMessage[];
  alreadyGreeted: boolean;
  onStartupGreeting: () => void;
}): RealtimeVoiceStartOptions {
  const options = {
    ...realtimeStartOptions(messages, alreadyGreeted),
    onStartupGreeting,
  };
  void realtime.start(language, messages, options);
  return options;
}

/**
 * The UI language to switch to after a realtime tool result, or null to
 * keep the current one. The intake state's language changes only through
 * set_language, which the voice model calls when the resident speaks
 * another language.
 */
export function languageAfterToolResult(
  stateLanguage: string | null | undefined,
  current: string,
): string | null {
  const next = (stateLanguage || "").trim().toLowerCase();
  if (!next || next === (current || "").trim().toLowerCase()) return null;
  return next;
}
