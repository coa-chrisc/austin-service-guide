/* ------------------------------------------------------------------ */
/*  Device token for ungated deployments (backend/app/defense/)        */
/* ------------------------------------------------------------------ */

/*  Before the first AI request (chat, voice, plan, share) the browser asks
    GET /api/v1/defense/challenge. Behind the access-code gate the answer is
    {"provider": "none"} and nothing else happens. On a public deployment
    it is a proof-of-work puzzle: solved in a Web Worker (a second or two),
    then POST /api/v1/defense/token sets the HttpOnly `csg_dev` cookie for
    24 hours. The directory, map and service pages never call this.

    Failure is soft: ensureDeviceToken never throws. The AI request goes
    out anyway; if the server answers 403 challenge_required, api.ts calls
    ensureDeviceToken(true) and retries once.

    sessionStorage holds only a timestamp (when to check again), never the
    token: the cookie is HttpOnly.                                         */

import { solvePow } from "./pow";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";
const READY_KEY = "csg_defense_ready_until";
/** Check again this long before the cookie expires. */
const RENEW_MARGIN_MS = 5 * 60 * 1000;
/** With no challenge (gated or off), check again after this long. */
const NO_CHALLENGE_RECHECK_MS = 60 * 60 * 1000;
const WORKER_TIMEOUT_MS = 30_000;

export type DefenseStatus = "idle" | "working" | "ready" | "failed";

interface PowChallenge {
  provider: "pow";
  nonce: string;
  difficulty: number;
  expires_at: number;
  sig: string;
  token_ttl_seconds: number;
}

type Challenge = { provider: "none" } | PowChallenge;

const listeners = new Set<(status: DefenseStatus) => void>();
let inFlight: Promise<void> | null = null;

/** Subscribe to token status (for an optional "Getting the assistant ready" hint). */
export function onDefenseStatus(listener: (status: DefenseStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(status: DefenseStatus) {
  for (const listener of listeners) listener(status);
}

function readyUntil(): number {
  try {
    return Number(globalThis.sessionStorage?.getItem(READY_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function markReady(untilMs: number) {
  try {
    globalThis.sessionStorage?.setItem(READY_KEY, String(untilMs));
  } catch {
    // Storage blocked: we just check again next time.
  }
}

function solveInWorker(nonce: string, difficulty: number): Promise<string> {
  if (typeof Worker === "undefined") return solvePow(nonce, difficulty);
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/pow.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      solvePow(nonce, difficulty).then(resolve, reject);
      return;
    }
    const done = () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error("Proof of work timed out"));
    }, WORKER_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; counter?: string }>) => {
      done();
      if (event.data.ok && event.data.counter) resolve(event.data.counter);
      else reject(new Error("Proof of work failed"));
    };
    worker.onerror = () => {
      // Worker blocked (CSP, old browser): solve on the main thread instead.
      done();
      solvePow(nonce, difficulty).then(resolve, reject);
    };
    worker.postMessage({ nonce, difficulty });
  });
}

async function obtainToken(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/defense/challenge`, { method: "GET" });
  if (!res.ok) throw new Error(`challenge ${res.status}`);
  const challenge = (await res.json()) as Challenge;
  if (challenge.provider !== "pow") {
    markReady(Date.now() + NO_CHALLENGE_RECHECK_MS);
    return;
  }
  emit("working");
  const counter = await solveInWorker(challenge.nonce, challenge.difficulty);
  const tokenRes = await fetch(`${BASE_URL}/api/v1/defense/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonce: challenge.nonce,
      difficulty: challenge.difficulty,
      expires_at: challenge.expires_at,
      sig: challenge.sig,
      counter,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
  markReady(Date.now() + Math.max(0, challenge.token_ttl_seconds * 1000 - RENEW_MARGIN_MS));
}

/**
 * Make sure this browser has a device token (or that none is needed).
 * Concurrent callers share one attempt. Never throws.
 */
export function ensureDeviceToken(force = false): Promise<void> {
  if (!force && readyUntil() > Date.now()) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = obtainToken()
    .then(() => emit("ready"))
    .catch(() => {
      markReady(0);
      emit("failed");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
