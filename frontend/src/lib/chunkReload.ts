/* ------------------------------------------------------------------ */
/*  Lazy route chunks that survive a deploy                            */
/* ------------------------------------------------------------------ */
/*  After a deploy the old hashed chunks are gone, so a tab opened      */
/*  before it gets a 404 on its next lazy page. The first failure       */
/*  reloads the page once (the intake state is in sessionStorage, so    */
/*  nothing is lost); a second failure within RELOAD_WINDOW_MS, or one  */
/*  while offline, throws ChunkLoadError for ChunkErrorBoundary to show */
/*  a "try again" panel. The mark is never cleared on success: nested   */
/*  lazy chunks (layout, then page) would otherwise reload forever.     */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_KEY = "asg.chunkReloadAt";
/** A reload mark older than this no longer blocks a new reload. */
const RELOAD_WINDOW_MS = 10 * 60 * 1000;

export class ChunkLoadError extends Error {
  readonly original: unknown;
  constructor(original: unknown) {
    super("A page of the app failed to load.");
    this.name = "ChunkLoadError";
    this.original = original;
  }
}

export interface ReloadEnv {
  online(): boolean;
  now(): number;
  lastReloadAt(): number | null;
  /** Store the reload mark; false when storage is blocked. */
  markReload(at: number): boolean;
  reload(): void;
}

const browserEnv: ReloadEnv = {
  online: () => navigator.onLine !== false,
  now: () => Date.now(),
  lastReloadAt: () => {
    try {
      const raw = window.sessionStorage.getItem(RELOAD_KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  },
  markReload: (at) => {
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(at));
      return true;
    } catch {
      return false;
    }
  },
  reload: () => window.location.reload(),
};

export function importWithReload<T>(
  factory: () => Promise<T>,
  env: ReloadEnv = browserEnv,
): Promise<T> {
  return factory().catch((error: unknown) => {
      const now = env.now();
      const last = env.lastReloadAt();
      const recent = last !== null && now - last < RELOAD_WINDOW_MS;
      // Without a stored mark a reload could loop, so only reload when it sticks.
      if (env.online() && !recent && env.markReload(now)) {
        env.reload();
        // The page is going away; keep the Suspense fallback up until it does.
        return new Promise<T>(() => undefined);
      }
      throw new ChunkLoadError(error);
  });
}

/** React.lazy with a one-time page reload when the chunk fails to load. */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithReload(factory));
}
