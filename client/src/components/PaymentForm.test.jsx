/**
 * PaymentForm tests.
 *
 * Covers the amount/mode/date/reference fields, the amount-in-words line,
 * the overpay/credit notices (paying more than owed, or with a zero/negative
 * balance), the quick-fill 50%/75%/Full buttons, the prefill reinit flow
 * (used for edit), submit payload shaping (amount parsed to a number, form
 * reset afterwards), and the disabled/loading submit states.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PaymentForm from './PaymentForm';

vi.mock('../utils/dateUtils', async () => {
  const actual = await vi.importActual('../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

describe('PaymentForm — fields', () => {
  it('defaults the date to today and the mode to Cash', () => {
    const { container } = render(<PaymentForm onSubmit={vi.fn()} />);
    expect(container.querySelector('input[type="date"]')).toHaveValue('2026-08-09');
    expect(screen.getByText('Cash').closest('button')).toHaveClass('bg-emerald-700');
  });

  it('lets a mode be picked via the pill buttons', () => {
    render(<PaymentForm onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText('UPI'));
    expect(screen.getByText('UPI').closest('button')).toHaveClass('bg-emerald-700');
    expect(screen.getByText('Cash').closest('button')).not.toHaveClass('bg-emerald-700');
  });

  it('shows the amount in words once an amount is entered', () => {
    render(<PaymentForm onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1500' } });
    expect(screen.getByText(/one thousand five hundred/i)).toBeInTheDocument();
  });

  it('disables submit until an amount is entered', () => {
    render(<PaymentForm onSubmit={vi.fn()} />);
    const btn = screen.getByText('Record Payment').closest('button');
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    expect(btn).not.toBeDisabled();
  });

  it('disables submit and shows "Recording…" while loading', () => {
    render(<PaymentForm onSubmit={vi.fn()} loading />);
    expect(screen.getByText('Recording…').closest('button')).toBeDisabled();
  });

  it('uses a custom submit label', () => {
    render(<PaymentForm onSubmit={vi.fn()} submitLabel="Save Changes" />);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });
});

describe('PaymentForm — overpay / credit notices', () => {
  it('shows no notice for a normal payment within the outstanding balance', () => {
    render(<PaymentForm onSubmit={vi.fn()} closingBalance={1000} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    expect(screen.queryByText(/creates a credit/)).toBeNull();
  });

  it('shows an overpay notice when the amount exceeds a positive balance', () => {
    render(<PaymentForm onSubmit={vi.fn()} closingBalance={1000} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1200' } });
    expect(screen.getByText(/pays ₹200\.00 more than the ₹1,000\.00 owed/)).toBeInTheDocument();
  });

  it('shows a straight credit notice when the balance is already zero/negative', () => {
    render(<PaymentForm onSubmit={vi.fn()} closingBalance={-300} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    expect(screen.getByText(/creates a credit of ₹500\.00/)).toBeInTheDocument();
  });
});

describe('PaymentForm — quick-fill', () => {
  it('shows quick-fill buttons only when there is an outstanding balance', () => {
    const { rerender } = render(<PaymentForm onSubmit={vi.fn()} closingBalance={1000} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    rerender(<PaymentForm onSubmit={vi.fn()} closingBalance={0} />);
    expect(screen.queryByText('50%')).toBeNull();
  });

  it('fills 50%, 75%, and the full balance', () => {
    render(<PaymentForm onSubmit={vi.fn()} closingBalance={1000} />);
    const amountInput = screen.getByPlaceholderText('0.00');

    fireEvent.click(screen.getByText('50%'));
    expect(amountInput).toHaveValue(500);

    fireEvent.click(screen.getByText('75%'));
    expect(amountInput).toHaveValue(750);

    fireEvent.click(screen.getByText(/^Full/));
    expect(amountInput).toHaveValue(1000);
  });

  it("shows Today's Bill only when todaysBillAmount is > 0, independent of closingBalance", () => {
    const { rerender } = render(<PaymentForm onSubmit={vi.fn()} closingBalance={1000} todaysBillAmount={0} />);
    expect(screen.queryByText(/Today's Bill/)).toBeNull();

    // Also shown with no outstanding balance at all (e.g. salesperson is
    // settled/credit overall, but still owes for today's dispatch).
    rerender(<PaymentForm onSubmit={vi.fn()} closingBalance={0} todaysBillAmount={450} />);
    expect(screen.getByText("Today's Bill (₹450.00)")).toBeInTheDocument();
    expect(screen.queryByText('50%')).toBeNull(); // no 50%/75%/Full — no outstanding balance
  });

  it("fills the amount from Today's Bill, alongside the 50%/75%/Full buttons", () => {
    render(<PaymentForm onSubmit={vi.fn()} closingBalance={1000} todaysBillAmount={450} />);
    const amountInput = screen.getByPlaceholderText('0.00');

    fireEvent.click(screen.getByText("Today's Bill (₹450.00)"));
    expect(amountInput).toHaveValue(450);

    // The balance-based buttons are still available alongside it.
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText(/^Full/)).toBeInTheDocument();
  });
});

describe('PaymentForm — submit', () => {
  it('submits the form with amount parsed to a number, then resets the form', () => {
    const onSubmit = vi.fn();
    render(<PaymentForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '250.5' } });
    fireEvent.change(screen.getByPlaceholderText('Txn / cheque no.'), { target: { value: 'REF123' } });
    fireEvent.click(screen.getByText('Record Payment'));

    expect(onSubmit).toHaveBeenCalledWith({
      amount: 250.5, paymentDate: '2026-08-09', paymentMode: 'Cash', reference: 'REF123',
    });
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(null);
  });
});

describe('PaymentForm — prefill (edit flow)', () => {
  it('reinitialises the form from a prefill and calls onClearPrefill', () => {
    const onClearPrefill = vi.fn();
    render(<PaymentForm onSubmit={vi.fn()} onClearPrefill={onClearPrefill}
      prefill={{ amount: 999, paymentDate: '2026-07-01', paymentMode: 'UPI', reference: 'OLD-REF' }} />);

    expect(screen.getByPlaceholderText('0.00')).toHaveValue(999);
    expect(screen.getByDisplayValue('2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('UPI').closest('button')).toHaveClass('bg-emerald-700');
    expect(screen.getByPlaceholderText('Txn / cheque no.')).toHaveValue('OLD-REF');
    expect(onClearPrefill).toHaveBeenCalled();
  });
});
