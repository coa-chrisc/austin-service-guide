/* ------------------------------------------------------------------ */
/*  Proof-of-work solver (shared by lib/defense.ts and the Web Worker) */
/* ------------------------------------------------------------------ */

/*  Finds a decimal counter such that SHA-256(nonce + counter) starts with
    `difficulty` zero bits, matching backend/app/defense/challenge.py.
    Pure: no window, document or storage, so the worker can import it.   */

const encoder = new TextEncoder();

export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Hashes per batch: enough to keep WebCrypto busy, small enough to stay responsive. */
const BATCH = 256;

export async function solvePow(
  nonce: string,
  difficulty: number,
  maxCounter = 1 << 24,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto is unavailable");
  for (let start = 0; start < maxCounter; start += BATCH) {
    const counters = Array.from(
      { length: Math.min(BATCH, maxCounter - start) },
      (_, i) => start + i,
    );
    const digests = await Promise.all(
      counters.map((c) => subtle.digest("SHA-256", encoder.encode(`${nonce}${c}`))),
    );
    for (let i = 0; i < digests.length; i++) {
      if (leadingZeroBits(new Uint8Array(digests[i])) >= difficulty) {
        return String(counters[i]);
      }
    }
  }
  throw new Error("No proof-of-work solution in range");
}
