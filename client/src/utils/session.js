// Shared session-expiry logic — lives outside AuthContext so the plain axios
// module (not a React component) can use it too, without a circular import
// (AuthContext already imports axios; axios must not import AuthContext back).

export const SESSION_MS = 2 * 60 * 60 * 1000; // 2 hours — matches server JWT_EXPIRES_IN

const NOTICE_KEY = 'authNotice';

/**
 * True once the locally-recorded login has passed SESSION_MS, based purely
 * on the client's own clock and the 'loginTime' timestamp set at login —
 * no server round-trip. This is a UX signal only; the server's own
 * jwt.verify() is always the real authority on whether a token is valid.
 *
 * Used to tell apart two different failure shapes on a network/timeout
 * error (which carries no HTTP response, so no status code to inspect):
 *   - the local session is already past its 2h window → almost certainly
 *     the token expired and the request just never got a clean 401 back
 *     (e.g. a Render free-tier cold start ate the whole 60s timeout budget)
 *   - the local session is still within its window → a plain connectivity
 *     hiccup, not a session problem — don't force a logout for that.
 */
export function isLocalSessionExpired() {
  const loginTime = Number(localStorage.getItem('loginTime'));
  if (!loginTime) return false;
  return Date.now() - loginTime >= SESSION_MS;
}

/**
 * Clears auth storage, leaves a one-shot notice for the login page to show,
 * and hard-navigates there. Used by both the proactive 2h timer
 * (AuthContext) and the reactive 401/timeout handling (axios interceptor)
 * so the two paths can never drift out of sync with each other.
 *
 * A hard `window.location.href` navigation is used deliberately (not
 * react-router) — it guarantees every bit of in-memory app state (including
 * whatever unsaved form the user was mid-edit on) is fully torn down, so a
 * stale expired session can never linger in memory after this point. The
 * notice is stashed in sessionStorage (not shown via a toast right here)
 * specifically because it needs to survive that full page reload.
 */
export function expireSessionAndRedirect(message) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch { /* storage unavailable (e.g. private mode) — redirect still proceeds */ }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('loginTime');
  window.location.href = '/login';
}

/** Reads and clears the one-shot notice left by expireSessionAndRedirect(). */
export function consumeSessionNotice() {
  try {
    const msg = sessionStorage.getItem(NOTICE_KEY);
    if (msg) sessionStorage.removeItem(NOTICE_KEY);
    return msg;
  } catch {
    return null;
  }
}
