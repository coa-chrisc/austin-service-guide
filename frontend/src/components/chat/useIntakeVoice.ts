/* ------------------------------------------------------------------ */
/*  Voice controller for the chat. Picks the pipeline from the         */
/*  deployment's voice-config:                                         */
/*   - "intercepted_text" (default, and on any config error):          */
/*     on-device STT -> scrubPII -> normal text send -> local TTS of   */
/*     speakable(reply) plus catalog-sourced contact/summary speech.   */
/*   - "realtime_audio": the OpenAI Realtime WebRTC session, behind a  */
/*     raw-audio badge and a consent dialog once per page session.     */
/*     Nothing is spoken on the device: the voice model greets first.  */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCrisisResources,
  getIntakeResults,
  getVoiceConfig,
  type RealtimeToolResult,
  type VoicePipelineMode,
} from "@/lib/api";
import { withIntakeState } from "@/lib/session";
import type { PiiKind } from "@/lib/piiGuard";
import {
  VOICE_WELCOME_TEXT,
  catalogSpeech,
  completionSummary,
  speakable,
  toBcp47,
} from "@/lib/speech";
import { useRealtimeVoiceSession } from "@/hooks/useRealtimeVoiceSession";
import {
  useOnDeviceVoiceIntake,
  type SpokenSegment,
  type UtteranceOutcome,
} from "@/hooks/useOnDeviceVoiceIntake";
import {
  getStoredLanguage,
  setStoredLanguage,
} from "@/components/common/LanguageSelector";
import type { IntakeMessage } from "@/types";
import { languageAfterToolResult, startRealtimeVoice } from "./voiceStart";

type RealtimeOptions = Parameters<typeof useRealtimeVoiceSession>[0];

const WELCOME_SEGMENT: SpokenSegment = {
  text: VOICE_WELCOME_TEXT,
  lang: "en-US",
};
/** How many catalog contact lines to read out at completion. */
const SPOKEN_CONTACTS = 3;

// Consent to raw-audio streaming lasts for this page load only.
let rawAudioConsentGiven = false;

interface Options {
  messages: IntakeMessage[];
  initialMode: "text" | "voice";
  /** Text is loading or the intake is complete: voice start is disabled. */
  disabled: boolean;
  /** The chat's text send path; resolves to the assistant reply shown. */
  sendText: (text: string) => Promise<IntakeMessage | null>;
  /** The voice transcript had identifiers removed. */
  onRedacted: () => void;
  realtime: RealtimeOptions;
}

