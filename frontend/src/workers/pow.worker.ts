/* ------------------------------------------------------------------ */
/*  Web Worker: solve the proof-of-work challenge off the main thread  */
/* ------------------------------------------------------------------ */

import { solvePow } from "../lib/pow";

interface PowRequest {
  nonce: string;
  difficulty: number;
}

// The app tsconfig has the DOM lib, not WebWorker; type only what is used.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<PowRequest>) => void) | null;
  postMessage: (message: { ok: true; counter: string } | { ok: false }) => void;
};

ctx.onmessage = (event) => {
  const { nonce, difficulty } = event.data;
  solvePow(nonce, difficulty)
    .then((counter) => ctx.postMessage({ ok: true, counter }))
    .catch(() => ctx.postMessage({ ok: false }));
};
