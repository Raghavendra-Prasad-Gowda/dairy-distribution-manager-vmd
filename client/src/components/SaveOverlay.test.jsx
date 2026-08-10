/**
 * SaveOverlay tests.
 *
 * Covers the null render when status is falsy, success vs error copy/icon,
 * the manual close button (both states), and the success-only auto-dismiss
 * after 3s (errors require a manual close, so no timer should fire for them).
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SaveOverlay from './SaveOverlay';

afterEach(() => {
  vi.useRealTimers();
});

describe('SaveOverlay — visibility', () => {
  it('renders nothing when status is falsy', () => {
    const { container } = render(<SaveOverlay status={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SaveOverlay — success', () => {
  it('shows the default success message and "Dismissing automatically…"', () => {
    render(<SaveOverlay status="success" onClose={vi.fn()} />);
    expect(screen.getByText('Saved successfully!')).toBeInTheDocument();
    expect(screen.getByText('Dismissing automatically…')).toBeInTheDocument();
  });

  it('shows a custom successMessage when given', () => {
    render(<SaveOverlay status="success" onClose={vi.fn()} successMessage="Product added!" />);
    expect(screen.getByText('Product added!')).toBeInTheDocument();
  });

  it('auto-dismisses after 3 seconds', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<SaveOverlay status="success" onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button dismisses immediately', () => {
    const onClose = vi.fn();
    render(<SaveOverlay status="success" onClose={onClose} />);
    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SaveOverlay — error', () => {
  it('shows "Save Failed" and a manual-retry hint, with no auto-dismiss text', () => {
    render(<SaveOverlay status="error" onClose={vi.fn()} />);
    expect(screen.getByText('Save Failed')).toBeInTheDocument();
    expect(screen.getByText('Check your inputs and try again.')).toBeInTheDocument();
    expect(screen.queryByText('Dismissing automatically…')).toBeNull();
  });

  it('does not auto-dismiss on error', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<SaveOverlay status="error" onClose={onClose} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the close button still dismisses an error toast', () => {
    const onClose = vi.fn();
    render(<SaveOverlay status="error" onClose={onClose} />);
    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
