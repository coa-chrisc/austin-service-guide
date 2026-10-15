// Staff-entered admin token for catalog writes. Kept in sessionStorage only
// (cleared when the tab closes) and never baked into the build.
const KEY = "asg-admin-token";

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable; token simply isn't remembered
  }
}
