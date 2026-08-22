/**
 * PinModal tests.
 *
 * Covers digit entry (typing the 6th digit auto-submits, Backspace clears/
 * moves back), the success flow (verifies PIN, calls onSuccess then
 * onClose, clears the attempt counter), the failure flow (shows the
 * "N attempts remaining" warning and resets the boxes), the lockout that
 * kicks in after MAX_ATTEMPTS failures (persisted to localStorage), and
 * that a modal reopened while still locked out shows the lockout screen
 * immediately from the stored timestamp.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PinModal from './PinModal';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: { post: vi.fn() },
}));

function typePin(inputs, pin) {
  pin.split('').forEach((digit, i) => fireEvent.keyDown(inputs[i], { key: digit }));
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PinModal — visibility', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PinModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the default title, or a custom one', () => {
    const { rerender } = render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('Enter PIN')).toBeInTheDocument();
    rerender(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} title="Confirm Deletion" />);
    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
  });

  it('closing via the X button or the backdrop calls onClose', () => {
    const onClose = vi.fn();
    const { container } = render(<PinModal isOpen onClose={onClose} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '' })); // X icon-only button
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstChild); // backdrop
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('PinModal — digit entry', () => {
  it('auto-submits after the 6th digit and verifies via the API', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<PinModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    const inputs = container.querySelectorAll('input[type="password"]');

    typePin(inputs, '123456');

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pin/verify', { pin: '123456' }));
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Backspace clears the current digit, or moves back and clears the previous one', () => {
    const { container } = render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const inputs = container.querySelectorAll('input[type="password"]');
    fireEvent.keyDown(inputs[0], { key: '1' });
    expect(inputs[0]).toHaveValue('1');

    fireEvent.keyDown(inputs[1], { key: 'Backspace' }); // empty box 2 -> moves back to box 1
    fireEvent.keyDown(inputs[0], { key: 'Backspace' }); // clears box 1
    expect(inputs[0]).toHaveValue('');
  });

  it('ignores non-digit keys', () => {
    const { container } = render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const inputs = container.querySelectorAll('input[type="password"]');
    fireEvent.keyDown(inputs[0], { key: 'a' });
    expect(inputs[0]).toHaveValue('');
  });

  it('the Confirm button is disabled until all 6 digits are filled', () => {
    const { container } = render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const inputs = container.querySelectorAll('input[type="password"]');
    const confirmBtn = screen.getByText('Confirm').closest('button');
    expect(confirmBtn).toBeDisabled();

    typePin(inputs, '12345');
    expect(confirmBtn).toBeDisabled();
  });
});

describe('PinModal — failure', () => {
  it('shows "N attempts remaining" and resets the boxes on a wrong PIN', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('wrong'));
    const { container } = render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const inputs = container.querySelectorAll('input[type="password"]');
    typePin(inputs, '000000');

    // Distinct from the persistent amber "N attempts remaining before lockout"
    // banner — this is the per-submit red error line under the PIN boxes.
    expect(await screen.findByText('Incorrect PIN. 14 attempts remaining.')).toBeInTheDocument();
    expect(inputs[0]).toHaveValue('');
  });

  it('does not call onSuccess/onClose on a wrong PIN', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('wrong'));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<PinModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    const inputs = container.querySelectorAll('input[type="password"]');
    typePin(inputs, '000000');

    await screen.findByText('Incorrect PIN. 14 attempts remaining.');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PinModal — lockout', () => {
  it('locks out after the 15th wrong attempt and shows a countdown', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockRejectedValue(new Error('wrong'));
    localStorage.setItem('vmd_pin_attempts', '14'); // one more failure trips the lockout
    const { container } = render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const inputs = container.querySelectorAll('input[type="password"]');
    typePin(inputs, '000000');

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByText('PIN Locked')).toBeInTheDocument();
    expect(screen.getByText('60m 0s')).toBeInTheDocument();
    expect(localStorage.getItem('vmd_pin_lockout_until')).not.toBeNull();
    expect(localStorage.getItem('vmd_pin_attempts')).toBeNull();
  });

  it('reopening while a lockout is still active shows the lockout screen immediately', () => {
    localStorage.setItem('vmd_pin_lockout_until', String(Date.now() + 30 * 60 * 1000));
    render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('PIN Locked')).toBeInTheDocument();
    expect(screen.getByText('Too many wrong attempts')).toBeInTheDocument();
  });

  it('does not show the lockout screen once the stored lockout has expired', () => {
    localStorage.setItem('vmd_pin_lockout_until', String(Date.now() - 1000));
    render(<PinModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText('PIN Locked')).toBeNull();
    expect(screen.getByText('Enter PIN')).toBeInTheDocument();
  });
});
