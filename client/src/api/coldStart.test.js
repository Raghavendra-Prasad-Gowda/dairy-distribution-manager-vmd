/**
 * coldStart — the Render free-tier "server is waking up" tracker.
 *
 * Module-level state (timers, the slow-request set, listeners, armed/
 * isWaking flags, the id counter) is shared across the whole app, so each
 * test re-imports the module fresh via vi.resetModules() rather than
 * fighting shared mutable state between cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return import('./coldStart.js');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('coldStart — nextRequestId', () => {
  it('increments on every call, starting from 1', async () => {
    const { nextRequestId } = await freshModule();
    expect(nextRequestId()).toBe(1);
    expect(nextRequestId()).toBe(2);
    expect(nextRequestId()).toBe(3);
  });
});

describe('coldStart — fast requests never trigger the wake-up screen', () => {
  it('a request that ends before the 2s threshold never marks isWaking', async () => {
    const { markRequestStart, markRequestEnd, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const fn = vi.fn();
    subscribe(fn);
    fn.mockClear(); // ignore the immediate push-on-subscribe call

    markRequestStart(1);
    vi.advanceTimersByTime(1000); // under threshold
    markRequestEnd(1);
    vi.advanceTimersByTime(5000); // the (now-cleared) timer must not still fire

    expect(fn).not.toHaveBeenCalled();
  });
});

describe('coldStart — armed slow requests trigger the wake-up screen', () => {
  it('crossing the 2s threshold while armed notifies listeners with true', async () => {
    const { markRequestStart, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const fn = vi.fn();
    subscribe(fn);
    fn.mockClear();

    markRequestStart(1);
    vi.advanceTimersByTime(2000);

    expect(fn).toHaveBeenCalledWith(true);
  });

  it('a slow request while NOT armed never notifies (isWaking stays false)', async () => {
    const { markRequestStart, subscribe } = await freshModule();
    // No armForLogin() call — ordinary slow requests must not show the screen.
    const fn = vi.fn();
    subscribe(fn);
    fn.mockClear();

    markRequestStart(1);
    vi.advanceTimersByTime(2000);

    expect(fn).not.toHaveBeenCalled();
  });

  it('ending the slow request notifies false and auto-disarms', async () => {
    const { markRequestStart, markRequestEnd, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const fn = vi.fn();
    subscribe(fn);

    markRequestStart(1);
    vi.advanceTimersByTime(2000);
    fn.mockClear();

    markRequestEnd(1);
    expect(fn).toHaveBeenCalledWith(false);

    // Auto-disarmed: a second slow request (no new armForLogin()) must not
    // re-trigger the screen.
    fn.mockClear();
    markRequestStart(2);
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple concurrent slow requests only flip isWaking false once the last one ends', async () => {
    const { markRequestStart, markRequestEnd, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const fn = vi.fn();
    subscribe(fn);

    markRequestStart(1);
    markRequestStart(2);
    vi.advanceTimersByTime(2000);
    fn.mockClear();

    markRequestEnd(1); // one of two still slow — isWaking must stay true
    expect(fn).not.toHaveBeenCalled();

    markRequestEnd(2); // last one — now it flips
    expect(fn).toHaveBeenCalledWith(false);
  });

  it('ending a request that never crossed the threshold does not notify', async () => {
    const { markRequestStart, markRequestEnd, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const fn = vi.fn();
    subscribe(fn);
    fn.mockClear();

    markRequestStart(1);
    vi.advanceTimersByTime(500);
    markRequestEnd(1); // clears the pending timer before it ever fires
    vi.advanceTimersByTime(5000);

    expect(fn).not.toHaveBeenCalled();
  });

  it('markRequestEnd for an unknown/already-ended id is a safe no-op', async () => {
    const { markRequestEnd, subscribe } = await freshModule();
    const fn = vi.fn();
    subscribe(fn);
    fn.mockClear();

    expect(() => markRequestEnd(999)).not.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('coldStart — subscribe / unsubscribe', () => {
  it('pushes the current isWaking state immediately on subscribe', async () => {
    const { markRequestStart, subscribe, armForLogin } = await freshModule();
    armForLogin();
    markRequestStart(1);
    vi.advanceTimersByTime(2000); // isWaking is now true, before anyone subscribes

    const fn = vi.fn();
    subscribe(fn);
    expect(fn).toHaveBeenCalledWith(true);
  });

  it('the returned unsubscribe function stops further notifications', async () => {
    const { markRequestStart, markRequestEnd, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const fn = vi.fn();
    const unsubscribe = subscribe(fn);
    fn.mockClear();

    unsubscribe();
    markRequestStart(1);
    vi.advanceTimersByTime(2000);
    markRequestEnd(1);

    expect(fn).not.toHaveBeenCalled();
  });

  it('a listener that throws does not break notification of other listeners', async () => {
    const { markRequestStart, subscribe, armForLogin } = await freshModule();
    armForLogin();
    const throwing = vi.fn(() => { throw new Error('boom'); });
    const healthy  = vi.fn();
    subscribe(throwing);
    subscribe(healthy);
    throwing.mockClear();
    healthy.mockClear();

    expect(() => {
      markRequestStart(1);
      vi.advanceTimersByTime(2000);
    }).not.toThrow();
    expect(healthy).toHaveBeenCalledWith(true);
  });

  it('a subscriber whose immediate push-call throws does not break subscribe()', async () => {
    const { subscribe } = await freshModule();
    const throwing = vi.fn(() => { throw new Error('boom'); });
    expect(() => subscribe(throwing)).not.toThrow();
  });
});
