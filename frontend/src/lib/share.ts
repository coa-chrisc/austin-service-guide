// Tiny helper around the Web Share API.
//
// On phones (and desktop Safari/Edge) navigator.share opens the OS share
// sheet so the user picks how — text, email, save to Notes, AirDrop, etc.
// On browsers without it (older Firefox, most desktop Chromium), we fall
// back to a caller-supplied dialog opener (the existing SMS/email modal).

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export type ShareResult =
  | { kind: "shared" }
  | { kind: "cancelled" }
  | { kind: "unsupported" }
  | { kind: "error"; error: unknown };

export function canNativeShare(): boolean {
  if (typeof navigator === "undefined") return false;
  // Some browsers expose share() but reject everything except files; the
  // canShare guard catches that case when available.
  if (typeof navigator.share !== "function") return false;
  return true;
}

export async function nativeShare(payload: SharePayload): Promise<ShareResult> {
  if (!canNativeShare()) return { kind: "unsupported" };

  if (
    typeof navigator.canShare === "function" &&
    !navigator.canShare(payload)
  ) {
    return { kind: "unsupported" };
  }

  try {
    await navigator.share(payload);
    return { kind: "shared" };
  } catch (err) {
    // AbortError = user dismissed the share sheet. Treat as cancelled,
    // not an error, so we don't show a failure toast.
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name: string }).name === "AbortError"
    ) {
      return { kind: "cancelled" };
    }
    return { kind: "error", error: err };
  }
}
