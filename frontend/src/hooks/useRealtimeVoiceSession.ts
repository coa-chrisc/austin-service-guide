import { useCallback, useRef, useState } from "react";
import {
  createRealtimeClientSecret,
  executeRealtimeTool,
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
  | "error";

interface UseRealtimeVoiceSessionOptions {
  sessionId: string;
  onTranscriptSync: (result: RealtimeTranscriptResult) => void;
  onToolResult: (result: RealtimeToolResult) => void;
}

interface RealtimeFunctionCall {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

const REALTIME_URL = "https://api.openai.com/v1/realtime";

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

export function useRealtimeVoiceSession({
  sessionId,
  onTranscriptSync,
  onToolResult,
}: UseRealtimeVoiceSessionOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);
  const transcriptItemIdsRef = useRef<Set<string>>(new Set());
  const stopAfterNextAssistantRef = useRef(false);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(event));
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    stopAfterNextAssistantRef.current = false;
    setLiveTranscript("");
    setIsMuted(false);
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
    setStatus("idle");
  }, []);

  const syncTranscript = useCallback(
    async (role: "user" | "assistant", content: string) => {
      const text = content.trim();
      if (!text || stoppedRef.current) return;
      try {
        const result = await syncRealtimeTranscript(sessionId, { role, content: text });
        onTranscriptSync(result);
        if (role === "assistant" && stopAfterNextAssistantRef.current) {
          window.setTimeout(stop, 500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sync transcript.");
        setStatus("error");
      }
    },
    [onTranscriptSync, sessionId, stop],
  );

  const handleFunctionCalls = useCallback(
    async (calls: RealtimeFunctionCall[]) => {
      for (const call of calls) {
        try {
          const result = await executeRealtimeTool(sessionId, {
            name: call.name,
            arguments: parseArguments(call.arguments),
            call_id: call.call_id,
          });
          onToolResult(result);
          if (result.is_complete) {
            stopAfterNextAssistantRef.current = true;
          }
          sendEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: call.call_id,
              output: result.output,
            },
          });
        } catch (err) {
          sendEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify({
                error: err instanceof Error ? err.message : "Tool execution failed.",
              }),
            },
          });
        }
      }
      sendEvent({ type: "response.create" });
    },
    [onToolResult, sendEvent, sessionId],
  );

  const handleRealtimeEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = String(event.type || "");
      if (type === "session.created" || type === "session.updated") {
        setStatus("connected");
        return;
      }
      if (type === "input_audio_buffer.speech_started") {
        setStatus("listening");
        setLiveTranscript("");
        return;
      }
      if (type === "input_audio_buffer.speech_stopped") {
        setStatus("thinking");
        return;
      }
      if (type === "response.created") {
        setStatus("thinking");
        return;
      }
      if (type === "response.output_audio.delta") {
        setStatus("speaking");
        return;
      }
      if (
        type === "conversation.item.input_audio_transcription.delta" ||
        type === "response.output_audio_transcript.delta"
      ) {
        const delta = String(event.delta || "");
        if (delta) setLiveTranscript((prev) => `${prev}${delta}`);
        return;
      }
      if (type === "conversation.item.input_audio_transcription.completed") {
        const itemId = String(event.item_id || "");
        const transcript = String(event.transcript || "");
        if (itemId) transcriptItemIdsRef.current.add(itemId);
        void syncTranscript("user", transcript);
        setLiveTranscript("");
        return;
      }
      if (
        type === "response.output_audio_transcript.done" ||
        type === "response.audio_transcript.done"
      ) {
        const itemId = String(event.item_id || "");
        const transcript = String(event.transcript || "");
        if (itemId) transcriptItemIdsRef.current.add(itemId);
        void syncTranscript("assistant", transcript);
        setLiveTranscript("");
        return;
      }
      if (type === "response.done") {
        const response = event.response as { output?: unknown[] } | undefined;
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
              transcriptItemIdsRef.current.add(message.id);
              void syncTranscript("assistant", text);
            }
          }
        }
        setStatus("connected");
        return;
      }
      if (type === "error") {
        const err = event.error as { message?: string } | undefined;
        setError(err?.message || "Realtime voice failed.");
        setStatus("error");
      }
    },
    [handleFunctionCalls, syncTranscript],
  );

  const start = useCallback(
    async (
      language: string,
      conversation: IntakeMessage[],
      languageLabel = language,
    ) => {
      if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
        setError("Your browser does not support realtime voice.");
        setStatus("error");
        return;
      }

      stoppedRef.current = false;
      transcriptItemIdsRef.current.clear();
      stopAfterNextAssistantRef.current = false;
      setError("");
      setLiveTranscript("");
      setStatus("connecting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const secret = await createRealtimeClientSecret(sessionId, language);
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        const audio = document.createElement("audio");
        audio.autoplay = true;
        audioRef.current = audio;
        document.body.appendChild(audio);

        pc.ontrack = (event) => {
          audio.srcObject = event.streams[0];
          void audio.play().catch(() => undefined);
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setStatus("error");
            setError("Realtime voice connection was interrupted.");
          }
        };

        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onopen = () => {
          for (const message of conversation.filter((m) => m.role !== "system")) {
            const item = messageContent(message);
            if (item) {
              dc.send(JSON.stringify({ type: "conversation.item.create", item }));
            }
          }
          dc.send(
            JSON.stringify({
              type: "response.create",
              response: {
                output_modalities: ["audio"],
                instructions:
                  `The resident just tapped the microphone to start voice mode. ` +
                  `Greet them briefly in ${languageLabel} (${language}), mention ` +
                  `they can speak naturally, and ask what they need help with. ` +
                  `If there is already conversation history, acknowledge you can ` +
                  `continue from where they left off.`,
              },
            }),
          );
          setStatus("connected");
        };
        dc.onmessage = (message) => {
          try {
            handleRealtimeEvent(JSON.parse(message.data));
          } catch {
            /* Ignore malformed data-channel events. */
          }
        };
        dc.onerror = () => {
          setStatus("error");
          setError("Realtime voice data channel failed.");
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const answer = await fetch(
          `${REALTIME_URL}?model=${encodeURIComponent(secret.model)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secret.client_secret.value}`,
              "Content-Type": "application/sdp",
            },
            body: offer.sdp,
          },
        );
        if (!answer.ok) {
          throw new Error(await answer.text());
        }
        await pc.setRemoteDescription({
          type: "answer",
          sdp: await answer.text(),
        });
      } catch (err) {
        stop();
        setError(err instanceof Error ? err.message : "Could not start voice chat.");
        setStatus("error");
      }
    },
    [handleRealtimeEvent, sessionId, stop],
  );

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsMuted(next);
  }, [isMuted]);

  return {
    status,
    error,
    isMuted,
    liveTranscript,
    isActive: status !== "idle" && status !== "error",
    start,
    stop,
    toggleMute,
  };
}
