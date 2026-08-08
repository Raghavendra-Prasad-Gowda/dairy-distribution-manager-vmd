/**
 * session.js tests.
 *
 * Covers the shared session-expiry helpers used by both AuthContext (the
 * proactive 2h timer) and the axios interceptor (reactive 401 / timeout):
 * detecting a locally-expired session, clearing auth storage and leaving a
 * one-shot notice that survives the hard redirect to /login.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SESSION_MS,
  isLocalSessionExpired,
  expireSessionAndRedirect,
  consumeSessionNotice,
} from './session';

describe('SESSION_MS', () => {
  it('is 2 hours, matching the server JWT_EXPIRES_IN of 7200s', () => {
    expect(SESSION_MS).toBe(2 * 60 * 60 * 1000);
    expect(SESSION_MS / 1000).toBe(7200);
  });
});

describe('isLocalSessionExpired', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('is false when no loginTime has been recorded', () => {
    expect(isLocalSessionExpired()).toBe(false);
  });

  it('is false for a session that just started', () => {
    localStorage.setItem('loginTime', String(Date.now()));
    expect(isLocalSessionExpired()).toBe(false);
  });

  it('is false just inside the 2h window', () => {
    localStorage.setItem('loginTime', String(Date.now() - (SESSION_MS - 1000)));
    expect(isLocalSessionExpired()).toBe(false);
  });

  it('is true exactly at the 2h boundary', () => {
    localStorage.setItem('loginTime', String(Date.now() - SESSION_MS));
    expect(isLocalSessionExpired()).toBe(true);
  });

  it('is true well past the window', () => {
    localStorage.setItem('loginTime', String(Date.now() - SESSION_MS * 3));
    expect(isLocalSessionExpired()).toBe(true);
  });

  it('is false when loginTime is unparseable rather than treating it as expired', () => {
    // A junk value must not force a logout — Number() would give NaN, and the
    // guard returns early instead.
    localStorage.setItem('loginTime', 'not-a-number');
    expect(isLocalSessionExpired()).toBe(false);
  });
});

describe('expireSessionAndRedirect', () => {
  let originalLocation;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('clears token, user and loginTime from localStorage', () => {
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('user', '{"role":"salesman"}');
    localStorage.setItem('loginTime', '123');

    expireSessionAndRedirect('Session expired');

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('loginTime')).toBeNull();
  });

  it('hard-navigates to /login so in-memory state is fully torn down', () => {
    expireSessionAndRedirect('Session expired');
    expect(window.location.href).toBe('/login');
  });

  it('leaves the message where the login page can read it after the reload', () => {
    expireSessionAndRedirect('Your session expired. Please log in again.');
    expect(consumeSessionNotice()).toBe('Your session expired. Please log in again.');
  });

  it('still clears storage and redirects when sessionStorage throws', () => {
    // Private-browsing mode can make setItem throw; the logout must not be
    // blocked just because the notice could not be stored. Spy on the
    // sessionStorage instance only — jsdom shares Storage.prototype between
    // both storages, so patching the prototype would break localStorage too.
    localStorage.setItem('token', 'jwt-abc');
    const spy = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => expireSessionAndRedirect('Session expired')).not.toThrow();
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');

    spy.mockRestore();
  });
});

describe('consumeSessionNotice', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns null when no notice was left', () => {
    expect(consumeSessionNotice()).toBeNull();
  });

  it('is one-shot — a second read returns null', () => {
    sessionStorage.setItem('authNotice', 'Session expired');

    expect(consumeSessionNotice()).toBe('Session expired');
    expect(consumeSessionNotice()).toBeNull();
  });

  it('returns null instead of throwing when sessionStorage is unavailable', () => {
    const spy = vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(consumeSessionNotice()).toBeNull();

    spy.mockRestore();
  });
});
