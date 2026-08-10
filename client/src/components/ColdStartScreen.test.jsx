/**
 * ColdStartScreen tests.
 *
 * `subscribe` from api/coldStart is mocked so the component's own logic
 * (render nothing while not waking, show a cycling "Loading..." label
 * while waking, unsubscribe on unmount) can be tested independently of the
 * cold-start tracker's shared module-level state.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ColdStartScreen from './ColdStartScreen';
import { subscribe } from '../api/coldStart';

vi.mock('../api/coldStart', () => ({
  subscribe: vi.fn(),
}));

vi.mock('./ui/BrandedLoader', () => ({
  default: ({ label }) => <div data-testid="branded-loader">{label}</div>,
}));

let onWakingChange;
let unsub;

beforeEach(() => {
  vi.resetAllMocks();
  unsub = vi.fn();
  vi.mocked(subscribe).mockImplementation((fn) => {
    onWakingChange = fn;
    fn(false); // subscribe() always pushes current state immediately
    return unsub;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ColdStartScreen — visibility', () => {
  it('renders nothing while not waking', () => {
    const { container } = render(<ColdStartScreen />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the loader once notified that the server is waking', () => {
    render(<ColdStartScreen />);
    act(() => onWakingChange(true));
    expect(screen.getByTestId('branded-loader')).toHaveTextContent('Loading');
  });

  it('hides the loader again once waking clears', () => {
    const { container } = render(<ColdStartScreen />);
    act(() => onWakingChange(true));
    expect(screen.getByTestId('branded-loader')).toBeInTheDocument();
    act(() => onWakingChange(false));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ColdStartScreen — dot animation', () => {
  it('cycles the trailing dots every 600ms while waking', () => {
    vi.useFakeTimers();
    render(<ColdStartScreen />);
    act(() => onWakingChange(true));
    expect(screen.getByTestId('branded-loader')).toHaveTextContent('Loading');

    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('branded-loader').textContent).toBe('Loading.');

    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('branded-loader').textContent).toBe('Loading..');

    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('branded-loader').textContent).toBe('Loading...');

    act(() => vi.advanceTimersByTime(600)); // wraps back around
    expect(screen.getByTestId('branded-loader').textContent).toBe('Loading');
  });
});

describe('ColdStartScreen — cleanup', () => {
  it('unsubscribes on unmount', () => {
    const { unmount } = render(<ColdStartScreen />);
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
