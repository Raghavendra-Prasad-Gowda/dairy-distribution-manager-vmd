/**
 * Modal tests.
 *
 * Covers the accent/icon/subtitle header addition (used by BulkTopUpModal and
 * ResetLedgerModal to match the app's other "bulk action" dialogs), and —
 * critically — that the plain white header stays completely unchanged for
 * the six existing callers that don't pass `accent`, since this component
 * is shared broadly.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Wallet } from 'lucide-react';
import Modal from './Modal';

describe('Modal — default (plain) header, unchanged for existing callers', () => {
  it('renders a plain dark title with no colored band when accent is omitted', () => {
    const { container } = render(
      <Modal open onClose={vi.fn()} title="Delete payment?">
        <p>Are you sure?</p>
      </Modal>
    );

    const title = screen.getByText('Delete payment?');
    expect(title.className).toContain('text-slate-900');
    // The header wrapper must not carry any of the accent band backgrounds.
    const header = title.closest('div');
    expect(header.className).not.toMatch(/bg-(emerald|amber|teal|red)-\d/);
  });

  it('ignores icon/subtitle when no accent is given, matching prior behavior', () => {
    render(
      <Modal open onClose={vi.fn()} title="Confirm" subtitle="This cannot be undone" icon={Wallet}>
        <p>Body</p>
      </Modal>
    );
    // Subtitle is part of the accent header only — without accent, it's not rendered.
    expect(screen.queryByText('This cannot be undone')).toBeNull();
  });

  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={vi.fn()} title="Hidden"><p>x</p></Modal>);
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('calls onClose from the close button', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Confirm"><p>Body</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Modal — accent header (bulk action dialogs)', () => {
  it('renders a colored band with white title text and the icon', () => {
    const { container } = render(
      <Modal open onClose={vi.fn()} accent="amber" icon={Wallet} title="Bulk Top-up" subtitle="Step 1 of 2">
        <p>Body</p>
      </Modal>
    );

    const title = screen.getByText('Bulk Top-up');
    expect(title.className).toContain('text-white');
    expect(container.querySelector('.bg-amber-600')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('gives red and teal accents their own distinct band colors', () => {
    const { container: redC } = render(
      <Modal open onClose={vi.fn()} accent="red" title="Reset Ledger"><p>x</p></Modal>
    );
    expect(redC.querySelector('.bg-red-700')).toBeTruthy();

    const { container: tealC } = render(
      <Modal open onClose={vi.fn()} accent="teal" title="Deposit Top-up"><p>x</p></Modal>
    );
    expect(tealC.querySelector('.bg-teal-700')).toBeTruthy();
  });

  it('falls back to the emerald band for an unrecognized accent key', () => {
    const { container } = render(
      <Modal open onClose={vi.fn()} accent="not-a-real-color" title="Whatever"><p>x</p></Modal>
    );
    expect(container.querySelector('.bg-emerald-700')).toBeTruthy();
  });

  it('still closes correctly from the accent header', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} accent="amber" title="Bulk Top-up"><p>x</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalled();
  });
});
