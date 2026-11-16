import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntakeMessage } from "@/types";
import {
  REALTIME_GREETING_MIC_LOCK_MS,
  languageAfterToolResult,
  realtimeStartOptions,
  startRealtimeVoice,
} from "./voiceStart";

const msg = (role: IntakeMessage["role"], content: string) =>
  ({ role, content }) as IntakeMessage;

const greetingOnly = [msg("assistant", "Welcome! I use AI from OpenAI...")];

describe("realtimeStartOptions", () => {
  it("lets the model greet on the first start of a fresh intake", () => {
    expect(realtimeStartOptions(greetingOnly, false)).toEqual({
      speakInitialGreeting: true,
      startupMicLockMs: REALTIME_GREETING_MIC_LOCK_MS,
    });
  });

  it("does not replay the greeting on a retry after a drop", () => {
    expect(realtimeStartOptions(greetingOnly, true)).toEqual({
      speakInitialGreeting: false,
      startupMicLockMs: 0,
    });
  });

  it("does not greet once the resident has spoken or typed", () => {
    const messages = [...greetingOnly, msg("user", "I need help with rent")];
    expect(realtimeStartOptions(messages, false)).toEqual({
      speakInitialGreeting: false,
      startupMicLockMs: 0,
    });
  });
});

describe("startRealtimeVoice", () => {
  const speak = vi.fn();
  const Utterance = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    speak.mockReset();
    Utterance.mockReset();
  });

  it("opens the session without any on-device speech, first start and retry", () => {
    const start = vi.fn();
    let greeted = false;
    const onStartupGreeting = () => {
      greeted = true;
    };

    startRealtimeVoice({
      realtime: { start },
      language: "es",
      messages: greetingOnly,
      alreadyGreeted: greeted,
      onStartupGreeting,
    });
    // The session reports the greeting started; then the connection drops.
    start.mock.calls[0][2].onStartupGreeting();
    startRealtimeVoice({
      realtime: { start },
      language: "es",
      messages: greetingOnly,
      alreadyGreeted: greeted,
      onStartupGreeting,
    });

    expect(speak).not.toHaveBeenCalled();
    expect(Utterance).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(2);
    // The browser's UI language is the starting language.
    expect(start.mock.calls[0][0]).toBe("es");
    expect(start.mock.calls[0][2]).toMatchObject({
      speakInitialGreeting: true,
      startupMicLockMs: REALTIME_GREETING_MIC_LOCK_MS,
    });
    expect(start.mock.calls[1][2]).toMatchObject({
      speakInitialGreeting: false,
      startupMicLockMs: 0,
    });
  });
});

describe("languageAfterToolResult", () => {
  it("follows a set_language switch", () => {
    expect(languageAfterToolResult("es", "en")).toBe("es");
    expect(languageAfterToolResult("VI", "en")).toBe("vi");
  });

  it("keeps the UI language when nothing changed", () => {
    expect(languageAfterToolResult("en", "en")).toBeNull();
    expect(languageAfterToolResult("es", "ES")).toBeNull();
    expect(languageAfterToolResult(undefined, "en")).toBeNull();
    expect(languageAfterToolResult("", "es")).toBeNull();
  });
});
