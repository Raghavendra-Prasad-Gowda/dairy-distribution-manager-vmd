/**
 * Cold-start tracker. Render's free tier puts the server to sleep after
 * 15 minutes of inactivity; the first request after a cold period takes
 * ~30-50 seconds to wake it. This tracker exposes a tiny pub-sub so the
 * UI can show a friendly "server is waking up" screen once any request
 * crosses the 2-second mark.
 *
 * Usage:
 *   markRequestStart(reqId)   axios request interceptor
 *   markRequestEnd(reqId)     axios response + error interceptor
 *   subscribe(fn)             React hook subscribes; fn(isWaking) is called on change
 */

const SLOW_THRESHOLD_MS = 2000;

const timers   = new Map();         // reqId → setTimeout handle
const slowSet  = new Set();         // reqIds that crossed the threshold
let   listeners = new Set();
let   isWaking  = false;
let   armed     = false;            // only trigger the wake-up screen when armed

function notify() {
  const next = armed && slowSet.size > 0;
  if (next === isWaking) return;
  isWaking = next;
  for (const fn of listeners) {
    try { fn(isWaking); } catch (_) { /* listener crash shouldn't break interceptor */ }
  }
  // Once the wake-up screen has gone away, automatically disarm so that
  // ordinary slow requests later in the session don't trigger it again.
  if (!next && armed) armed = false;
}

export function markRequestStart(reqId) {
  const handle = setTimeout(() => {
    timers.delete(reqId);
    slowSet.add(reqId);
    notify();
  }, SLOW_THRESHOLD_MS);
  timers.set(reqId, handle);
}

export function markRequestEnd(reqId) {
  const handle = timers.get(reqId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(reqId);
  }
  if (slowSet.has(reqId)) {
    slowSet.delete(reqId);
    notify();
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  // Push current state immediately so subscribers don't miss an in-flight wake.
  try { fn(isWaking); } catch (_) {}
  return () => { listeners.delete(fn); };
}

/**
 * Arm the wake-up screen for the next slow request. Used only by Login
 * — Render's free tier sleeps after 15 min, so the first request after
 * a long break can take 30-50s. Once the screen hides (request done or
 * never reached the 2s threshold) it auto-disarms.
 */
export function armForLogin() {
  armed = true;
}

let nextId = 0;
export function nextRequestId() {
  nextId += 1;
  return nextId;
}
