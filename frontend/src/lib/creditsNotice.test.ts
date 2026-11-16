import { describe, expect, it } from "vitest";
import { creditsNotice } from "./creditsNotice";

const TEXT =
  "The AI assistant has used up its testing credits for now. Please ask your contact to load more credits.";

describe("creditsNotice", () => {
  it("returns the server's text, as written, when the AI is out of credits", () => {
    expect(creditsNotice({ degraded: "ai_credits", degraded_notice: TEXT })).toBe(TEXT);
    expect(creditsNotice({ degraded: "ai_credits", degraded_notice: `  ${TEXT}\n` })).toBe(TEXT);
  });

  it("shows nothing for the other degraded reasons", () => {
    for (const degraded of ["ai_budget", "disabled", "voice_budget", null, undefined]) {
      expect(creditsNotice({ degraded, degraded_notice: TEXT })).toBeNull();
    }
  });

  it("shows nothing without a response or without text", () => {
    expect(creditsNotice(null)).toBeNull();
    expect(creditsNotice(undefined)).toBeNull();
    expect(creditsNotice({ degraded: "ai_credits" })).toBeNull();
    expect(creditsNotice({ degraded: "ai_credits", degraded_notice: "   " })).toBeNull();
  });
});
