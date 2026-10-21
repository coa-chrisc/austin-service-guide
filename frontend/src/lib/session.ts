/* ------------------------------------------------------------------ */
/*  Client-held intake state (sessionStorage only)                     */
/* ------------------------------------------------------------------ */
/*  The server keeps no intake sessions. The browser holds the          */
/*  (server-redacted) conversation, profile, matches and plan in        */
/*  sessionStorage — never localStorage — so it disappears when the     */
/*  tab closes, and "Start over" wipes it immediately. Every intake     */
/*  request sends this state and saves the copy the server returns.     */

import type { IntakeState } from "@/types";

const KEY_PREFIX = "asg.intake.";
const STATE_KEY = `${KEY_PREFIX}state`;
// Pre-stateless builds kept a results-link id in localStorage.
const LEGACY_LOCAL_KEY = "asg.activeSession";

/** Fired on window whenever the stored intake state is saved or cleared. */
export const INTAKE_STATE_EVENT = "asg:intake-state";

let epoch = 0;
let queue: Promise<unknown> = Promise.resolve();
let planPromise: { epoch: number; promise: Promise<IntakeState> } | null = null;

function notify(): void {
  window.dispatchEvent(new Event(INTAKE_STATE_EVENT));
}

export function loadIntakeState(): IntakeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntakeState;
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveIntakeState(state: IntakeState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled or full — the in-memory UI still works this tab */
  }
  notify();
}

/** Remove every intake key and drop any response still in flight. */
export function clearIntakeState(): void {
  if (typeof window === "undefined") return;
  epoch += 1;
  planPromise = null;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
    window.localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Replace the stored state with a brand-new intake's state. */
export function startNewIntakeState(state: IntakeState): void {
  clearIntakeState();
  saveIntakeState(state);
}

/** An intake the resident has started but not finished. */
export function isIntakeInProgress(state = loadIntakeState()): boolean {
  return (
    !!state &&
    state.status === "in_progress" &&
    state.conversation.some((m) => m.role === "user")
  );
}

/** A finished intake with matches to show on /results. */
export function hasCompletedPlan(state = loadIntakeState()): boolean {
  return (
    !!state &&
    state.status === "completed" &&
    state.matched_service_ids.length > 0
  );
}

/**
 * Run one state-changing intake request. Requests are serialized so each
 * one sends the latest saved state; the returned state is saved unless the
 * intake was cleared (or replaced) while the request was in flight.
 */
export function withIntakeState<T extends { state: IntakeState }>(
  request: (state: IntakeState) => Promise<T>,
): Promise<T> {
  const run = queue.then(async () => {
    const startEpoch = epoch;
    const state = loadIntakeState();
    if (!state) throw new Error("No intake in progress.");
    const result = await request(state);
    if (epoch === startEpoch) saveIntakeState(result.state);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Make sure the completed intake has a plan, building it at most once per
 * intake. Resolves with the state that holds the plan.
 */
export function ensureIntakePlan(
  build: (state: IntakeState) => Promise<{ state: IntakeState }>,
): Promise<IntakeState> {
  const current = loadIntakeState();
  if (current?.plan) return Promise.resolve(current);
  if (planPromise && planPromise.epoch === epoch) return planPromise.promise;
  const entry = {
    epoch,
    promise: withIntakeState(build).then((res) => res.state),
  };
  entry.promise.catch(() => {
    if (planPromise === entry) planPromise = null;
  });
  planPromise = entry;
  return entry.promise;
}
