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
    render(
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

describe('Modal — backdrop / Escape / body-click behavior', () => {
  it('closes on a backdrop click by default', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Confirm"><p>Body</p></Modal>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Confirm" closeOnBackdrop={false}><p>Body</p></Modal>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a click inside the dialog card does not bubble to the backdrop', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Confirm"><p>Body text</p></Modal>);
    fireEvent.click(screen.getByText('Body text'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape while open', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Confirm"><p>Body</p></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not listen for Escape once closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open onClose={onClose} title="Confirm"><p>Body</p></Modal>);
    rerender(<Modal open={false} onClose={onClose} title="Confirm"><p>Body</p></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Modal — footer, size, and header omission', () => {
  it('renders the footer when provided', () => {
    render(
      <Modal open onClose={vi.fn()} title="Confirm" footer={<button>Confirm Action</button>}>
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
  });

  it('omits the footer bar entirely when none is given', () => {
    const { container } = render(<Modal open onClose={vi.fn()} title="Confirm"><p>Body</p></Modal>);
    expect(container.querySelector('.bg-slate-50.border-t')).toBeNull();
  });

  it('applies the requested size class, falling back to md for an unknown size', () => {
    const { container: lg } = render(<Modal open onClose={vi.fn()} title="T" size="lg"><p>x</p></Modal>);
    expect(lg.querySelector('.max-w-lg')).toBeTruthy();

    const { container: unknown } = render(<Modal open onClose={vi.fn()} title="T" size="huge"><p>x</p></Modal>);
    expect(unknown.querySelector('.max-w-md')).toBeTruthy();
  });

  it('hides the close button when showClose is false, in both plain and accent headers', () => {
    render(<Modal open onClose={vi.fn()} title="Plain" showClose={false}><p>x</p></Modal>);
    expect(screen.queryByLabelText('Close dialog')).toBeNull();

    render(<Modal open onClose={vi.fn()} title="Accent" accent="amber" showClose={false}><p>x</p></Modal>);
    expect(screen.queryAllByLabelText('Close dialog')).toHaveLength(0);
  });

  it('omits the header entirely when there is no title and showClose is false', () => {
    const { container } = render(<Modal open onClose={vi.fn()} showClose={false}><p>Just body</p></Modal>);
    expect(container.querySelector('#modal-title')).toBeNull();
    expect(screen.getByText('Just body')).toBeInTheDocument();
  });

  it('omits the accent header band too when there is no title and showClose is false', () => {
    const { container } = render(<Modal open onClose={vi.fn()} accent="amber" showClose={false}><p>Just body</p></Modal>);
    expect(container.querySelector('.bg-amber-600')).toBeNull();
    expect(screen.getByText('Just body')).toBeInTheDocument();
  });

  it('gives the body extra top padding (p-6) when there is no title', () => {
    render(<Modal open onClose={vi.fn()} showClose={false}><p>Untitled body</p></Modal>);
    const body = screen.getByText('Untitled body').closest('div');
    expect(body.className).toContain('p-6');
  });
});

describe('Modal — focus trap', () => {
  // With a title, the header's own X (Close dialog) button is the first
  // focusable element in DOM order — it comes before any of the children.
  it('moves initial focus to the first focusable element in the dialog', () => {
    render(
      <Modal open onClose={vi.fn()} title="Focus test">
        <button>First</button>
        <button>Second</button>
      </Modal>
    );
    expect(screen.getByLabelText('Close dialog')).toHaveFocus();
  });

  it('moves initial focus to the first child button when there is no header at all', () => {
    render(
      <Modal open onClose={vi.fn()} showClose={false}>
        <button>First</button>
        <button>Second</button>
      </Modal>
    );
    expect(screen.getByText('First')).toHaveFocus();
  });

  it('Tab on the last focusable element wraps focus to the first (the Close button)', () => {
    render(
      <Modal open onClose={vi.fn()} title="Focus test">
        <button>First</button>
        <button>Last</button>
      </Modal>
    );
    const last = screen.getByText('Last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByLabelText('Close dialog')).toHaveFocus();
  });

  it('Shift+Tab on the first focusable element wraps focus to the last', () => {
    render(
      <Modal open onClose={vi.fn()} title="Focus test">
        <button>First</button>
        <button>Last</button>
      </Modal>
    );
    // The Close button is first in DOM order — Shift+Tab from it wraps to Last.
    const closeBtn = screen.getByLabelText('Close dialog');
    closeBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByText('Last')).toHaveFocus();
  });

  it('Tab/Shift+Tab on a middle element does not force focus anywhere (only boundary elements wrap)', () => {
    render(
      <Modal open onClose={vi.fn()} title="Focus test">
        <button>First</button>
        <button>Middle</button>
        <button>Last</button>
      </Modal>
    );
    const middle = screen.getByText('Middle');
    middle.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(middle).toHaveFocus(); // untouched — the trap only intervenes at the boundaries
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(middle).toHaveFocus();
  });

  it('a Tab press with no focusable elements at all does not throw', () => {
    render(<Modal open onClose={vi.fn()} showClose={false}><p>No focusable content</p></Modal>);
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow();
  });

  it('ignores non-Tab keys entirely', () => {
    render(
      <Modal open onClose={vi.fn()} title="Focus test">
        <button>First</button>
        <button>Last</button>
      </Modal>
    );
    const first = screen.getByText('First');
    first.focus();
    fireEvent.keyDown(document, { key: 'a' });
    expect(first).toHaveFocus(); // unchanged
  });

  it('restores focus to the previously-focused element when it closes', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open modal';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { rerender } = render(
      <Modal open onClose={vi.fn()} showClose={false}><button>Inside</button></Modal>
    );
    expect(screen.getByText('Inside')).toHaveFocus();

    rerender(<Modal open={false} onClose={vi.fn()} showClose={false}><button>Inside</button></Modal>);
    expect(trigger).toHaveFocus();

    document.body.removeChild(trigger);
  });
});
