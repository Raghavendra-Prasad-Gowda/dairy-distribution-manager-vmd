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
const handlers = { responseError: null, responseOk: null, requestOk: null, requestError: null };

vi.mock('axios', () => ({
  default: {
    create: () => ({
      defaults: { headers: { common: {} } },
      interceptors: {
        request:  { use: (ok, err) => { handlers.requestOk = ok; handlers.requestError = err; } },
        response: { use: (ok, err) => { handlers.responseOk = ok; handlers.responseError = err; } },
      },
    }),
  },
}));

const coldStart = {
  markRequestStart: vi.fn(),
  markRequestEnd:   vi.fn(),
  nextRequestId:    vi.fn(() => 1),
};
vi.mock('./coldStart', () => coldStart);

const SESSION_MS = 2 * 60 * 60 * 1000;

let originalLocation;

beforeEach(async () => {
  vi.resetModules();
  coldStart.markRequestStart.mockClear();
  coldStart.markRequestEnd.mockClear();
  coldStart.nextRequestId.mockClear();
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

describe('response error handler — cold-start tracking cleanup', () => {
  it('stops tracking the failed request when it carried a cold-start id', async () => {
    await fireError({ config: { url: '/brands', __reqId: 9 }, response: { status: 500 } });
    expect(coldStart.markRequestEnd).toHaveBeenCalledWith(9);
  });
});

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

// A 401 from mid-MFA (wrong code, or the short-lived mfaToken expiring
// because the user stepped away) is also a validation result, not a dead
// session — there is no session yet to have expired. Bouncing to login used
// to destroy the MFA screen's own error ("Invalid authentication code" /
// "MFA session expired. Please log in again.") and replace it with a
// generic "Your session expired", which also threw away the in-progress
// mfaToken/QR code the user needed to retry.
describe('401 handling — MFA steps are not session expiry', () => {
  it('does not redirect on a wrong MFA verify code', async () => {
    await fireError({ config: { url: '/auth/mfa/verify' }, response: { status: 401 } });

    expect(window.location.href).toBe('');
  });

  it('does not redirect when the setup-required mfaToken has expired', async () => {
    await fireError({ config: { url: '/auth/mfa/setup-required' }, response: { status: 401 } });

    expect(window.location.href).toBe('');
  });

  it('does not redirect on a wrong forced-enrollment confirm code', async () => {
    await fireError({ config: { url: '/auth/mfa/confirm-required' }, response: { status: 401 } });

    expect(window.location.href).toBe('');
  });

  it('leaves no "session expired" notice behind after a wrong MFA code', async () => {
    await fireError({ config: { url: '/auth/mfa/verify' }, response: { status: 401 } });

    expect(sessionStorage.getItem('authNotice')).toBeNull();
  });

  it('still rejects the error so the MFA screen can show its own message', async () => {
    const err = { config: { url: '/auth/mfa/verify' }, response: { status: 401 } };
    await expect(handlers.responseError(err)).rejects.toBe(err);
  });
});

describe('missing VITE_API_BASE_URL warning', () => {
  it('logs an error when unset outside dev mode', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('DEV', false);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();

    await import('./axios');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('VITE_API_BASE_URL is not set'));

    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe('request interceptor', () => {
  it('attaches the Bearer token when one is stored', () => {
    localStorage.setItem('token', 'jwt-abc');
    const config = handlers.requestOk({ headers: {} });
    expect(config.headers['Authorization']).toBe('Bearer jwt-abc');
  });

  it('omits the Authorization header when there is no token', () => {
    const config = handlers.requestOk({ headers: {} });
    expect(config.headers['Authorization']).toBeUndefined();
  });

  it('tags every request with a cold-start id and starts tracking it', () => {
    coldStart.nextRequestId.mockReturnValue(42);
    const config = handlers.requestOk({ headers: {} });
    expect(config.__reqId).toBe(42);
    expect(coldStart.markRequestStart).toHaveBeenCalledWith(42);
  });

  it('rejects on a request-building error without swallowing it', async () => {
    const err = new Error('bad config');
    await expect(handlers.requestError(err)).rejects.toBe(err);
  });
});

describe('response success handler', () => {
  it('stops cold-start tracking for the completed request and returns it unchanged', () => {
    const response = { config: { __reqId: 7 }, data: { ok: true } };
    const result = handlers.responseOk(response);
    expect(coldStart.markRequestEnd).toHaveBeenCalledWith(7);
    expect(result).toBe(response);
  });

  it('does not call markRequestEnd when the response has no tracked id', () => {
    const response = { config: {}, data: {} };
    handlers.responseOk(response);
    expect(coldStart.markRequestEnd).not.toHaveBeenCalled();
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
