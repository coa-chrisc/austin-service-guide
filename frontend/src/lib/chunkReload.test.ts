import { describe, expect, it, vi } from "vitest";
import { ChunkLoadError, importWithReload, type ReloadEnv } from "./chunkReload";

function fakeEnv(overrides: Partial<ReloadEnv> = {}) {
  let stored: number | null = null;
  const env: ReloadEnv = {
    online: () => true,
    now: () => 1_000_000,
    lastReloadAt: () => stored,
    markReload: (at) => {
      stored = at;
      return true;
    },
    clearReload: () => {
      stored = null;
    },
    reload: vi.fn(),
    ...overrides,
  };
  return { env, stored: () => stored, setStored: (v: number | null) => (stored = v) };
}

const failing = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));

/** Resolves true if the promise settles within a few ticks. */
async function settles(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return settled;
}

describe("importWithReload", () => {
  it("returns the module and clears an earlier reload mark", async () => {
    const { env, setStored, stored } = fakeEnv();
    setStored(123);
    const mod = { default: "page" };
    await expect(importWithReload(() => Promise.resolve(mod), env)).resolves.toBe(mod);
    expect(stored()).toBeNull();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("reloads the page once on the first failure and stays pending", async () => {
    const { env, stored } = fakeEnv();
    const pending = importWithReload(failing, env);
    expect(await settles(pending)).toBe(false);
    expect(env.reload).toHaveBeenCalledTimes(1);
    expect(stored()).toBe(1_000_000);
  });

  it("throws ChunkLoadError instead of reloading again right after a reload", async () => {
    const { env, setStored } = fakeEnv();
    setStored(1_000_000 - 5_000);
    await expect(importWithReload(failing, env)).rejects.toBeInstanceOf(ChunkLoadError);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("reloads again when the earlier mark is stale", async () => {
    const { env, setStored } = fakeEnv();
    setStored(1_000_000 - 60 * 60 * 1000);
    expect(await settles(importWithReload(failing, env))).toBe(false);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload while offline", async () => {
    const { env } = fakeEnv({ online: () => false });
    await expect(importWithReload(failing, env)).rejects.toBeInstanceOf(ChunkLoadError);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("does not reload when the mark cannot be stored (no reload loop)", async () => {
    const { env } = fakeEnv({ markReload: () => false });
    await expect(importWithReload(failing, env)).rejects.toBeInstanceOf(ChunkLoadError);
    expect(env.reload).not.toHaveBeenCalled();
  });
});
