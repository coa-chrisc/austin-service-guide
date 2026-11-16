/**
 * Pure decisions about OpenAI Realtime events, kept out of
 * `useRealtimeVoiceSession` so they can be unit tested.
 */

/** The `error` object of a Realtime `error` server event. */
export interface RealtimeErrorDetail {
  type?: string;
  code?: string | null;
  message?: string;
  /** The client event_id that caused the error, when the client set one. */
  event_id?: string | null;
}

export interface RealtimeFunctionCall {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
  status?: string;
}

/** The parts of a `response.done` response that decide what runs next. */
export interface RealtimeResponseDone {
  status?: string;
  output?: unknown[];
}

// Errors that mean the Realtime session can no longer be used, so keeping the
// connection open cannot help. Everything else (a rejected request, a busy
// response, a transient server error) is logged and the session carries on.
const FATAL_ERROR_CODES = new Set(["session_expired", "invalid_api_key"]);
const FATAL_ERROR_TYPES = new Set(["authentication_error"]);

export function isFatalRealtimeError(
  error: RealtimeErrorDetail | undefined,
): boolean {
  if (!error) return false;
  return (
    FATAL_ERROR_CODES.has(String(error.code || "")) ||
    FATAL_ERROR_TYPES.has(String(error.type || ""))
  );
}

/**
 * Function calls from a finished response that are safe to execute. A
 * cancelled response runs none. An incomplete one (token limit or content
 * filter) runs only calls whose own item finished, so a call cut off
 * mid-arguments never runs with partial input.
 */
export function runnableFunctionCalls(
  response: RealtimeResponseDone | undefined,
): RealtimeFunctionCall[] {
  if (!response || response.status === "cancelled") return [];
  const outputs = Array.isArray(response.output) ? response.output : [];
  return outputs.filter(
    (item): item is RealtimeFunctionCall =>
      !!item &&
      typeof item === "object" &&
      (item as { type?: string }).type === "function_call" &&
      (response.status !== "incomplete" ||
        (item as { status?: string }).status === "completed"),
  );
}

/**
 * The session config as a `session.update` payload. The API updates every
 * field except `model` (and `voice` once audio has played), so `model`, which
 * was already set when the client secret was minted, is left out.
 */
export function sessionUpdatePayload(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...config };
  delete payload.model;
  return payload;
}
