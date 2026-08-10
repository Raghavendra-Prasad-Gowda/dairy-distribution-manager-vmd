/**
 * ConfirmationModal tests.
 *
 * Covers the closed/open state, title/message rendering, custom
 * confirm/cancel labels, Cancel calling only onClose, Confirm calling
 * onConfirm then onClose, and the tone → icon-background mapping
 * (danger/warning/info/success, plus the legacy isDanger boolean).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfirmationModal from './ConfirmationModal';

describe('ConfirmationModal — visibility', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmationModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} title="Delete?" message="Sure?" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the title and message when open', () => {
    render(<ConfirmationModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} title="Delete item?" message="This cannot be undone." />);
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('uses custom confirm/cancel button labels', () => {
    render(<ConfirmationModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" confirmText="Yes, Archive" cancelText="Not now" />);
    expect(screen.getByText('Yes, Archive')).toBeInTheDocument();
    expect(screen.getByText('Not now')).toBeInTheDocument();
  });
});

describe('ConfirmationModal — actions', () => {
  it('Cancel calls onClose only', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} title="t" message="m" />);
    screen.getByText('Cancel').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Confirm calls onConfirm then onClose', () => {
    const calls = [];
    const onConfirm = vi.fn(() => calls.push('confirm'));
    const onClose   = vi.fn(() => calls.push('close'));
    render(<ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} title="t" message="m" />);
    screen.getByText('Confirm').click();
    expect(calls).toEqual(['confirm', 'close']);
  });
});

describe('ConfirmationModal — tone', () => {
  it('defaults to a success-tinted icon when neither tone nor isDanger is set', () => {
    const { container } = render(<ConfirmationModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    expect(container.querySelector('.bg-emerald-100.text-emerald-600')).toBeInTheDocument();
  });

  it('isDanger renders a danger-tinted icon', () => {
    const { container } = render(<ConfirmationModal isOpen isDanger onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    expect(container.querySelector('.bg-red-100.text-red-600')).toBeInTheDocument();
  });

  it('tone="warning" overrides isDanger', () => {
    const { container } = render(<ConfirmationModal isOpen isDanger tone="warning" onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    expect(container.querySelector('.bg-amber-100.text-amber-600')).toBeInTheDocument();
  });

  it('tone="info" renders a blue-tinted icon', () => {
    const { container } = render(<ConfirmationModal isOpen tone="info" onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" />);
    expect(container.querySelector('.bg-blue-100.text-blue-600')).toBeInTheDocument();
  });
});
