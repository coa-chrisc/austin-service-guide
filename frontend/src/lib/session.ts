/* ------------------------------------------------------------------ */
/*  Active intake session — single source of truth                     */
/* ------------------------------------------------------------------ */
/*  We treat the session URL as the resident's "account": once an      */
/*  intake produces results, we remember the session id locally so     */
/*  every page in the app can offer a 1-tap path back to "my plan".    */

const ACTIVE_KEY = "asg.activeSession";

export function getActiveSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveSession(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, sessionId);
  } catch {
    /* storage disabled — best effort */
  }
}

export function clearActiveSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
