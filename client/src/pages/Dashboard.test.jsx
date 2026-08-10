/**
 * Dashboard tests.
 *
 * Covers the Quick Actions links, the dairy payables cards (Outstanding /
 * Cleared / Credit tones, the breakdown row, and the "Pay Now" link that
 * only appears when owing), the total-outstanding badge, the empty state,
 * date-change refetching, and error handling.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';
import api from '../api/axios';

vi.mock('../api/axios', () => ({
  default: { get: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../utils/dateUtils', () => ({
  getIndiaDate:   () => '2026-08-09',
  formatCurrency: (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../components/DateSelector', () => ({
  default: ({ date, onChange }) => (
    <div>
      <span data-testid="date-selector">{date}</span>
      <button onClick={() => onChange('2026-08-05')}>change-date</button>
    </div>
  ),
}));

function brandBalance(overrides) {
  return {
    brandId: 1, brandName: 'Nandini',
    openingBalance: 500, stockValue: 1000, depositValue: 0, amountPaid: 800, closingBalance: 700,
    ...overrides,
  };
}

function mockApi(brands = [brandBalance()]) {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { brands } } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
});

function renderPage() {
  return render(<Dashboard />, { wrapper: MemoryRouter });
}

describe('Dashboard — Quick Actions', () => {
  it('links to Stock Receipt, Collections, and Dairy Payments', async () => {
    renderPage();
    await screen.findByText('Nandini');
    expect(screen.getByText('Stock Receipt').closest('a')).toHaveAttribute('href', '/dairy/stock/nandini');
    expect(screen.getByText('Collections').closest('a')).toHaveAttribute('href', '/salesman/payments');
    expect(screen.getByText('Dairy Payments').closest('a')).toHaveAttribute('href', '/dairy/payments');
  });
});

describe('Dashboard — Dairy Payables', () => {
  it('shows "No dairy brands configured" when empty', async () => {
    mockApi([]);
    renderPage();
    expect(await screen.findByText('No dairy brands configured.')).toBeInTheDocument();
  });

  it('shows an Outstanding card with the breakdown and a Pay Now link', async () => {
    renderPage();
    const card = (await screen.findByText('Nandini')).closest('.ddm-card');
    expect(within(card).getByText('Outstanding')).toBeInTheDocument();
    expect(within(card).getByText('₹700.00')).toBeInTheDocument(); // closing (You Owe)
    expect(within(card).getByText('₹500.00')).toBeInTheDocument(); // opening
    expect(within(card).getByText('₹1000.00')).toBeInTheDocument(); // bill
    expect(within(card).getByText('₹800.00')).toBeInTheDocument(); // paid
    expect(within(card).getByText('Pay Now').closest('a')).toHaveAttribute('href', '/dairy/payments?brandId=1');
  });

  it('shows a Cleared card with no Pay Now link when settled', async () => {
    mockApi([brandBalance({ closingBalance: 0 })]);
    renderPage();
    const card = (await screen.findByText('Nandini')).closest('.ddm-card');
    expect(within(card).getByText('Cleared')).toBeInTheDocument();
    expect(within(card).getByText('Settled')).toBeInTheDocument();
    expect(within(card).queryByText('Pay Now')).toBeNull();
  });

  it('shows a Credit card when the balance is negative', async () => {
    mockApi([brandBalance({ closingBalance: -200 })]);
    renderPage();
    const card = (await screen.findByText('Nandini')).closest('.ddm-card');
    expect(within(card).getByText('Credit')).toBeInTheDocument();
    expect(within(card).getByText("You're in Credit")).toBeInTheDocument();
    expect(within(card).getByText('₹200.00')).toBeInTheDocument(); // abs(closing)
  });

  it('shows the total-outstanding badge, summing only positive closing balances', async () => {
    mockApi([brandBalance({ brandId: 1, brandName: 'Nandini', closingBalance: 700 }), brandBalance({ brandId: 2, brandName: 'Jersey', closingBalance: -300 })]);
    renderPage();
    await screen.findByText('Nandini');
    expect(screen.getByText('₹700.00 total')).toBeInTheDocument();
  });
});

describe('Dashboard — date and errors', () => {
  it('refetches when the date changes', async () => {
    renderPage();
    await screen.findByText('Nandini');
    fireEvent.click(screen.getByText('change-date'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('date=2026-08-05')));
  });

  it('shows the server error message on a failed fetch', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: 'Failed to load balances' } } });
    renderPage();
    expect(await screen.findByText('Failed to load balances')).toBeInTheDocument();
  });
});
