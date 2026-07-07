/**
 * Persists the email awaiting an OTP so the code screen survives a full page
 * reload — on mobile the browser tab is often discarded while the user is in
 * their email app reading the code, and we must not drop them back to a blank
 * form when they return. Keyed per purpose so email confirmation and the
 * sign-in code don't clobber each other.
 */
const TTL_MS = 20 * 60 * 1000;
const KEYS = {
  verify: 'foundry.pendingVerify.v1',
  login: 'foundry.pendingLogin.v1',
} as const;

type PendingPurpose = keyof typeof KEYS;

function setPending(purpose: PendingPurpose, email: string): void {
  try {
    localStorage.setItem(KEYS[purpose], JSON.stringify({ email, ts: Date.now() }));
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

function getPending(purpose: PendingPurpose): string | null {
  try {
    const raw = localStorage.getItem(KEYS[purpose]);
    if (!raw) return null;
    const { email, ts } = JSON.parse(raw) as { email?: string; ts?: number };
    if (!email || !ts || Date.now() - ts > TTL_MS) {
      localStorage.removeItem(KEYS[purpose]);
      return null;
    }
    return email;
  } catch {
    return null;
  }
}

function clearPending(purpose: PendingPurpose): void {
  try {
    localStorage.removeItem(KEYS[purpose]);
  } catch {
    /* non-fatal */
  }
}

export const setPendingVerification = (email: string) => setPending('verify', email);
export const getPendingVerification = () => getPending('verify');
export const clearPendingVerification = () => clearPending('verify');

export const setPendingLogin = (email: string) => setPending('login', email);
export const getPendingLogin = () => getPending('login');
export const clearPendingLogin = () => clearPending('login');
