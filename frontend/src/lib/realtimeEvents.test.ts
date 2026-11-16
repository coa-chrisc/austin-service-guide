import { describe, expect, it } from "vitest";
import {
  isFatalRealtimeError,
  runnableFunctionCalls,
  sessionUpdatePayload,
  STARTUP_GREETING_PURPOSE,
  startupGreetingResponse,
} from "./realtimeEvents";

const call = (name: string, status?: string) => ({
  type: "function_call",
  name,
  call_id: `call_${name}`,
  arguments: "{}",
  ...(status ? { status } : {}),
});

describe("isFatalRealtimeError", () => {
  it("ends the session only when the session itself is gone", () => {
    expect(
      isFatalRealtimeError({
        type: "invalid_request_error",
        code: "session_expired",
        message: "Your session hit the maximum duration of 60 minutes.",
      }),
    ).toBe(true);
    expect(
      isFatalRealtimeError({
        type: "invalid_request_error",
        code: "invalid_api_key",
      }),
    ).toBe(true);
    expect(isFatalRealtimeError({ type: "authentication_error" })).toBe(true);
  });

  it("keeps the session for request-level and server errors", () => {
    expect(
      isFatalRealtimeError({
        type: "invalid_request_error",
        code: "conversation_already_has_active_response",
        message: "Conversation already has an active response in progress.",
      }),
    ).toBe(false);
    expect(
      isFatalRealtimeError({
        type: "invalid_request_error",
        code: "item_not_found",
        event_id: "drop_input_item_3",
      }),
    ).toBe(false);
    expect(
      isFatalRealtimeError({ type: "server_error", message: "Internal error" }),
    ).toBe(false);
    expect(isFatalRealtimeError({ message: "Something unexpected" })).toBe(
      false,
    );
    expect(isFatalRealtimeError(undefined)).toBe(false);
  });
});

describe("runnableFunctionCalls", () => {
  it("runs the function calls of a completed response", () => {
    const calls = runnableFunctionCalls({
      status: "completed",
      output: [
        { type: "message" },
        call("extract_profile"),
        call("wait_for_user"),
      ],
    });
    expect(calls.map((c) => c.name)).toEqual([
      "extract_profile",
      "wait_for_user",
    ]);
  });

  it("runs nothing from a cancelled response", () => {
    expect(
      runnableFunctionCalls({
        status: "cancelled",
        output: [call("complete_intake", "completed")],
      }),
    ).toEqual([]);
  });

  it("runs only finished calls from an incomplete response", () => {
    const calls = runnableFunctionCalls({
      status: "incomplete",
      output: [
        call("extract_profile", "completed"),
        call("search_services", "incomplete"),
        call("set_language"),
      ],
    });
    expect(calls.map((c) => c.name)).toEqual(["extract_profile"]);
  });

  it("tolerates a missing or malformed output", () => {
    expect(runnableFunctionCalls(undefined)).toEqual([]);
    expect(runnableFunctionCalls({ status: "completed" })).toEqual([]);
    expect(
      runnableFunctionCalls({ status: "completed", output: [null, "x", 3] }),
    ).toEqual([]);
  });
});

describe("sessionUpdatePayload", () => {
  it("drops model, which session.update cannot change", () => {
    const config = {
      type: "realtime",
      model: "gpt-realtime-2.1",
      instructions: "Be brief.",
      audio: { output: { voice: "marin" } },
    };
    const payload = sessionUpdatePayload(config);
    expect(payload).toEqual({
      type: "realtime",
      instructions: "Be brief.",
      audio: { output: { voice: "marin" } },
    });
    expect("model" in payload).toBe(false);
    // The stored config keeps its model for the debug summary.
    expect(config.model).toBe("gpt-realtime-2.1");
  });
});

describe("startupGreetingResponse", () => {
  it("passes the server greeting through, tagged as the startup greeting", () => {
    const server = {
      output_modalities: ["audio"],
      instructions: "Say this greeting aloud exactly once, in Spanish.",
      tool_choice: "none",
      input: [{ type: "message", role: "user", content: [] }],
    };
    expect(startupGreetingResponse(server)).toEqual({
      ...server,
      metadata: { purpose: STARTUP_GREETING_PURPOSE },
    });
  });

  it("keeps the tag even if the server sent other metadata", () => {
    const out = startupGreetingResponse({ metadata: { purpose: "x", a: "b" } });
    expect(out?.metadata).toEqual({ purpose: "startup_greeting", a: "b" });
  });

  it("returns null when there is no greeting to speak", () => {
    expect(startupGreetingResponse(undefined)).toBeNull();
    expect(startupGreetingResponse(null)).toBeNull();
  });
});
