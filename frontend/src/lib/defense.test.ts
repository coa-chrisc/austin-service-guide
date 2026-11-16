import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, RateLimitedError, sendIntakeMessage, startIntake } from "./api";
import { ensureDeviceToken } from "./defense";
import { leadingZeroBits, solvePow } from "./pow";
import type { IntakeState } from "@/types";

const state = {} as IntakeState;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("proof of work", () => {
  it("counts leading zero bits like the backend", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0xff]))).toBe(16);
    expect(leadingZeroBits(new Uint8Array([0, 0x10]))).toBe(11);
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0, 0]))).toBe(16);
  });

  it("finds a counter the server will accept", async () => {
    const nonce = "test-nonce-123";
    const counter = await solvePow(nonce, 10);
    expect(counter).toMatch(/^[0-9]{1,16}$/);
    const digest = createHash("sha256").update(`${nonce}${counter}`).digest();
    expect(leadingZeroBits(new Uint8Array(digest))).toBeGreaterThanOrEqual(10);
  });
});

describe("api errors and the device token", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a 429 to RateLimitedError with retryAfter and policy", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { provider: "none" }))
      .mockResolvedValueOnce(
        json(
          429,
          {
            detail: "You're sending messages quickly. Try again in 42 seconds.",
            code: "rate_limited",
            policy: "intake_message",
            retry_after: 42,
          },
          { "Retry-After": "42" },
        ),
      );
    const err = await sendIntakeMessage(state, "hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err).toBeInstanceOf(ApiError);
    const limited = err as RateLimitedError;
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe(42);
    expect(limited.policy).toBe("intake_message");
    expect(limited.message).toContain("42 seconds");
  });

  it("keeps plain errors as ApiError", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { provider: "none" }))
      .mockResolvedValueOnce(json(503, { detail: "Voice is unavailable.", code: "voice_unavailable" }));
    const err = (await sendIntakeMessage(state, "hi").catch((e: unknown) => e)) as ApiError;
    expect(err).not.toBeInstanceOf(RateLimitedError);
    expect(err.code).toBe("voice_unavailable");
  });

  it("asks for the challenge once per session behind the gate", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/defense/challenge") ? json(200, { provider: "none" }) : json(200, { state }),
    );
    await startIntake();
    await sendIntakeMessage(state, "hi");
    const challengeCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/defense/challenge"));
    expect(challengeCalls).toHaveLength(1);
  });

  it("solves the challenge, gets a token, and retries once on challenge_required", async () => {
    const calls: string[] = [];
    let messageCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (url.endsWith("/defense/challenge")) {
        return json(200, {
          provider: "pow",
          nonce: "abcdefgh",
          difficulty: 4,
          expires_at: 9_999_999_999,
          sig: "signature",
          token_ttl_seconds: 86400,
        });
      }
      if (url.endsWith("/defense/token")) {
        const sent = JSON.parse(String(init?.body));
        expect(sent.counter).toMatch(/^[0-9]+$/);
        return json(204, null);
      }
      messageCalls += 1;
      return messageCalls === 1
        ? json(403, { detail: "Turn on the assistant.", code: "challenge_required", policy: "share" })
        : json(200, { state });
    });
    await sendIntakeMessage(state, "hi");
    expect(messageCalls).toBe(2);
    expect(calls.filter((u) => u.endsWith("/defense/token"))).toHaveLength(2);
  });

  it("never throws when the challenge endpoint fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(ensureDeviceToken(true)).resolves.toBeUndefined();
  });
});
