import { describe, expect, it } from "vitest";
import { VOICE_I18N, makeVoiceT, type VoiceStringKey } from "./voiceI18n";

const KEYS = Object.keys(VOICE_I18N.en) as VoiceStringKey[];

describe("voice UI strings", () => {
  it("cover every selector language with every key", () => {
    for (const code of ["en", "es", "zh", "hi", "ar", "vi", "fr", "ko"]) {
      const dict = VOICE_I18N[code];
      expect(dict, code).toBeDefined();
      for (const key of KEYS) expect(dict[key]?.trim(), `${code}.${key}`).toBeTruthy();
    }
  });

  it("say the resident can speak their own language", () => {
    expect(makeVoiceT("en")("any_language_hint")).toBe(
      "Speak in your own language. The guide will switch automatically.",
    );
    expect(makeVoiceT("es-US")("any_language_hint")).toContain("su propio idioma");
  });

  it("fall back to English for other languages", () => {
    expect(makeVoiceT("ru")("consent_agree")).toBe("I agree, start voice");
    expect(makeVoiceT(undefined)("voice_title")).toBe("Voice assistant");
  });
});
