/**
 * axios interceptor tests.
 *
 * Covers the session-expiry branching in the response error handler:
 *   - a real 401 → force logout
 *   - a timeout/network error with NO response → force logout only when the
 *     local session is already past its 2h window (the Render cold-start case
 *     that never gets a clean 401 back)
 *   - a timeout inside a still-valid session → left alone, so the calling page
 *     shows its own "save failed" message instead of dumping the user out
 *   - PIN endpoints → never trigger logout, since a wrong PIN is a different
 *     kind of 401
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the interceptor handlers as axios.create() registers them.
const handlers = { responseError: null };

vi.mock('axios', () => ({
  default: {
    create: () => ({
      defaults: { headers: { common: {} } },
      interceptors: {
        request:  { use: () => {} },
        response: { use: (_ok, err) => { handlers.responseError = err; } },
      },
    }),
  },
}));

vi.mock('./coldStart', () => ({
  markRequestStart: () => {},
  markRequestEnd:   () => {},
  nextRequestId:    () => 1,
}));

const SESSION_MS = 2 * 60 * 60 * 1000;

let originalLocation;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  originalLocation = window.location;
  delete window.location;
  window.location = { href: '' };
  await import('./axios');
});

afterEach(() => {
  window.location = originalLocation;
});

/** Runs the captured response-error interceptor, swallowing its rejection. */
async function fireError(error) {
  await handlers.responseError(error).catch(() => {});
}

describe('401 handling', () => {
  it('clears auth and redirects to login', async () => {
    localStorage.setItem('token', 'jwt-abc');

    await fireError({ config: { url: '/brands' }, response: { status: 401 } });

    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('leaves a notice explaining why the user was bounced', async () => {
    await fireError({ config: { url: '/brands' }, response: { status: 401 } });

    expect(sessionStorage.getItem('authNotice')).toMatch(/session expired/i);
  });

  it('always rejects so the caller still sees the failure', async () => {
    const err = { config: { url: '/brands' }, response: { status: 401 } };
    await expect(handlers.responseError(err)).rejects.toBe(err);
  });

  it('does not log out on a wrong PIN, which is a different kind of 401', async () => {
    localStorage.setItem('token', 'jwt-abc');

    await fireError({ config: { url: '/pin/verify' }, response: { status: 401 } });

    expect(localStorage.getItem('token')).toBe('jwt-abc');
    expect(window.location.href).toBe('');
  });

  it('ignores non-401 error responses', async () => {
    localStorage.setItem('token', 'jwt-abc');

    await fireError({ config: { url: '/brands' }, response: { status: 500 } });

    expect(localStorage.getItem('token')).toBe('jwt-abc');
    expect(window.location.href).toBe('');
  });
});

// A 401 from a credential check means "what you just typed is wrong", not
// "your session died". Redirecting used to hard-navigate the login page,
// destroying the error banner before anyone could read it — the reported
// "message flashes then the page refreshes" bug.
describe('401 handling — credential checks are not session expiry', () => {
  it('does not redirect when login rejects a wrong password', async () => {
    await fireError({ config: { url: '/auth/login' }, response: { status: 401 } });

    expect(window.location.href).toBe('');
  });

  it('leaves no "session expired" notice behind after a failed login', async () => {
    // Otherwise the login page reads the notice and shows a misleading
    // "Your session expired" instead of "Invalid username or password".
    await fireError({ config: { url: '/auth/login' }, response: { status: 401 } });

    expect(sessionStorage.getItem('authNotice')).toBeNull();
  });

  it('still rejects a failed login so the page can show its own message', async () => {
    const err = { config: { url: '/auth/login' }, response: { status: 401 } };
    await expect(handlers.responseError(err)).rejects.toBe(err);
  });

  it('keeps the user signed in when change-password rejects a wrong current password', async () => {
    localStorage.setItem('token', 'jwt-abc');

    await fireError({ config: { url: '/auth/change-password' }, response: { status: 401 } });

    expect(localStorage.getItem('token')).toBe('jwt-abc');
    expect(window.location.href).toBe('');
  });

  it('still logs out on a 401 from an ordinary endpoint', async () => {
    // Guards against widening the exemption too far — a genuinely expired
    // token must keep bouncing the user to login.
    localStorage.setItem('token', 'jwt-abc');

    await fireError({ config: { url: '/dispatches' }, response: { status: 401 } });

    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('does not log out when a login attempt times out with no response', async () => {
    // A cold-start timeout on the login request itself must not be mistaken
    // for an expired session — there is no session to expire yet.
    localStorage.setItem('loginTime', String(Date.now() - SESSION_MS - 1000));

    await fireError({ config: { url: '/auth/login' } });

    expect(window.location.href).toBe('');
  });
});

describe('timeout / network errors with no HTTP response', () => {
  it('logs out when the local session is already past its 2h window', async () => {
    // The Render cold-start case: the request burned the whole 60s budget and
    // aborted client-side, so there is no status code to key off.
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('loginTime', String(Date.now() - SESSION_MS - 1000));

    await fireError({ config: { url: '/brands' }, code: 'ECONNABORTED' });

    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('leaves a still-valid session alone — a hiccup is not an expiry', async () => {
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('loginTime', String(Date.now() - 60 * 1000));

    await fireError({ config: { url: '/brands' }, code: 'ECONNABORTED' });

    expect(localStorage.getItem('token')).toBe('jwt-abc');
    expect(window.location.href).toBe('');
  });

  it('does not log out when there is no recorded login at all', async () => {
    await fireError({ config: { url: '/brands' }, code: 'ERR_NETWORK' });

    expect(window.location.href).toBe('');
  });

  it('never logs out from a PIN endpoint timeout either', async () => {
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('loginTime', String(Date.now() - SESSION_MS - 1000));

    await fireError({ config: { url: '/pin/verify' }, code: 'ECONNABORTED' });

    expect(localStorage.getItem('token')).toBe('jwt-abc');
    expect(window.location.href).toBe('');
  });
});