export function useIntakeVoice({
  messages,
  initialMode,
  disabled,
  sendText,
  onRedacted,
  realtime: realtimeOptions,
}: Options) {
  const [mode, setMode] = useState<VoicePipelineMode | null>(null);
  // Whether the server runs the live model (false: scripted questions). Null until known.
  const [liveAi, setLiveAi] = useState<boolean | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  // The realtime model has started its greeting for this intake; set once
  // OpenAI accepts it, so a retry after a drop never replays it.
  const didGreetRealtimeRef = useRef(false);
  const didAutoStartRef = useRef(false);
  const startGenRef = useRef(0);
  // True from a start request until that start finishes or is cancelled, so
  // a second start (auto-start plus a mic press) cannot replay the welcome.
  const startingRef = useRef(false);
  const sendTextRef = useRef(sendText);
  const onRedactedRef = useRef(onRedacted);

  useEffect(() => {
    sendTextRef.current = sendText;
    onRedactedRef.current = onRedacted;
  }, [sendText, onRedacted]);

  useEffect(() => {
    let cancelled = false;
    getVoiceConfig()
      .then((config) => {
        if (cancelled) return;
        setMode(
          config.mode === "realtime_audio" ? "realtime_audio" : "intercepted_text",
        );
        setLiveAi(config.live_ai);
      })
      .catch(() => {
        // Fail closed to the private default.
        if (!cancelled) setMode("intercepted_text");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the voice model calls set_language, the returned state carries the
  // new language: switch the UI language too, so the screen, later turns
  // (typed or a voice retry) and the plan all follow.
  const { onToolResult } = realtimeOptions;
  const handleRealtimeToolResult = useCallback(
    (result: RealtimeToolResult) => {
      const next = languageAfterToolResult(
        result.state?.language,
        getStoredLanguage(),
      );
      if (next) setStoredLanguage(next);
      onToolResult(result);
    },
    [onToolResult],
  );
  const realtime = useRealtimeVoiceSession({
    ...realtimeOptions,
    onToolResult: handleRealtimeToolResult,
  });

  const onUtterance = useCallback(
    async (text: string, kinds: PiiKind[]): Promise<UtteranceOutcome | null> => {
      if (kinds.length > 0) onRedactedRef.current();
      const language = getStoredLanguage();
      const lang = toBcp47(language);
      const reply = await sendTextRef.current(text);
      if (!reply) return null;
      // Model text is spoken only after contact details and eligibility
      // statements are removed; contact details come from catalog records.
      const speech: SpokenSegment[] = [{ text: speakable(reply.content), lang }];
      if (reply.crisis_detected) {
        try {
          const resources = await getCrisisResources();
          for (const r of resources.slice(0, SPOKEN_CONTACTS)) {
            speech.push({ text: catalogSpeech(r), lang });
          }
        } catch {
          /* the crisis banner still shows the catalog numbers */
        }
      }
      if (reply.is_complete) {
        try {
          const results = await withIntakeState(getIntakeResults);
          const summary = completionSummary(results.matches, language);
          speech.push(summary);
          for (const m of results.matches.slice(0, SPOKEN_CONTACTS)) {
            speech.push({ text: catalogSpeech(m.service), lang: summary.lang });
          }
        } catch {
          speech.push(completionSummary([], language));
        }
        return { speech, endSession: true };
      }
      return { speech };
    },
    [],
  );

  const local = useOnDeviceVoiceIntake({ onUtterance });

  const startOnDevice = useCallback(async () => {
    const gen = ++startGenRef.current;
    const lang = toBcp47(getStoredLanguage());
    startingRef.current = true;
    try {
      const availability = await local.checkAvailability(lang);
      if (gen !== startGenRef.current || availability !== "available") return;
      setWelcomeVisible(true);
      void local.startSession(lang, [WELCOME_SEGMENT]);
    } finally {
      if (gen === startGenRef.current) startingRef.current = false;
    }
  }, [local.checkAvailability, local.startSession]);

  const startRealtime = useCallback(() => {
    // Cancel any pending on-device start; nothing is spoken on the device in
    // this mode. The privacy reminder is shown on screen (VoiceWelcome) and
    // the voice model speaks first, in the UI language.
    ++startGenRef.current;
    startingRef.current = false;
    setWelcomeVisible(true);
    startRealtimeVoice({
      realtime: { start: realtime.start },
      language: getStoredLanguage(),
      messages,
      alreadyGreeted: didGreetRealtimeRef.current,
      onStartupGreeting: () => {
        didGreetRealtimeRef.current = true;
      },
    });
  }, [messages, realtime.start]);

  /** Mic button. */
  const start = useCallback(() => {
    if (mode === null || disabled) return;
    if (startingRef.current || local.isActive || realtime.isActive) return;
    // A manual start replaces any pending voice-first auto-start.
    didAutoStartRef.current = true;
    if (mode === "realtime_audio") {
      if (!rawAudioConsentGiven) {
        setConsentOpen(true);
        return;
      }
      void startRealtime();
      return;
    }
    void startOnDevice();
  }, [
    mode,
    disabled,
    local.isActive,
    realtime.isActive,
    startOnDevice,
    startRealtime,
  ]);

  const agreeToRawAudio = useCallback(() => {
    rawAudioConsentGiven = true;
    setConsentOpen(false);
    void startRealtime();
  }, [startRealtime]);

  const cancelConsent = useCallback(() => setConsentOpen(false), []);

  /** Download the on-device speech pack (click handler), then start. */
  const installSpeechPack = useCallback(async () => {
    const ok = await local.install(toBcp47(getStoredLanguage()));
    if (ok) void startOnDevice();
  }, [local.install, startOnDevice]);

  /** End voice but keep the welcome and any status text. */
  const end = useCallback(() => {
    startGenRef.current += 1;
    startingRef.current = false;
    local.clear();
    realtime.stop();
  }, [local.clear, realtime.stop]);

  /**
   * Clear voice session: stop recognition / WebRTC (which stops every
   * MediaStream track), cancel speech, and drop live transcript and voice
   * state. The text chat is left alone.
   */
  const clear = useCallback(() => {
    end();
    setWelcomeVisible(false);
    setConsentOpen(false);
  }, [end]);

  /** New intake: clear voice and allow the auto-start and greeting again. */
  const reset = useCallback(() => {
    clear();
    didAutoStartRef.current = false;
    didGreetRealtimeRef.current = false;
  }, [clear]);

  // Voice-first intakes start voice once the mode is known.
  useEffect(() => {
    // Wait until the chat is ready so the first utterance is not dropped.
    if (
      initialMode !== "voice" ||
      mode === null ||
      disabled ||
      didAutoStartRef.current
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!didAutoStartRef.current) start();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [initialMode, mode, disabled, start]);

  const isRealtime = mode === "realtime_audio";
  const isActive = realtime.isActive || local.isActive;
  const liveMessage: { role: "user" | "assistant"; content: string } | null =
    realtime.isActive && realtime.liveTranscript
      ? {
          role: realtime.liveTranscriptRole || "assistant",
          content: realtime.liveTranscript,
        }
      : local.isActive && local.interim
        ? { role: "user", content: local.interim }
        : null;
  const starting =
    realtime.status === "connecting" ||
    local.availability === "checking";
  const hasVoiceState =
    welcomeVisible ||
    !!local.message ||
    realtime.status === "error" ||
    local.status === "error";

  return {
    mode,
    liveAi,
    isRealtime,
    realtime,
    local,
    isActive,
    starting,
    disabled: disabled || mode === null,
    liveMessage,
    welcomeVisible,
    hasVoiceState,
    consentOpen,
    start,
    agreeToRawAudio,
    cancelConsent,
    installSpeechPack,
    end,
    clear,
    reset,
  };
}

export type IntakeVoice = ReturnType<typeof useIntakeVoice>;
