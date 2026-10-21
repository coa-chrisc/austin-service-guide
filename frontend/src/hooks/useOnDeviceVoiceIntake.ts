/* ------------------------------------------------------------------ */
/*  On-device voice intake: Web Speech recognition with                */
/*  processLocally = true (never a remote fallback) and local-only     */
/*  speechSynthesis voices. Audio never leaves the device: no          */
/*  getUserMedia, no MediaRecorder, no audio buffers. Transcripts are  */
/*  scrubbed with scrubPII before they are shown or handed on.         */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef, useState } from "react";
import { scrubPII, type PiiKind } from "@/lib/piiGuard";
import { pickLocalVoice, splitForSpeech } from "@/lib/speech";

/* ---- minimal Web Speech typings (TS lib.dom lacks these members) ---- */

type RecognitionAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SpeechRecognitionCtorLike {
  new (): SpeechRecognitionLike;
  readonly prototype: SpeechRecognitionLike;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<RecognitionAvailability>;
  install?: (options: { langs: string[] }) => Promise<boolean>;
}

/**
 * The recognition constructor, only when it supports on-device processing.
 * A browser without `available()` or `processLocally` could silently send
 * audio to a cloud recognizer, so it is treated as unsupported.
 */
function getOnDeviceRecognition(): SpeechRecognitionCtorLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtorLike;
    webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  };
  for (const ctor of [w.SpeechRecognition, w.webkitSpeechRecognition]) {
    if (
      ctor &&
      typeof ctor.available === "function" &&
      "processLocally" in ctor.prototype
    ) {
      return ctor;
    }
  }
  return null;
}

function getSynth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;
}

/** Voices load asynchronously in some browsers; wait briefly for them. */
function loadVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const synth = getSynth();
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(done, timeoutMs);
    synth.addEventListener("voiceschanged", done);
  });
}

/* ---- public types ---- */

export type OnDeviceAvailability =
  | "unknown"
  | "checking"
  | "unsupported"
  | RecognitionAvailability;

export type OnDeviceStatus =
  | "idle"
  | "installing"
  | "speaking"
  | "listening"
  | "processing"
  | "paused"
  | "error";

export interface SpokenSegment {
  text: string;
  /** BCP-47 tag used to pick an on-device voice. */
  lang: string;
}

export interface UtteranceOutcome {
  speech: SpokenSegment[];
  /** End the voice session after speaking (e.g. intake complete). */
  endSession?: boolean;
}

interface Options {
  /**
   * Called with the PII-scrubbed final transcript. Resolves to what should
   * be spoken back, or null to just listen again.
   */
  onUtterance: (
    text: string,
    kinds: PiiKind[],
  ) => Promise<UtteranceOutcome | null>;
}

const MESSAGES = {
  unsupported:
    "Private on-device voice isn't supported in this browser. Please type your message instead.",
  unavailable:
    "On-device speech recognition isn't available for this language on this device. Please type your message instead.",
  downloadable:
    "Voice needs a one-time speech pack download to this device. Your speech is then processed on this device only.",
  downloading:
    "The speech pack is downloading to this device. Try voice again in a moment, or type instead.",
  installing: "Downloading the speech pack to this device…",
  installFailed:
    "The speech pack couldn't be downloaded. Please type your message instead, or try again later.",
  noSpeech:
    "I didn't hear anything. Select Listen to try again, or type your message.",
  notAllowed:
    "Microphone access is blocked. Allow the microphone for this site in your browser settings, or type your message instead.",
  audioCapture:
    "No microphone was found. Connect a microphone, or type your message instead.",
  stopped:
    "Voice stopped unexpectedly. Please type your message instead, or try voice again.",
  paused: "Paused. Select Listen when you're ready.",
  noLocalVoice:
    "Spoken replies aren't available for this language on this device, so replies are shown as text only.",
} as const;

function availabilityMessage(a: OnDeviceAvailability): string {
  switch (a) {
    case "unsupported":
      return MESSAGES.unsupported;
    case "unavailable":
      return MESSAGES.unavailable;
    case "downloadable":
      return MESSAGES.downloadable;
    case "downloading":
      return MESSAGES.downloading;
    default:
      return "";
  }
}

