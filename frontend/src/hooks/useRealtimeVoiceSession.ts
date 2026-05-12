import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRealtimeClientSecret,
  executeRealtimeTool,
  logRealtimeDebugEvent,
  resetRealtimeDebugLogDisabled,
  syncRealtimeTranscript,
  type RealtimeToolResult,
  type RealtimeTranscriptResult,
} from "@/lib/api";
import type { IntakeMessage } from "@/types";

type VoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "finalizing"
  | "error";

interface UseRealtimeVoiceSessionOptions {
  sessionId: string;
  onLocalTranscript: (role: "user" | "assistant", content: string) => void;
  onTranscriptSync: (result: RealtimeTranscriptResult) => void;
  onToolResult: (result: RealtimeToolResult) => void;
}

interface RealtimeFunctionCall {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

type LiveTranscriptRole = "user" | "assistant";

interface RealtimeStartOptions {
  speakInitialGreeting?: boolean;
  startupMicLockMs?: number;
}

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const STARTUP_GREETING_DELAY_MS = 250;
const SESSION_READY_FALLBACK_MS = 900;
const SESSION_UPDATE_FALLBACK_MS = 1600;
const FINAL_PLAN_RENDER_DELAY_MS = 450;
const FINAL_VOICE_STOP_DELAY_MS = 2500;
const FINAL_AUDIO_FALLBACK_BASE_MS = 7000;
const FINAL_AUDIO_FALLBACK_PER_CHAR_MS = 65;
const FINAL_AUDIO_FALLBACK_MIN_MS = 8000;
const FINAL_AUDIO_FALLBACK_MAX_MS = 30000;
const COMPLETION_CTA_FALLBACK_MS = 7000;
const THINKING_TIMEOUT_MS = 15000;
const DEBUG_TEXT_LIMIT = 800;
const RECOVERABLE_REALTIME_ERROR_PATTERNS = [
  "active response",
  "conversation already has",
  "response already",
  "no response",
  "cancelled",
];

function isRecoverableRealtimeError(message: string) {
  const lower = message.toLowerCase();
  return RECOVERABLE_REALTIME_ERROR_PATTERNS.some((pattern) =>
    lower.includes(pattern),
  );
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function messageContent(message: IntakeMessage) {
  const text = message.content.trim();
  if (!text) return null;
  return {
    type: "message",
    role: message.role,
    content: [
      {
        type: message.role === "user" ? "input_text" : "output_text",
        text,
      },
    ],
  };
}

function startErrorMessage(err: unknown) {
  if (err instanceof DOMException) {
    if (
      err.name === "NotAllowedError" ||
      err.message.includes("Permission denied")
    ) {
      return "Microphone permission is blocked. Allow microphone access and try voice chat again.";
    }
    if (err.name === "NotFoundError") {
      return "No microphone was found. Connect a microphone and try voice chat again.";
    }
  }
  return err instanceof Error ? err.message : "Could not start voice chat.";
}

function clipDebugText(value: string, limit = DEBUG_TEXT_LIMIT) {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}... [truncated ${text.length - limit} chars]`;
}

function sanitizeDebugValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return clipDebugText(String(value), 240);
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "undefined"
  ) {
    return value ?? null;
  }
  if (typeof value === "string") return clipDebugText(value);
  if (Array.isArray(value)) {
    const next = value
      .slice(0, 30)
      .map((item) => sanitizeDebugValue(item, depth + 1));
    if (value.length > 30) {
      next.push({ truncated_items: value.length - 30 });
    }
    return next;
  }
  if (typeof value === "object") {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .forEach(([key, child]) => {
        next[clipDebugText(key, 120)] = sanitizeDebugValue(child, depth + 1);
      });
    return next;
  }
  return clipDebugText(String(value));
}

function debugErrorMessage(err: unknown) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function realtimeSessionSummary(session: Record<string, unknown> | null) {
  const audio = session?.audio as
    | {
        input?: {
          turn_detection?: { type?: unknown; create_response?: unknown };
        };
        output?: { voice?: unknown };
      }
    | undefined;
  return {
    has_session: !!session,
    model: session?.model || null,
    output_modalities: session?.output_modalities || null,
    has_instructions: typeof session?.instructions === "string",
    tool_count: Array.isArray(session?.tools) ? session.tools.length : 0,
    tool_choice: session?.tool_choice || null,
    voice: audio?.output?.voice || null,
    turn_detection_type: audio?.input?.turn_detection?.type || null,
    turn_detection_create_response:
      audio?.input?.turn_detection?.create_response ?? null,
  };
}

export function useRealtimeVoiceSession({
  sessionId,
  onLocalTranscript,
  onTranscriptSync,
  onToolResult,
}: UseRealtimeVoiceSessionOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveTranscriptRole, setLiveTranscriptRole] =
    useState<LiveTranscriptRole | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveTranscriptRef = useRef("");
  const liveTranscriptRoleRef = useRef<LiveTranscriptRole | null>(null);
  const startGenerationRef = useRef(0);
  const stoppedRef = useRef(false);
  const transcriptItemIdsRef = useRef<Set<string>>(new Set());
  const stopAfterNextAssistantRef = useRef(false);
  const pendingCompletionResultRef = useRef<RealtimeTranscriptResult | null>(
    null,
  );
  const pendingCompletionToolResultRef = useRef<RealtimeToolResult | null>(
    null,
  );
  const completionFlowRef = useRef(false);
  const finalResponseDoneRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const completionFallbackTimerRef = useRef<number | null>(null);
  const finalAudioFallbackTimerRef = useRef<number | null>(null);
  const completionRenderScheduledRef = useRef(false);
  const finalResponseIdRef = useRef("");
  const finalAudioStartedRef = useRef(false);
  const finalAudioStoppedRef = useRef(false);
  const finalAudioStartedAtRef = useRef<number | null>(null);
  const finalAssistantTextLengthRef = useRef(0);
  const initialResponseSentRef = useRef(false);
  const initialResponseAcknowledgedRef = useRef(false);
  const initialResponseAttemptsRef = useRef(0);
  const initialResponseIdRef = useRef("");
  const startupResponsePendingRef = useRef(false);
  const startupResponseActiveRef = useRef(false);
  const startupMicLockedRef = useRef(false);
  const startupMicUnlockTimerRef = useRef<number | null>(null);
  const isMutedRef = useRef(false);
  const dataChannelOpenRef = useRef(false);
  const sessionReadyRef = useRef(false);
  const sessionCreatedRef = useRef(false);
  const sessionUpdateSentRef = useRef(false);
  const sessionUpdatedRef = useRef(false);
  const sessionConfigRef = useRef<Record<string, unknown> | null>(null);
  const lastPushedInstructionsRef = useRef<string>("");
  const sessionUpdateTimerRef = useRef<number | null>(null);
  const initialResponseEventRef = useRef<Record<string, unknown> | null>(null);
  const initialGreetingTextRef = useRef("");
  const initialResponseTimerRef = useRef<number | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const thinkingStartedAtRef = useRef<number | null>(null);
  const thinkingWatchdogTimerRef = useRef<number | null>(null);
  const lastRealtimeEventTypeRef = useRef("");
  const lastRealtimeEventAtRef = useRef<number | null>(null);
  const debugSeqRef = useRef(0);
  const stopSessionRef = useRef<() => void>(() => undefined);
  const onLocalTranscriptRef = useRef(onLocalTranscript);
  const onTranscriptSyncRef = useRef(onTranscriptSync);
  const onToolResultRef = useRef(onToolResult);

  useEffect(() => {
    onLocalTranscriptRef.current = onLocalTranscript;
    onTranscriptSyncRef.current = onTranscriptSync;
    onToolResultRef.current = onToolResult;
  }, [onLocalTranscript, onToolResult, onTranscriptSync]);

  const recordDebug = useCallback(
    (
      event: string,
      detail: Record<string, unknown> = {},
      statusOverride?: VoiceStatus | string,
    ) => {
      debugSeqRef.current += 1;
      const payload = {
        event,
        source: "client",
        status: String(statusOverride ?? statusRef.current),
        detail: sanitizeDebugValue({
          client_seq: debugSeqRef.current,
          ...detail,
        }) as Record<string, unknown>,
      };
      console.debug("[realtime]", payload.event, payload);
      void logRealtimeDebugEvent(sessionId, payload).catch(() => undefined);
    },
    [sessionId],
  );

  useEffect(() => {
    const previous = statusRef.current;
    statusRef.current = status;
    recordDebug("status_changed", { previous, next: status }, status);

    if (thinkingWatchdogTimerRef.current) {
      window.clearTimeout(thinkingWatchdogTimerRef.current);
      thinkingWatchdogTimerRef.current = null;
    }
    if (status !== "thinking") {
      thinkingStartedAtRef.current = null;
      return;
    }

    thinkingStartedAtRef.current = Date.now();
    thinkingWatchdogTimerRef.current = window.setTimeout(() => {
      if (statusRef.current !== "thinking" || stoppedRef.current) return;
      const startedAt = thinkingStartedAtRef.current ?? Date.now();
      recordDebug(
        "thinking_timeout",
        {
          elapsed_ms: Date.now() - startedAt,
          last_realtime_event_type: lastRealtimeEventTypeRef.current,
          last_realtime_event_age_ms: lastRealtimeEventAtRef.current
            ? Date.now() - lastRealtimeEventAtRef.current
            : null,
          completion_flow: completionFlowRef.current,
        },
        "thinking",
      );
      if (!completionFlowRef.current) {
        onLocalTranscriptRef.current(
          "assistant",
          "I'm still connected, but that voice response got stuck. Please say that again.",
        );
        setStatus("connected");
        return;
      }

      const completionToolResult = pendingCompletionToolResultRef.current;
      if (completionToolResult) {
        if (completionFallbackTimerRef.current) {
          window.clearTimeout(completionFallbackTimerRef.current);
          completionFallbackTimerRef.current = null;
        }
        recordDebug(
          "completion_voice_timeout_finalized",
          {
            progress_percent: completionToolResult.progress_percent,
            match_count: completionToolResult.match_count,
          },
          "thinking",
        );
        onToolResultRef.current({ ...completionToolResult, is_complete: true });
        completionFlowRef.current = false;
        pendingCompletionToolResultRef.current = null;
        setStatus("finalizing");
        completionTimerRef.current = window.setTimeout(
          () => stopSessionRef.current(),
          FINAL_VOICE_STOP_DELAY_MS,
        );
      }
    }, THINKING_TIMEOUT_MS);

    return () => {
      if (thinkingWatchdogTimerRef.current) {
        window.clearTimeout(thinkingWatchdogTimerRef.current);
        thinkingWatchdogTimerRef.current = null;
      }
    };
  }, [recordDebug, status]);

  const sendEvent = useCallback(
    (event: Record<string, unknown>) => {
      const dc = dcRef.current;
      if (!dc || dc.readyState !== "open") {
        recordDebug("data_channel_send_dropped", {
          type: event.type,
          ready_state: dc?.readyState || "missing",
        });
        return false;
      }
      dc.send(JSON.stringify(event));
      return true;
    },
    [recordDebug],
  );

  const requestModelResponse = useCallback(
    (reason: string, response?: Record<string, unknown>) => {
      const event: Record<string, unknown> = { type: "response.create" };
      if (response) event.response = response;
      recordDebug("response_create_sent", {
        reason,
        has_response_options: !!response,
      });
      if (!sendEvent(event)) return false;
      setStatus("thinking");
      return true;
    },
    [recordDebug, sendEvent],
  );

  // Realtime audio_transcript deltas arrive 30-50/sec. Committing each one to
  // React state caused the chat bubble to re-render that fast, which made
  // streaming text feel herky-jerky and competed with the smooth-scroll
  // effect. Coalesce delta-driven updates to a single paint per frame; flush
  // immediately on discrete writes (role switch, clear) so resets are
  // instant. The ref-based accumulation preserves token-level fidelity for
  // commit/sync paths that read liveTranscriptRef directly.
  const liveTranscriptRafRef = useRef<number | null>(null);

  const cancelLiveTranscriptFlush = useCallback(() => {
    if (liveTranscriptRafRef.current !== null) {
      window.cancelAnimationFrame(liveTranscriptRafRef.current);
      liveTranscriptRafRef.current = null;
    }
  }, []);

  const scheduleLiveTranscriptFlush = useCallback(() => {
    if (liveTranscriptRafRef.current !== null) return;
    liveTranscriptRafRef.current = window.requestAnimationFrame(() => {
      liveTranscriptRafRef.current = null;
      setLiveTranscript(liveTranscriptRef.current);
    });
  }, []);

  // Cancel any pending RAF flush on unmount so the scheduled callback can't
  // call setLiveTranscript after the component is gone. stop() already cancels
  // through clearLiveTranscript, but a parent unmount may skip stop().
  useEffect(() => {
    return () => {
      cancelLiveTranscriptFlush();
    };
  }, [cancelLiveTranscriptFlush]);

  const commitLiveTranscript = useCallback(() => {
    const role = liveTranscriptRoleRef.current;
    const text = liveTranscriptRef.current.trim();
    if (role && text) {
      onLocalTranscriptRef.current(role, text);
    }
  }, []);

  const setLiveTranscriptForRole = useCallback(
    (role: LiveTranscriptRole, value: string) => {
      if (liveTranscriptRoleRef.current !== role || value === "") {
        commitLiveTranscript();
      }
      cancelLiveTranscriptFlush();
      liveTranscriptRef.current = value;
      liveTranscriptRoleRef.current = role;
      setLiveTranscriptRole(role);
      setLiveTranscript(value);
    },
    [cancelLiveTranscriptFlush, commitLiveTranscript],
  );

  const appendLiveTranscript = useCallback(
    (role: LiveTranscriptRole, delta: string) => {
      if (!delta) return;
      if (liveTranscriptRoleRef.current !== role) {
        setLiveTranscriptForRole(role, delta);
        return;
      }
      liveTranscriptRef.current = `${liveTranscriptRef.current}${delta}`;
      scheduleLiveTranscriptFlush();
    },
    [scheduleLiveTranscriptFlush, setLiveTranscriptForRole],
  );

  const clearLiveTranscript = useCallback(() => {
    commitLiveTranscript();
    cancelLiveTranscriptFlush();
    liveTranscriptRef.current = "";
    liveTranscriptRoleRef.current = null;
    setLiveTranscriptRole(null);
    setLiveTranscript("");
  }, [cancelLiveTranscriptFlush, commitLiveTranscript]);

  const clearLiveTranscriptIfCurrent = useCallback(
    (role: LiveTranscriptRole, text: string) => {
      if (liveTranscriptRoleRef.current !== role) return;
      if (liveTranscriptRef.current.trim() !== text.trim()) return;
      cancelLiveTranscriptFlush();
      liveTranscriptRef.current = "";
      liveTranscriptRoleRef.current = null;
      setLiveTranscript("");
      setLiveTranscriptRole(null);
    },
    [cancelLiveTranscriptFlush],
  );

  const setInputTracksEnabled = useCallback((enabled: boolean) => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled && !isMutedRef.current;
    });
  }, []);

  const unlockStartupMic = useCallback(() => {
    startupMicLockedRef.current = false;
    if (startupMicUnlockTimerRef.current) {
      window.clearTimeout(startupMicUnlockTimerRef.current);
      startupMicUnlockTimerRef.current = null;
    }
    setInputTracksEnabled(true);
  }, [setInputTracksEnabled]);

  // Closes and nulls the WebRTC transport handles (mic stream, data channel,
  // peer connection, playback audio). Idempotent — safe to call when refs are
  // already null. Used by stop(), start() (defensive pre-clean), and any
  // fatal-error path that does not go through stop().
  const teardownTransport = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  // Resets the shared session refs and pending timers that both start() and stop()
  // need to clear. Stop-only teardown (thinking watchdog, transport handles, status)
  // remains inline in stop(); start-only seed state (stoppedRef=false, transcript
  // ids) remains inline in start().
  const resetSessionState = useCallback(() => {
    stopAfterNextAssistantRef.current = false;
    pendingCompletionResultRef.current = null;
    pendingCompletionToolResultRef.current = null;
    completionFlowRef.current = false;
    finalResponseDoneRef.current = false;
    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    if (completionFallbackTimerRef.current) {
      window.clearTimeout(completionFallbackTimerRef.current);
      completionFallbackTimerRef.current = null;
    }
    if (finalAudioFallbackTimerRef.current) {
      window.clearTimeout(finalAudioFallbackTimerRef.current);
      finalAudioFallbackTimerRef.current = null;
    }
    completionRenderScheduledRef.current = false;
    finalResponseIdRef.current = "";
    finalAudioStartedRef.current = false;
    finalAudioStoppedRef.current = false;
    finalAudioStartedAtRef.current = null;
    finalAssistantTextLengthRef.current = 0;
    initialResponseSentRef.current = false;
    initialResponseAcknowledgedRef.current = false;
    initialResponseAttemptsRef.current = 0;
    initialResponseIdRef.current = "";
    startupResponsePendingRef.current = false;
    startupResponseActiveRef.current = false;
    startupMicLockedRef.current = false;
    isMutedRef.current = false;
    if (startupMicUnlockTimerRef.current) {
      window.clearTimeout(startupMicUnlockTimerRef.current);
      startupMicUnlockTimerRef.current = null;
    }
    if (initialResponseTimerRef.current) {
      window.clearTimeout(initialResponseTimerRef.current);
      initialResponseTimerRef.current = null;
    }
    dataChannelOpenRef.current = false;
    sessionReadyRef.current = false;
    sessionCreatedRef.current = false;
    sessionUpdateSentRef.current = false;
    sessionUpdatedRef.current = false;
    sessionConfigRef.current = null;
    lastPushedInstructionsRef.current = "";
    if (sessionUpdateTimerRef.current) {
      window.clearTimeout(sessionUpdateTimerRef.current);
      sessionUpdateTimerRef.current = null;
    }
    initialResponseEventRef.current = null;
    initialGreetingTextRef.current = "";
  }, []);

  const stop = useCallback(() => {
    startGenerationRef.current += 1;
    recordDebug("voice_stop_requested", {
      previous_status: statusRef.current,
      last_realtime_event_type: lastRealtimeEventTypeRef.current,
    });
    stoppedRef.current = true;
    resetSessionState();
    if (thinkingWatchdogTimerRef.current) {
      window.clearTimeout(thinkingWatchdogTimerRef.current);
      thinkingWatchdogTimerRef.current = null;
    }
    thinkingStartedAtRef.current = null;
    clearLiveTranscript();
    setIsMuted(false);
    teardownTransport();
    setStatus("idle");
  }, [clearLiveTranscript, recordDebug, resetSessionState, teardownTransport]);

  useEffect(() => {
    stopSessionRef.current = stop;
  }, [stop]);

  const sendInitialResponseWhenReady = useCallback(() => {
    if (
      initialResponseSentRef.current ||
      !dataChannelOpenRef.current ||
      !sessionReadyRef.current ||
      !initialResponseEventRef.current
    ) {
      return;
    }
    initialResponseSentRef.current = true;
    const sendInitialResponse = () => {
      initialResponseTimerRef.current = null;
      if (!stoppedRef.current) {
        const event = initialResponseEventRef.current;
        if (!event) return;
        initialResponseAttemptsRef.current += 1;
        startupResponsePendingRef.current = true;
        const greetingText = initialGreetingTextRef.current.trim();
        recordDebug("startup_response_create_sent", {
          attempt: initialResponseAttemptsRef.current,
          data_channel_open: dataChannelOpenRef.current,
          session_ready: sessionReadyRef.current,
          greeting_length: greetingText.length,
        });
        if (greetingText) {
          const response = {
            ...((event.response as Record<string, unknown> | undefined) || {}),
            input: [
              {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text:
                      "Voice mode just connected. The resident is waiting for " +
                      "the guide to speak first. Read the startup greeting " +
                      "below aloud exactly once, then stop and wait for the " +
                      "resident. Do not call tools.\n\nStartup greeting:\n" +
                      greetingText,
                  },
                ],
              },
            ],
          };
          requestModelResponse("startup_greeting", response);
        } else {
          requestModelResponse(
            "startup_greeting",
            event.response as Record<string, unknown>,
          );
        }
        if (initialResponseAttemptsRef.current < 2) {
          initialResponseTimerRef.current = window.setTimeout(() => {
            if (
              !initialResponseAcknowledgedRef.current &&
              !stoppedRef.current
            ) {
              recordDebug("startup_response_retry_scheduled", {
                attempt: initialResponseAttemptsRef.current + 1,
              });
              sendInitialResponse();
            }
          }, 1800);
        }
      }
    };
    initialResponseTimerRef.current = window.setTimeout(
      sendInitialResponse,
      STARTUP_GREETING_DELAY_MS,
    );
  }, [recordDebug, requestModelResponse, sendEvent]);

  const finalAudioFallbackDelay = useCallback(() => {
    const estimatedPlaybackMs = Math.round(
      FINAL_AUDIO_FALLBACK_BASE_MS +
        finalAssistantTextLengthRef.current * FINAL_AUDIO_FALLBACK_PER_CHAR_MS,
    );
    const elapsedPlaybackMs =
      finalAudioStartedAtRef.current === null
        ? 0
        : Math.max(0, Date.now() - finalAudioStartedAtRef.current);
    const remainingMs = Math.max(0, estimatedPlaybackMs - elapsedPlaybackMs);
    return Math.min(
      FINAL_AUDIO_FALLBACK_MAX_MS,
      Math.max(FINAL_AUDIO_FALLBACK_MIN_MS, remainingMs + 2000),
    );
  }, []);

  const scheduleCompletionFinish = useCallback(
    (reason = "completion_ready") => {
      if (completionRenderScheduledRef.current || stoppedRef.current) return;
      const completionResult = pendingCompletionResultRef.current;
      const completionToolResult = pendingCompletionToolResultRef.current;

      if (!completionResult && !completionToolResult) return;

      if (finalResponseIdRef.current && !finalResponseDoneRef.current) {
        recordDebug("completion_waiting_for_response_done", {
          reason,
          final_response_id: finalResponseIdRef.current,
        });
        return;
      }

      if (finalResponseDoneRef.current && !finalAudioStoppedRef.current) {
        setStatus(finalAudioStartedRef.current ? "speaking" : "finalizing");
        if (!finalAudioFallbackTimerRef.current) {
          const delayMs = finalAudioFallbackDelay();
          recordDebug("completion_waiting_for_final_audio", {
            reason,
            final_response_id: finalResponseIdRef.current || null,
            audio_started: finalAudioStartedRef.current,
            fallback_delay_ms: delayMs,
            final_text_length: finalAssistantTextLengthRef.current,
            audio_elapsed_ms:
              finalAudioStartedAtRef.current === null
                ? null
                : Math.max(0, Date.now() - finalAudioStartedAtRef.current),
          });
          finalAudioFallbackTimerRef.current = window.setTimeout(() => {
            finalAudioFallbackTimerRef.current = null;
            if (stoppedRef.current || completionRenderScheduledRef.current)
              return;
            finalAudioStoppedRef.current = true;
            recordDebug("completion_final_audio_fallback_elapsed", {
              final_response_id: finalResponseIdRef.current || null,
            });
            scheduleCompletionFinish("final_audio_fallback_elapsed");
          }, delayMs);
        }
        return;
      }

      completionRenderScheduledRef.current = true;
      stopAfterNextAssistantRef.current = false;
      if (completionFallbackTimerRef.current) {
        window.clearTimeout(completionFallbackTimerRef.current);
        completionFallbackTimerRef.current = null;
      }
      if (finalAudioFallbackTimerRef.current) {
        window.clearTimeout(finalAudioFallbackTimerRef.current);
        finalAudioFallbackTimerRef.current = null;
      }
      recordDebug("completion_finish_scheduled", {
        reason,
        source: completionResult ? "assistant_transcript" : "tool_result",
        final_response_id: finalResponseIdRef.current || null,
        audio_started: finalAudioStartedRef.current,
        audio_stopped: finalAudioStoppedRef.current,
        progress_percent:
          completionResult?.progress_percent ??
          completionToolResult?.progress_percent,
        message_count: completionResult?.messages.length ?? 0,
        match_count: completionToolResult?.match_count,
        render_delay_ms: FINAL_PLAN_RENDER_DELAY_MS,
        stop_delay_ms: FINAL_VOICE_STOP_DELAY_MS,
      });
      setStatus("finalizing");

      completionTimerRef.current = window.setTimeout(() => {
        if (!stoppedRef.current) {
          if (completionResult) {
            onTranscriptSyncRef.current({
              ...completionResult,
              is_complete: true,
            });
          } else if (completionToolResult) {
            onToolResultRef.current({
              ...completionToolResult,
              is_complete: true,
            });
          }
        }
        pendingCompletionResultRef.current = null;
        pendingCompletionToolResultRef.current = null;
        completionTimerRef.current = window.setTimeout(
          stop,
          FINAL_VOICE_STOP_DELAY_MS,
        );
      }, FINAL_PLAN_RENDER_DELAY_MS);
    },
    [finalAudioFallbackDelay, recordDebug, stop],
  );

  const finishCompletionFromToolResult = useCallback(
    (reason: string) => {
      if (!pendingCompletionToolResultRef.current || stoppedRef.current)
        return false;
      scheduleCompletionFinish(reason);
      return true;
    },
    [scheduleCompletionFinish],
  );

  const syncTranscript = useCallback(
    async (role: "user" | "assistant", content: string) => {
      const text = content.trim();
      if (!text || stoppedRef.current) return false;
      if (
        role === "assistant" &&
        (stopAfterNextAssistantRef.current || completionFlowRef.current)
      ) {
        finalAssistantTextLengthRef.current = Math.max(
          finalAssistantTextLengthRef.current,
          text.length,
        );
      }
      const generation = startGenerationRef.current;
      recordDebug("transcript_sync_started", {
        role,
        content_length: text.length,
        content_preview: clipDebugText(text, 240),
      });
      onLocalTranscriptRef.current(role, text);
      try {
        const result = await syncRealtimeTranscript(sessionId, {
          role,
          content: text,
        });
        if (stoppedRef.current || generation !== startGenerationRef.current) {
          recordDebug("transcript_sync_ignored", {
            role,
            reason: stoppedRef.current ? "stopped" : "stale_generation",
          });
          return false;
        }
        recordDebug("transcript_sync_completed", {
          role,
          message_count: result.messages.length,
          progress_percent: result.progress_percent,
          is_complete: result.is_complete,
          crisis_detected: result.crisis_detected,
        });
        const syncedResult =
          result.messages.length > 0
            ? result
            : {
                ...result,
                messages: [
                  {
                    role,
                    content: text,
                    suggested_buttons: [],
                    progress_percent: result.progress_percent,
                    is_complete: result.is_complete,
                    crisis_detected: result.crisis_detected,
                  },
                ],
              };
        if (
          role === "assistant" &&
          stopAfterNextAssistantRef.current &&
          syncedResult.is_complete
        ) {
          finalAssistantTextLengthRef.current = text.length;
          pendingCompletionResultRef.current = {
            ...syncedResult,
            messages: [],
          };
          onTranscriptSyncRef.current({ ...syncedResult, is_complete: false });
          scheduleCompletionFinish("assistant_transcript_synced");
        } else {
          onTranscriptSyncRef.current(syncedResult);
        }
        return true;
      } catch (err) {
        recordDebug("transcript_sync_failed", {
          role,
          error: debugErrorMessage(err),
        });
        // Tear down before transitioning to error so a retry doesn't leak
        // the previous session's mic stream / WebRTC handles.
        stopSessionRef.current?.();
        setError(
          err instanceof Error ? err.message : "Failed to sync transcript.",
        );
        setStatus("error");
        return false;
      } finally {
        clearLiveTranscriptIfCurrent(role, text);
      }
    },
    [
      clearLiveTranscriptIfCurrent,
      recordDebug,
      scheduleCompletionFinish,
      sessionId,
    ],
  );

  const handleFunctionCalls = useCallback(
    async (calls: RealtimeFunctionCall[]) => {
      let shouldCreateResponse = false;
      const generation = startGenerationRef.current;
      recordDebug("function_calls_detected", {
        count: calls.length,
        names: calls.map((call) => call.name),
      });
      for (const call of calls) {
        if (stoppedRef.current || generation !== startGenerationRef.current) {
          recordDebug("tool_call_ignored", {
            name: call.name,
            call_id: call.call_id,
            reason: stoppedRef.current ? "stopped" : "stale_generation",
          });
          return;
        }
        try {
          const startedAt = Date.now();
          recordDebug("tool_call_started", {
            name: call.name,
            call_id: call.call_id,
            argument_keys: Object.keys(parseArguments(call.arguments)),
          });
          const result = await executeRealtimeTool(sessionId, {
            name: call.name,
            arguments: parseArguments(call.arguments),
            call_id: call.call_id,
          });
          if (stoppedRef.current || generation !== startGenerationRef.current) {
            recordDebug("tool_call_result_ignored", {
              name: call.name,
              call_id: call.call_id,
              reason: stoppedRef.current ? "stopped" : "stale_generation",
            });
            return;
          }
          recordDebug("tool_call_completed", {
            name: call.name,
            call_id: call.call_id,
            elapsed_ms: Date.now() - startedAt,
            status: result.status,
            progress_percent: result.progress_percent,
            is_complete: result.is_complete,
            crisis_detected: result.crisis_detected,
            match_count: result.match_count,
          });
          if (result.is_complete) {
            stopAfterNextAssistantRef.current = true;
            pendingCompletionToolResultRef.current = result;
            completionFlowRef.current = true;
            completionRenderScheduledRef.current = false;
            finalResponseDoneRef.current = false;
            finalResponseIdRef.current = "";
            finalAudioStartedRef.current = false;
            finalAudioStoppedRef.current = false;
            finalAudioStartedAtRef.current = null;
            finalAssistantTextLengthRef.current = 0;
            if (finalAudioFallbackTimerRef.current) {
              window.clearTimeout(finalAudioFallbackTimerRef.current);
              finalAudioFallbackTimerRef.current = null;
            }
            setStatus("finalizing");
            onToolResultRef.current({ ...result, is_complete: false });
            if (completionFallbackTimerRef.current) {
              window.clearTimeout(completionFallbackTimerRef.current);
            }
            completionFallbackTimerRef.current = window.setTimeout(() => {
              if (!stoppedRef.current && completionFlowRef.current) {
                finishCompletionFromToolResult("tool_result_timeout");
              }
            }, COMPLETION_CTA_FALLBACK_MS);
          } else {
            onToolResultRef.current(result);
          }
          // Push refreshed instructions BEFORE the function_call_output so
          // the next response uses the updated "Currently known" snapshot.
          // Only advance lastPushedInstructionsRef if sendEvent actually
          // dispatched — otherwise a dropped data channel would suppress
          // future retries of the same instructions.
          const refreshed = result.refreshed_instructions;
          if (
            typeof refreshed === "string" &&
            refreshed.length > 0 &&
            refreshed !== lastPushedInstructionsRef.current
          ) {
            const sent = sendEvent({
              type: "session.update",
              session: { type: "realtime", instructions: refreshed },
            });
            if (sent) {
              lastPushedInstructionsRef.current = refreshed;
              recordDebug("session_update_instructions_refreshed", {
                tool: call.name,
                call_id: call.call_id,
                length: refreshed.length,
              });
            }
          }
          sendEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: call.call_id,
              output: result.output,
            },
          });
          if (call.name !== "wait_for_user") {
            shouldCreateResponse = true;
          }
        } catch (err) {
          if (stoppedRef.current || generation !== startGenerationRef.current) {
            recordDebug("tool_call_error_ignored", {
              name: call.name,
              call_id: call.call_id,
              reason: stoppedRef.current ? "stopped" : "stale_generation",
              error: debugErrorMessage(err),
            });
            return;
          }
          recordDebug("tool_call_failed", {
            name: call.name,
            call_id: call.call_id,
            error: debugErrorMessage(err),
          });
          sendEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({
                error:
                  err instanceof Error ? err.message : "Tool execution failed.",
              }),
            },
          });
          shouldCreateResponse = true;
        }
      }
      if (shouldCreateResponse) {
        window.setTimeout(() => {
          if (!stoppedRef.current) {
            requestModelResponse("post_tool", { output_modalities: ["audio"] });
          }
        }, 150);
      } else {
        setStatus("connected");
      }
    },
    [
      finishCompletionFromToolResult,
      recordDebug,
      requestModelResponse,
      sendEvent,
      sessionId,
    ],
  );

  const handleRealtimeEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = String(event.type || "");
      const responseId = String(event.response_id || "");
      lastRealtimeEventTypeRef.current = type;
      lastRealtimeEventAtRef.current = Date.now();
      const isDeltaEvent = type.endsWith(".delta");
      if (!isDeltaEvent) {
        recordDebug("realtime_event_received", {
          type,
          response_id: responseId || null,
          item_id: event.item_id || null,
        });
      }
      const isStartupResponse =
        (!!responseId && responseId === initialResponseIdRef.current) ||
        startupResponseActiveRef.current;
      if (type === "session.created") {
        sessionCreatedRef.current = true;
        if (!initialResponseSentRef.current) {
          setStatus("connected");
        }
        if (!sessionUpdateSentRef.current && sessionConfigRef.current) {
          const initialInstructions =
            typeof sessionConfigRef.current.instructions === "string"
              ? (sessionConfigRef.current.instructions as string)
              : "";
          const sent = sendEvent({
            type: "session.update",
            session: sessionConfigRef.current,
          });
          if (!sent) {
            // The data channel rejected the initial session.update, so the
            // model never received tools/instructions. Don't let the
            // fallback timer mark the session ready — fail fast so the
            // user can retry rather than continuing in a misconfigured
            // state where the "Currently known" prompt and tool flow
            // silently don't work.
            recordDebug("session_update_initial_send_failed", {
              data_channel_state: dcRef.current?.readyState ?? "missing",
            });
            setError("Could not configure the realtime voice session.");
            setStatus("error");
            stopSessionRef.current?.();
            return;
          }
          sessionUpdateSentRef.current = true;
          recordDebug(
            "session_update_sent",
            realtimeSessionSummary(sessionConfigRef.current),
          );
          // Seed the diff baseline only after the send succeeded so the
          // first post-tool refresh isn't suppressed as a no-op.
          lastPushedInstructionsRef.current = initialInstructions;
          if (sessionUpdateTimerRef.current) {
            window.clearTimeout(sessionUpdateTimerRef.current);
          }
          const generation = startGenerationRef.current;
          sessionUpdateTimerRef.current = window.setTimeout(() => {
            if (
              !stoppedRef.current &&
              generation === startGenerationRef.current &&
              sessionCreatedRef.current &&
              !sessionUpdatedRef.current &&
              !sessionReadyRef.current
            ) {
              recordDebug("session_update_fallback_ready", {
                elapsed_ms: SESSION_UPDATE_FALLBACK_MS,
              });
              sessionReadyRef.current = true;
              sendInitialResponseWhenReady();
            }
          }, SESSION_UPDATE_FALLBACK_MS);
          return;
        }
        sessionReadyRef.current = true;
        sendInitialResponseWhenReady();
        return;
      }
      if (type === "session.updated") {
        sessionUpdatedRef.current = true;
        if (sessionUpdateTimerRef.current) {
          window.clearTimeout(sessionUpdateTimerRef.current);
          sessionUpdateTimerRef.current = null;
        }
        sessionReadyRef.current = true;
        if (!initialResponseSentRef.current) {
          setStatus("connected");
        }
        sendInitialResponseWhenReady();
        return;
      }
      if (type === "input_audio_buffer.speech_started") {
        if (completionFlowRef.current) return;
        setStatus("listening");
        setLiveTranscriptForRole("user", "");
        return;
      }
      if (type === "input_audio_buffer.speech_stopped") {
        if (completionFlowRef.current) return;
        setStatus("thinking");
        return;
      }
      if (type === "response.created") {
        const response = event.response as
          | { id?: string; metadata?: Record<string, unknown> }
          | undefined;
        const isStartupCreated =
          response?.metadata?.purpose === "startup_greeting" ||
          startupResponsePendingRef.current;
        if (isStartupCreated && response?.id) {
          initialResponseIdRef.current = response.id;
          startupResponsePendingRef.current = false;
          startupResponseActiveRef.current = true;
        }
        if (!isStartupCreated && completionFlowRef.current && response?.id) {
          finalResponseIdRef.current = response.id;
          finalAudioStartedRef.current = false;
          finalAudioStoppedRef.current = false;
          finalAudioStartedAtRef.current = null;
          finalResponseDoneRef.current = false;
          recordDebug("completion_response_created", {
            final_response_id: response.id,
          });
        }
        initialResponseAcknowledgedRef.current = true;
        if (initialResponseTimerRef.current) {
          window.clearTimeout(initialResponseTimerRef.current);
          initialResponseTimerRef.current = null;
        }
        setStatus(completionFlowRef.current ? "finalizing" : "thinking");
        return;
      }
      if (
        type === "output_audio_buffer.started" ||
        type === "output_audio_buffer.stopped" ||
        type === "output_audio_buffer.cleared"
      ) {
        const isFinalAudio =
          !!responseId &&
          (responseId === finalResponseIdRef.current ||
            (!finalResponseIdRef.current &&
              completionFlowRef.current &&
              !startupResponseActiveRef.current));
        if (isFinalAudio) {
          if (!finalResponseIdRef.current) {
            finalResponseIdRef.current = responseId;
          }
          if (type === "output_audio_buffer.started") {
            finalAudioStartedRef.current = true;
            finalAudioStoppedRef.current = false;
            finalAudioStartedAtRef.current = Date.now();
            recordDebug("completion_final_audio_started", {
              final_response_id: responseId,
            });
            setStatus("speaking");
          } else {
            finalAudioStoppedRef.current = true;
            if (!finalResponseDoneRef.current) {
              finalResponseDoneRef.current = true;
            }
            if (finalAudioFallbackTimerRef.current) {
              window.clearTimeout(finalAudioFallbackTimerRef.current);
              finalAudioFallbackTimerRef.current = null;
            }
            recordDebug("completion_final_audio_stopped", {
              final_response_id: responseId,
              event_type: type,
            });
            scheduleCompletionFinish(type);
          }
          return;
        }
        if (type === "output_audio_buffer.started") {
          setStatus("speaking");
        }
        return;
      }
      if (
        type === "response.output_audio.delta" ||
        type === "response.audio.delta"
      ) {
        setStatus("speaking");
        return;
      }
      if (
        type === "conversation.item.input_audio_transcription.delta" ||
        type === "response.output_audio_transcript.delta" ||
        type === "response.audio_transcript.delta" ||
        type === "response.output_text.delta" ||
        type === "response.text.delta"
      ) {
        const delta = String(event.delta || "");
        if (isStartupResponse) return;
        appendLiveTranscript(
          type === "conversation.item.input_audio_transcription.delta"
            ? "user"
            : "assistant",
          delta,
        );
        return;
      }
      if (type === "conversation.item.input_audio_transcription.completed") {
        const itemId = String(event.item_id || "");
        const transcript = String(event.transcript || "");
        recordDebug("input_transcription_completed", {
          item_id: itemId,
          content_length: transcript.trim().length,
          content_preview: clipDebugText(transcript, 240),
        });
        if (itemId && transcript.trim())
          transcriptItemIdsRef.current.add(itemId);
        void (async () => {
          const synced = await syncTranscript("user", transcript);
          if (
            synced &&
            transcript.trim() &&
            !stoppedRef.current &&
            !completionFlowRef.current
          ) {
            requestModelResponse("user_transcript_completed", {
              output_modalities: ["audio"],
            });
          }
        })();
        return;
      }
      if (
        type === "response.output_audio_transcript.done" ||
        type === "response.audio_transcript.done" ||
        type === "response.output_text.done" ||
        type === "response.text.done"
      ) {
        const itemId = String(event.item_id || "");
        const transcript = String(event.transcript || event.text || "");
        if (isStartupResponse) return;
        if (
          transcript.trim() &&
          (stopAfterNextAssistantRef.current || completionFlowRef.current)
        ) {
          finalAssistantTextLengthRef.current = Math.max(
            finalAssistantTextLengthRef.current,
            transcript.trim().length,
          );
        }
        recordDebug("assistant_transcript_completed", {
          item_id: itemId,
          content_length: transcript.trim().length,
          content_preview: clipDebugText(transcript, 240),
        });
        if (itemId && transcript.trim())
          transcriptItemIdsRef.current.add(itemId);
        void syncTranscript("assistant", transcript);
        return;
      }
      if (type === "response.done") {
        const response = event.response as
          | {
              id?: string;
              metadata?: Record<string, unknown>;
              output?: unknown[];
              status?: string;
              status_details?: {
                error?: { message?: string };
                reason?: string;
              };
            }
          | undefined;
        const doneResponseId = response?.id || responseId;
        if (
          completionFlowRef.current &&
          doneResponseId &&
          !finalResponseIdRef.current
        ) {
          finalResponseIdRef.current = doneResponseId;
        }
        recordDebug("response_done", {
          response_id: doneResponseId || null,
          status: response?.status || null,
          output_types: Array.isArray(response?.output)
            ? response.output.map((item) =>
                item && typeof item === "object"
                  ? String((item as { type?: string }).type || "unknown")
                  : typeof item,
              )
            : [],
          status_reason: response?.status_details?.reason || null,
          error_message: response?.status_details?.error?.message || null,
        });
        if (
          response?.metadata?.purpose === "startup_greeting" ||
          (response?.id && response.id === initialResponseIdRef.current)
        ) {
          startupResponseActiveRef.current = false;
          unlockStartupMic();
        }
        if (response?.status === "failed") {
          stopSessionRef.current?.();
          setError(
            response.status_details?.error?.message ||
              response.status_details?.reason ||
              "Realtime voice response failed.",
          );
          setStatus("error");
          return;
        }
        const outputs = Array.isArray(response?.output) ? response.output : [];
        const calls = outputs.filter(
          (item): item is RealtimeFunctionCall =>
            !!item &&
            typeof item === "object" &&
            (item as { type?: string }).type === "function_call",
        );
        if (calls.length > 0) {
          void handleFunctionCalls(calls);
          return;
        }
        for (const item of outputs) {
          const message = item as {
            id?: string;
            type?: string;
            content?: Array<{ transcript?: string; text?: string }>;
          };
          if (
            message.type === "message" &&
            message.id &&
            !transcriptItemIdsRef.current.has(message.id)
          ) {
            const text = (message.content || [])
              .map((part) => part.transcript || part.text || "")
              .join(" ")
              .trim();
            if (text) {
              if (
                stopAfterNextAssistantRef.current ||
                completionFlowRef.current
              ) {
                finalAssistantTextLengthRef.current = Math.max(
                  finalAssistantTextLengthRef.current,
                  text.length,
                );
              }
              transcriptItemIdsRef.current.add(message.id);
              void syncTranscript("assistant", text);
            }
          }
        }
        if (stopAfterNextAssistantRef.current || completionFlowRef.current) {
          finalResponseDoneRef.current = true;
          if (
            !(finalAudioStartedRef.current && !finalAudioStoppedRef.current)
          ) {
            setStatus("finalizing");
          }
          scheduleCompletionFinish("response_done");
          return;
        }
        setStatus("connected");
        return;
      }
      if (type === "error") {
        const err = event.error as { message?: string } | undefined;
        const message = err?.message || "Realtime voice failed.";
        recordDebug("realtime_error_received", {
          message,
          recoverable: isRecoverableRealtimeError(message),
        });
        if (isRecoverableRealtimeError(message)) {
          setError("");
          setStatus("connected");
          return;
        }
        onLocalTranscriptRef.current(
          "assistant",
          "I hit a voice connection problem. You can keep going, or restart voice chat if the microphone stopped.",
        );
        stopSessionRef.current?.();
        setError(message);
        setStatus("error");
      }
    },
    [
      handleFunctionCalls,
      recordDebug,
      requestModelResponse,
      scheduleCompletionFinish,
      sendEvent,
      sendInitialResponseWhenReady,
      syncTranscript,
      unlockStartupMic,
    ],
  );

  const start = useCallback(
    async (
      language: string,
      conversation: IntakeMessage[],
      options: RealtimeStartOptions = {},
    ) => {
      const startId = startGenerationRef.current + 1;
      startGenerationRef.current = startId;
      const startCancelled = () =>
        stoppedRef.current || startGenerationRef.current !== startId;
      let ownedStream: MediaStream | null = null;
      let ownedPc: RTCPeerConnection | null = null;
      let ownedDc: RTCDataChannel | null = null;
      let ownedAudio: HTMLAudioElement | null = null;
      const cleanupOwnedStart = () => {
        ownedStream?.getTracks().forEach((track) => track.stop());
        if (streamRef.current === ownedStream) streamRef.current = null;
        ownedDc?.close();
        if (dcRef.current === ownedDc) dcRef.current = null;
        ownedPc?.close();
        if (pcRef.current === ownedPc) pcRef.current = null;
        if (ownedAudio) {
          ownedAudio.pause();
          ownedAudio.srcObject = null;
          ownedAudio.remove();
        }
        if (audioRef.current === ownedAudio) audioRef.current = null;
      };
      // Re-arm debug logging before any recordDebug() call so a prior
      // session that latched it off after a 404 doesn't suppress the very
      // first event of this new session.
      resetRealtimeDebugLogDisabled();
      recordDebug("voice_start_requested", {
        language,
        conversation_length: conversation.length,
        speak_initial_greeting: !!options.speakInitialGreeting,
        startup_mic_lock_ms: options.startupMicLockMs ?? 0,
      });
      if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
        recordDebug("voice_start_unsupported", {
          has_peer_connection: !!window.RTCPeerConnection,
          has_get_user_media: !!navigator.mediaDevices?.getUserMedia,
        });
        setError("Your browser does not support realtime voice.");
        setStatus("error");
        return;
      }

      // Defensive teardown: if a previous session left transport handles
      // around (e.g., a fatal-error path before stop() was reachable), close
      // them now before we allocate new ones to avoid mic + WebRTC leaks.
      teardownTransport();
      stoppedRef.current = false;
      transcriptItemIdsRef.current.clear();
      resetSessionState();
      setError("");
      clearLiveTranscript();
      setStatus("connecting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        ownedStream = stream;
        if (startCancelled()) {
          cleanupOwnedStart();
          recordDebug("voice_start_cancelled", {
            stage: "microphone_ready",
          });
          return;
        }
        streamRef.current = stream;
        recordDebug("microphone_stream_ready", {
          audio_track_count: stream.getAudioTracks().length,
        });
        const startupMicLockMs = Math.max(
          0,
          Math.min(8000, options?.startupMicLockMs ?? 0),
        );
        if (startupMicLockMs > 0) {
          startupMicLockedRef.current = true;
          setInputTracksEnabled(false);
          startupMicUnlockTimerRef.current = window.setTimeout(() => {
            if (startCancelled()) return;
            unlockStartupMic();
          }, startupMicLockMs);
        }

        recordDebug("client_secret_request_started", { language });
        const secret = await createRealtimeClientSecret(sessionId, language);
        if (startCancelled()) {
          cleanupOwnedStart();
          recordDebug("voice_start_cancelled", {
            stage: "client_secret_ready",
          });
          return;
        }
        sessionConfigRef.current = secret.session_config || null;
        recordDebug("client_secret_request_completed", {
          model: secret.model,
          client_session_id: secret.client_secret.session?.id,
          expires_at: secret.client_secret.expires_at,
          session_config: realtimeSessionSummary(sessionConfigRef.current),
        });
        const pc = new RTCPeerConnection();
        ownedPc = pc;
        pcRef.current = pc;

        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.setAttribute("playsinline", "true");
        ownedAudio = audio;
        audioRef.current = audio;
        document.body.appendChild(audio);

        pc.ontrack = (event) => {
          if (startCancelled()) return;
          recordDebug("remote_audio_track_received", {
            stream_count: event.streams.length,
          });
          audio.srcObject = event.streams[0];
          void audio
            .play()
            .then(() => {
              recordDebug("remote_audio_play_started");
            })
            .catch((err) => {
              recordDebug("remote_audio_play_failed", {
                error: debugErrorMessage(err),
              });
            });
        };
        pc.onconnectionstatechange = () => {
          if (startCancelled()) return;
          recordDebug("peer_connection_state_changed", {
            connection_state: pc.connectionState,
            ice_connection_state: pc.iceConnectionState,
          });
          // Only "failed" is terminal per the WebRTC spec — "disconnected"
          // is transient and frequently recovers, so tearing the session
          // down on it causes false-positive errors during brief network
          // blips.
          if (pc.connectionState === "failed") {
            stop();
            setError("Realtime voice connection was interrupted.");
            setStatus("error");
          }
        };

        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }

        const dc = pc.createDataChannel("oai-events");
        ownedDc = dc;
        dcRef.current = dc;
        dc.onopen = () => {
          if (startCancelled()) return;
          recordDebug("data_channel_opened", {
            conversation_length: conversation.length,
          });
          const introText =
            conversation
              .find((m) => m.role === "assistant" && m.content.trim())
              ?.content.trim() || "";
          const shouldSpeakInitialGreeting =
            !!options.speakInitialGreeting && !!introText;
          let skippedInitialGreeting = false;
          for (const message of conversation.filter(
            (m) => m.role !== "system",
          )) {
            if (
              shouldSpeakInitialGreeting &&
              !skippedInitialGreeting &&
              message.role === "assistant" &&
              message.content.trim() === introText
            ) {
              skippedInitialGreeting = true;
              continue;
            }
            const item = messageContent(message);
            if (item) {
              dc.send(
                JSON.stringify({ type: "conversation.item.create", item }),
              );
            }
          }
          recordDebug("conversation_history_preloaded", {
            message_count: conversation.length,
            skipped_initial_greeting: skippedInitialGreeting,
            will_speak_initial_greeting: shouldSpeakInitialGreeting,
          });
          if (shouldSpeakInitialGreeting) {
            initialGreetingTextRef.current = introText;
            initialResponseEventRef.current = {
              event_id: `startup_greeting_${Date.now()}`,
              type: "response.create",
              response: {
                output_modalities: ["audio"],
                instructions:
                  "The resident has just started voice mode. Speak the " +
                  "requested greeting aloud exactly once. Do not add new " +
                  "information, do not call tools, and do not wait for " +
                  "microphone input before speaking.",
                metadata: {
                  purpose: "startup_greeting",
                },
              },
            };
          }
          dataChannelOpenRef.current = true;
          sendInitialResponseWhenReady();
          window.setTimeout(() => {
            if (
              !startCancelled() &&
              !stoppedRef.current &&
              dataChannelOpenRef.current &&
              !sessionReadyRef.current &&
              !initialResponseSentRef.current &&
              !sessionCreatedRef.current &&
              !sessionUpdateSentRef.current
            ) {
              recordDebug("session_created_fallback_ready", {
                elapsed_ms: SESSION_READY_FALLBACK_MS,
              });
              sessionReadyRef.current = true;
              sendInitialResponseWhenReady();
            }
          }, SESSION_READY_FALLBACK_MS);
          if (!sessionReadyRef.current) {
            setStatus("connected");
          }
        };
        dc.onmessage = (message) => {
          if (startCancelled()) return;
          try {
            handleRealtimeEvent(JSON.parse(message.data));
          } catch (err) {
            recordDebug("data_channel_malformed_message", {
              error: debugErrorMessage(err),
            });
          }
        };
        dc.onclose = () => {
          if (startCancelled()) return;
          dataChannelOpenRef.current = false;
          recordDebug("data_channel_closed", {
            ready_state: dc.readyState,
          });
        };
        dc.onerror = () => {
          if (startCancelled()) return;
          recordDebug("data_channel_error", {
            ready_state: dc.readyState,
          });
          stop();
          setError("Realtime voice data channel failed.");
          setStatus("error");
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (startCancelled()) {
          cleanupOwnedStart();
          recordDebug("voice_start_cancelled", {
            stage: "offer_ready",
          });
          return;
        }

        const answer = await fetch(REALTIME_CALLS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret.client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });
        if (!answer.ok) {
          const answerText = await answer.text();
          recordDebug("realtime_call_failed", {
            status: answer.status,
            body: answerText,
          });
          throw new Error(answerText);
        }
        if (startCancelled()) {
          cleanupOwnedStart();
          recordDebug("voice_start_cancelled", {
            stage: "answer_ready",
          });
          return;
        }
        await pc.setRemoteDescription({
          type: "answer",
          sdp: await answer.text(),
        });
        if (startCancelled()) {
          cleanupOwnedStart();
          recordDebug("voice_start_cancelled", {
            stage: "remote_description_set",
          });
          return;
        }
        recordDebug("realtime_call_connected", {
          signaling_state: pc.signalingState,
        });
      } catch (err) {
        if (startCancelled()) {
          cleanupOwnedStart();
          recordDebug("voice_start_cancelled", {
            stage: "catch",
            error: debugErrorMessage(err),
          });
          return;
        }
        recordDebug("voice_start_failed", {
          error: debugErrorMessage(err),
        });
        stop();
        setError(startErrorMessage(err));
        setStatus("error");
      }
    },
    [
      clearLiveTranscript,
      handleRealtimeEvent,
      recordDebug,
      resetSessionState,
      sendInitialResponseWhenReady,
      sessionId,
      setInputTracksEnabled,
      stop,
      teardownTransport,
      unlockStartupMic,
    ],
  );

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    recordDebug("microphone_mute_toggled", { muted: next });
    isMutedRef.current = next;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next && !startupMicLockedRef.current;
    });
    setIsMuted(next);
  }, [isMuted, recordDebug]);

  return {
    status,
    error,
    isMuted,
    liveTranscript,
    liveTranscriptRole,
    isActive: status !== "idle" && status !== "error",
    start,
    stop,
    toggleMute,
  };
}
