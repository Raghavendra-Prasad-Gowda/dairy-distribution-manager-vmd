/**
 * BalanceSummaryCard tests.
 *
 * Covers the Outstanding/Clear badge, the ledger breakdown, the "You Owe"/
 * "Settled" figure (absolute value for a negative/credit balance), and the
 * "Pay Now" link — shown only when owing AND a payLink is supplied.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import BalanceSummaryCard from './BalanceSummaryCard';

function renderCard(props) {
  return render(<BalanceSummaryCard brandName="Nandini" {...props} />, { wrapper: MemoryRouter });
}

describe('BalanceSummaryCard — Outstanding', () => {
  it('shows the Outstanding badge, ledger figures, and a Pay Now link', () => {
    renderCard({ opening: 500, stockValue: 1000, paid: 800, closing: 700, payLink: '/dairy/payments?brandId=1' });
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('₹500.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹800.00')).toBeInTheDocument();
    expect(screen.getByText('You Owe')).toBeInTheDocument();
    expect(screen.getByText('₹700.00')).toBeInTheDocument();
    expect(screen.getByText('Pay Now').closest('a')).toHaveAttribute('href', '/dairy/payments?brandId=1');
  });

  it('hides Pay Now when owing but no payLink is given', () => {
    renderCard({ opening: 500, stockValue: 1000, paid: 800, closing: 700 });
    expect(screen.queryByText('Pay Now')).toBeNull();
  });
});

describe('BalanceSummaryCard — Clear', () => {
  it('shows the Clear badge and "Settled", with no Pay Now link, for a zero balance', () => {
    renderCard({ opening: 500, stockValue: 500, paid: 1000, closing: 0, payLink: '/dairy/payments?brandId=1' });
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.queryByText('Pay Now')).toBeNull();
  });

  it('displays a negative (credit) closing balance as its absolute value', () => {
    renderCard({ opening: 500, stockValue: 500, paid: 1200, closing: -200 });
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.getByText('₹200.00')).toBeInTheDocument();
  });
});
