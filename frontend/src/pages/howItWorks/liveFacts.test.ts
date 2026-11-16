import { describe, expect, it } from "vitest";
import type { AboutInfo } from "@/lib/api";
import { factsFor } from "./LiveFacts";

const ABOUT: AboutInfo = {
  app_name: "Metro Test Guide",
  live_ai: false,
  text_model: "model-x",
  reasoning_effort: "medium",
  plan_reasoning_effort: "low",
  max_tool_iterations: 6,
  tools: ["search_services", "complete_intake"],
  voice: { mode: "intercepted_text", raw_audio_allowed: false, realtime_model: null },
  pii_kinds: ["email", "phone", "new_kind"],
  limits: { intake_body_bytes: 262144, state_messages: 200, message_chars: 10000, new_message_chars: 4000 },
  catalog: { services_total: 12, services_verified: null, categories: 3, local_crisis_lines: 1 },
  admin: { auth: "shared_token", catalog_writes_persist: false },
  access_gate: true,
};

describe("How it works live facts", () => {
  it("says the scripted flow is active and no model is called when live AI is off", () => {
    const facts = factsFor("summary", ABOUT).join(" ");
    expect(facts).toContain("Metro Test Guide");
    expect(facts).toContain("scripted question flow is active and no AI model is called");
    expect(facts).not.toContain("model-x");
  });

  it("shows the model, both efforts, the round cap and the tools from /about when live AI is on", () => {
    const facts = factsFor("ai-model", { ...ABOUT, live_ai: true }).join(" ");
    expect(facts).toContain("Text model: model-x, reasoning effort medium");
    expect(facts).toContain("Plan ordering: reasoning effort low");
    expect(facts).toContain("Up to 6 tool rounds");
    expect(facts).toContain("search_services, complete_intake");
  });

  it("names the realtime model only in raw-audio mode", () => {
    const raw: AboutInfo = {
      ...ABOUT,
      live_ai: true,
      voice: { mode: "realtime_audio", raw_audio_allowed: true, realtime_model: "rt-1" },
    };
    expect(factsFor("ai-model", raw).join(" ")).toContain("raw audio streamed to the OpenAI Realtime API (model rt-1)");
    expect(factsFor("ai-model", ABOUT).join(" ")).toContain("only text is sent");
  });

  it("lists every redaction kind, falling back to the key for an unknown kind", () => {
    expect(factsFor("pii", ABOUT)).toEqual(["Email addresses", "US phone numbers", "new_kind"]);
  });

  it("reports counts, and an unrecorded verification count plainly", () => {
    expect(factsFor("grounding", ABOUT).join(" ")).toContain("Services listed: 12 in 3 categories");
    expect(factsFor("grounding", ABOUT).join(" ")).toContain("recorded staff check: not recorded");
    expect(factsFor("stateless", ABOUT).join(" ")).toContain("256 KiB");
    expect(factsFor("stateless", ABOUT).join(" ")).toContain("New message: up to 4,000 characters");    expect(factsFor("crisis", ABOUT).join(" ")).toContain("Local crisis lines in this data pack: 1");
  });

  it("has no facts for a section without live values", () => {
    expect(factsFor("consistency", ABOUT)).toEqual([]);
  });
});