export function useOnDeviceVoiceIntake({ onUtterance }: Options) {
  const [availability, setAvailability] =
    useState<OnDeviceAvailability>("unknown");
  const [status, setStatus] = useState<OnDeviceStatus>("idle");
  const [message, setMessage] = useState("");
  const [interim, setInterim] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [noLocalVoice, setNoLocalVoice] = useState(false);

  // Bumped by clear()/stopListening(); async work from an older
  // generation drops its result instead of touching state.
  const genRef = useRef(0);
  const sessionRef = useRef<{ lang: string } | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speakDoneRef = useRef<(() => void) | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  const listenRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  const abortRecognition = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    getSynth()?.cancel();
    speakDoneRef.current?.();
    speakDoneRef.current = null;
  }, []);

  const endSession = useCallback(() => {
    sessionRef.current = null;
    setSessionActive(false);
    abortRecognition();
    setInterim("");
  }, [abortRecognition]);

  const checkAvailability = useCallback(
    async (lang: string): Promise<OnDeviceAvailability> => {
      const ctor = getOnDeviceRecognition();
      if (!ctor?.available) {
        setAvailability("unsupported");
        setMessage(MESSAGES.unsupported);
        return "unsupported";
      }
      setAvailability("checking");
      let result: OnDeviceAvailability;
      try {
        result = await ctor.available({ langs: [lang], processLocally: true });
      } catch {
        result = "unavailable";
      }
      setAvailability(result);
      setMessage(availabilityMessage(result));
      return result;
    },
    [],
  );

  /** Must be called from a click handler (install needs a user gesture). */
  const install = useCallback(async (lang: string): Promise<boolean> => {
    const ctor = getOnDeviceRecognition();
    if (!ctor?.install) {
      setAvailability("unsupported");
      setMessage(MESSAGES.unsupported);
      return false;
    }
    let pending: Promise<boolean>;
    try {
      pending = ctor.install({ langs: [lang] });
    } catch {
      setMessage(MESSAGES.installFailed);
      return false;
    }
    setStatus("installing");
    setAvailability("downloading");
    setMessage(MESSAGES.installing);
    let ok = false;
    try {
      ok = await pending;
    } catch {
      ok = false;
    }
    setStatus("idle");
    setAvailability(ok ? "available" : "downloadable");
    setMessage(ok ? "" : MESSAGES.installFailed);
    return ok;
  }, []);

  /** Speak with on-device voices only; resolves when done or cancelled. */
  const speak = useCallback(
    async (segments: SpokenSegment[]): Promise<void> => {
      const synth = getSynth();
      const wanted = segments.filter((s) => s.text.trim());
      if (!synth || !wanted.length) return;
      const gen = genRef.current;
      const voices = await loadVoices();
      if (gen !== genRef.current) return; // cleared while voices loaded
      const utterances: SpeechSynthesisUtterance[] = [];
      let missing = false;
      for (const seg of wanted) {
        const voice = pickLocalVoice(voices, seg.lang);
        if (!voice) {
          missing = true;
          continue;
        }
        for (const chunk of splitForSpeech(seg.text)) {
          const u = new SpeechSynthesisUtterance(chunk);
          u.voice = voice;
          u.lang = voice.lang;
          utterances.push(u);
        }
      }
      setNoLocalVoice(missing);
      if (!utterances.length) return;

      cancelSpeech();
      setStatus("speaking");
      await new Promise<void>((resolve) => {
        let done = false;
        let poll = 0;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(pollStart);
          window.clearInterval(poll);
          if (speakDoneRef.current === finish) speakDoneRef.current = null;
          resolve();
        };
        speakDoneRef.current = finish;
        const last = utterances[utterances.length - 1];
        last.onend = finish;
        last.onerror = finish;
        // Some engines never fire onend; poll so the turn loop can't stall.
        const pollStart = window.setTimeout(() => {
          poll = window.setInterval(() => {
            if (!synth.speaking && !synth.pending) finish();
          }, 750);
        }, 1500);
        utterances.forEach((u) => synth.speak(u));
      });
      if (!sessionRef.current) setStatus("idle");
    },
    [cancelSpeech],
  );

  const handleRecognitionError = useCallback(
    (code: string) => {
      setInterim("");
      switch (code) {
        case "aborted":
        case "no-speech":
          setStatus("paused");
          setMessage(code === "no-speech" ? MESSAGES.noSpeech : MESSAGES.paused);
          return;
        case "not-allowed":
        case "service-not-allowed":
          endSession();
          setStatus("error");
          setMessage(MESSAGES.notAllowed);
          return;
        case "audio-capture":
          endSession();
          setStatus("error");
          setMessage(MESSAGES.audioCapture);
          return;
        case "language-not-supported": {
          const lang = sessionRef.current?.lang;
          endSession();
          setStatus("error");
          setAvailability("unavailable");
          setMessage(MESSAGES.unavailable);
          // The pack may simply be missing: re-check so "Download speech
          // pack" can be offered instead.
          if (lang) void checkAvailability(lang);
          return;
        }
        default:
          endSession();
          setStatus("error");
          setMessage(MESSAGES.stopped);
      }
    },
    [checkAvailability, endSession],
  );

  const processUtterance = useCallback(
    async (raw: string, gen: number) => {
      const { text, kinds } = scrubPII(raw);
      setInterim("");
      setStatus("processing");
      setMessage("");
      let outcome: UtteranceOutcome | null = null;
      try {
        outcome = await onUtteranceRef.current(text, kinds);
      } catch {
        outcome = null;
      }
      if (gen !== genRef.current) return;
      if (outcome?.speech.length) await speak(outcome.speech);
      if (gen !== genRef.current) return;
      if (outcome?.endSession) {
        endSession();
        setStatus("idle");
        return;
      }
      listenRef.current();
    },
    [endSession, speak],
  );

  const listen = useCallback(() => {
    const session = sessionRef.current;
    const ctor = getOnDeviceRecognition();
    if (!session || recRef.current) return;
    if (!ctor) {
      endSession();
      setStatus("error");
      setMessage(MESSAGES.unsupported);
      return;
    }
    const gen = genRef.current;
    const rec = new ctor();
    rec.lang = session.lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.processLocally = true;
    // Never start a recognizer that might fall back to a cloud service.
    if (rec.processLocally !== true) {
      endSession();
      setStatus("error");
      setMessage(MESSAGES.unsupported);
      return;
    }
    let finalText = "";
    let errored = false;
    rec.onresult = (ev) => {
      if (gen !== genRef.current) return;
      let live = "";
      finalText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const result = ev.results[i];
        const t = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += t;
        else live += t;
      }
      // Live text is scrubbed too: raw speech is never rendered.
      setInterim(scrubPII(`${finalText} ${live}`.trim()).text);
    };
    rec.onerror = (ev) => {
      if (gen !== genRef.current) return;
      errored = true;
      handleRecognitionError(ev.error);
    };
    rec.onend = () => {
      if (recRef.current === rec) recRef.current = null;
      if (gen !== genRef.current || errored) return;
      const raw = finalText.trim();
      finalText = "";
      if (!raw) {
        setInterim("");
        setStatus("paused");
        setMessage(MESSAGES.noSpeech);
        return;
      }
      void processUtterance(raw, gen);
    };
    recRef.current = rec;
    try {
      rec.start();
      setStatus("listening");
      setMessage("");
    } catch {
      recRef.current = null;
      endSession();
      setStatus("error");
      setMessage(MESSAGES.stopped);
    }
  }, [endSession, handleRecognitionError, processUtterance]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  /** Speak the opening, then listen in `lang`. Call after availability is "available". */
  const startSession = useCallback(
    async (lang: string, opening: SpokenSegment[]) => {
      abortRecognition();
      cancelSpeech();
      const gen = ++genRef.current;
      sessionRef.current = { lang };
      setSessionActive(true);
      setInterim("");
      setMessage("");
      setNoLocalVoice(false);
      await speak(opening);
      if (gen !== genRef.current) return;
      listen();
    },
    [abortRecognition, cancelSpeech, listen, speak],
  );

  /** Resume listening after a pause or no-speech. */
  const resume = useCallback(() => {
    if (!sessionRef.current) return;
    cancelSpeech();
    genRef.current += 1;
    listen();
  }, [cancelSpeech, listen]);

  /** Stop listening without sending anything; the session stays open. */
  const stopListening = useCallback(() => {
    genRef.current += 1;
    abortRecognition();
    cancelSpeech();
    setInterim("");
    if (sessionRef.current) {
      setStatus("paused");
      setMessage(MESSAGES.paused);
    }
  }, [abortRecognition, cancelSpeech]);

  /**
   * Clear voice session: abort recognition, cancel speech and reset voice
   * state. This hook never opens a MediaStream (the browser's recognizer
   * owns the microphone and releases it on abort), so there are no tracks
   * of its own to stop. Availability is kept so a retry is quick.
   */
  const clear = useCallback(() => {
    genRef.current += 1;
    sessionRef.current = null;
    abortRecognition();
    cancelSpeech();
    setSessionActive(false);
    setInterim("");
    setStatus("idle");
    setMessage("");
    setNoLocalVoice(false);
  }, [abortRecognition, cancelSpeech]);

  useEffect(() => {
    return () => {
      genRef.current += 1;
      sessionRef.current = null;
      abortRecognition();
      cancelSpeech();
    };
  }, [abortRecognition, cancelSpeech]);

  return {
    availability,
    status,
    /** Resident-facing status or error text ("" when nothing to say). */
    message,
    /** Scrubbed live transcript of the current utterance. */
    interim,
    isActive: sessionActive,
    /** No on-device voice for the session language: text-only replies. */
    noLocalVoice,
    noLocalVoiceMessage: MESSAGES.noLocalVoice,
    checkAvailability,
    install,
    startSession,
    resume,
    stopListening,
    speak,
    clear,
  };
}

export type OnDeviceVoiceIntake = ReturnType<typeof useOnDeviceVoiceIntake>;
