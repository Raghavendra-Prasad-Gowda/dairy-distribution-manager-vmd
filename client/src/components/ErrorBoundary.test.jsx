/**
 * ErrorBoundary tests.
 *
 * Covers the stale-chunk auto-reload guard: one automatic reload per trip
 * through the guard, no infinite loop when a second failure hits before it
 * re-arms, and — the actual fix here — the guard re-arming after the app has
 * run cleanly for a few seconds, so a tab that already used its one-shot
 * reload for an earlier deploy still self-heals for a later, unrelated one
 * instead of reporting every subsequent stale-chunk hit as a crash.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: { post: vi.fn().mockResolvedValue({}) },
}));

const REARM_DELAY_MS = 5000;

function Bomb({ message = 'Unexpected crash' }) {
  throw new Error(message);
}

function ChunkBomb() {
  throw new Error('Failed to fetch dynamically imported module: /assets/Foo-abc123.js');
}

let originalLocation;
let originalConsoleError;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  originalLocation = window.location;
  delete window.location;
  window.location = { href: '', pathname: '/salesman/my-statement', reload: vi.fn() };
  // React logs the caught error via console.error — the test components throw
  // on purpose, so silence the expected noise rather than let it clutter output.
  originalConsoleError = console.error;
  console.error = vi.fn();
});

afterEach(() => {
  window.location = originalLocation;
  console.error = originalConsoleError;
  vi.useRealTimers();
});

describe('ErrorBoundary — normal rendering', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>All good</p></ErrorBoundary>);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});

describe('ErrorBoundary — stale chunk errors', () => {
  it('auto-reloads once, without reporting a crash', () => {
    render(<ErrorBoundary><ChunkBomb /></ErrorBoundary>);

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('chunk-reload')).toBe('1');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('recognizes the "not a valid JavaScript MIME type" variant as a chunk error too', () => {
    function MimeBomb() { throw new Error('foo is not a valid JavaScript MIME type'); }
    render(<ErrorBoundary><MimeBomb /></ErrorBoundary>);

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does not auto-reload again before the guard re-arms', () => {
    // Simulates an earlier auto-reload already having fired in this tab.
    sessionStorage.setItem('chunk-reload', '1');
    render(<ErrorBoundary><ChunkBomb /></ErrorBoundary>);

    expect(window.location.reload).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/errors/client', expect.objectContaining({
      message: expect.stringContaining('Failed to fetch dynamically imported module'),
    }));
  });

  it('re-arms the guard once the app has run cleanly past the rearm delay', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('chunk-reload', '1');
    render(<ErrorBoundary><p>Freshly reloaded page</p></ErrorBoundary>);

    expect(sessionStorage.getItem('chunk-reload')).toBe('1'); // still armed right after mount
    vi.advanceTimersByTime(REARM_DELAY_MS);
    expect(sessionStorage.getItem('chunk-reload')).toBeNull(); // re-armed
  });

  it('does not re-arm before the delay elapses', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('chunk-reload', '1');
    render(<ErrorBoundary><p>Just loaded</p></ErrorBoundary>);

    vi.advanceTimersByTime(REARM_DELAY_MS - 1);
    expect(sessionStorage.getItem('chunk-reload')).toBe('1');
  });

  it('a later, unrelated stale-chunk hit gets its own auto-reload once re-armed', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('chunk-reload', '1');
    const { unmount } = render(<ErrorBoundary><p>Loaded after first reload</p></ErrorBoundary>);
    vi.advanceTimersByTime(REARM_DELAY_MS);
    unmount();

    // A second, later deploy causes a fresh stale-chunk hit in the same tab.
    render(<ErrorBoundary><ChunkBomb /></ErrorBoundary>);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('clears the rearm timer on unmount so it cannot fire after teardown', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('chunk-reload', '1');
    const { unmount } = render(<ErrorBoundary><p>Loaded</p></ErrorBoundary>);
    unmount();

    vi.advanceTimersByTime(REARM_DELAY_MS);
    expect(sessionStorage.getItem('chunk-reload')).toBe('1'); // never cleared — boundary was gone
  });
});

describe('ErrorBoundary — non-chunk errors', () => {
  it('shows the fallback UI and reports the crash, leaving the reload guard alone', () => {
    render(<ErrorBoundary><Bomb message="Something broke" /></ErrorBoundary>);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('chunk-reload')).toBeNull();
    expect(api.post).toHaveBeenCalledWith('/errors/client', expect.objectContaining({
      message: 'Something broke',
      page:    expect.any(String),
    }));
  });

  it('lets the user manually reload from the fallback UI', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);

    fireEvent.click(screen.getByRole('button', { name: /Reload page/i }));
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does not crash the test suite when the crash report itself fails to send', async () => {
    api.post.mockRejectedValueOnce(new Error('network down'));
    expect(() => render(<ErrorBoundary><Bomb /></ErrorBoundary>)).not.toThrow();
  });
});
