/**
 * SalesmanDayBalance tests.
 *
 * Covers the Day Balance page: per-salesman rows for the selected date,
 * hiding fully-settled salespeople, totals footer, search filter and
 * empty state.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalesmanDayBalance from './SalesmanDayBalance';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:   () => '2026-07-09',
  formatCurrency: (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../components/DateSelector', () => ({
  default: ({ date, onChange }) => (
    <div>
      <span data-testid="date-selector">{date}</span>
      <button onClick={() => onChange('2026-07-05')}>change-date</button>
    </div>
  ),
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
}));

const BALANCES = [
  { salespersonId: 1, salespersonName: 'Ramesh', route: 'Route 1', openingBalance: 1000, stockGiven: 500, amountPaid: 400, closingBalance: 1100 },
  { salespersonId: 2, salespersonName: 'Suresh', route: 'Route 2', openingBalance: 0,    stockGiven: 0,   amountPaid: 0,   closingBalance: 0    },
  { salespersonId: 3, salespersonName: 'Mahesh', route: null,      openingBalance: 200,  stockGiven: 0,   amountPaid: 200, closingBalance: 0    },
];

function mockApi(balances = BALANCES) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: balances } });
    return Promise.resolve({ data: { data: [] } });
  });
}

describe('SalesmanDayBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('renders the page header and column headings for today', async () => {
    render(<SalesmanDayBalance />);
    expect(await screen.findByText('Day Balance')).toBeInTheDocument();
    expect(screen.getByText('Total Outstanding Balance Amount')).toBeInTheDocument();
    expect(screen.getByText("Today's Bill")).toBeInTheDocument();
    expect(screen.getByText('Amount Received Today')).toBeInTheDocument();
    expect(screen.getByText('Total Amount Remaining')).toBeInTheDocument();
  });

  it('swaps "Today" headers for the actual date when viewing a different day', async () => {
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');
    fireEvent.click(screen.getByText('change-date'));
    expect(await screen.findByText("05 Jul's Bill")).toBeInTheDocument();
    expect(screen.getByText('Amount Received (05 Jul)')).toBeInTheDocument();
    expect(screen.queryByText("Today's Bill")).not.toBeInTheDocument();
    expect(screen.queryByText('Amount Received Today')).not.toBeInTheDocument();
  });

  it('hides fully-settled salespeople (all three amounts zero)', async () => {
    render(<SalesmanDayBalance />);
    expect(await screen.findByText('Ramesh')).toBeInTheDocument();
    expect(screen.getByText('Mahesh')).toBeInTheDocument();   // paid today → shown
    expect(screen.queryByText('Suresh')).not.toBeInTheDocument(); // all zero → hidden
  });

  it('shows each salesman with outstanding, bill, paid and remaining amounts', async () => {
    render(<SalesmanDayBalance />);
    const rameshCell = await screen.findByText('Ramesh');
    const row = rameshCell.closest('tr');
    expect(row.textContent).toContain('₹1000.00'); // outstanding (opening)
    expect(row.textContent).toContain('₹500.00');  // today's bill (stock given)
    expect(row.textContent).toContain('₹400.00');  // paid today
    expect(row.textContent).toContain('₹1100.00'); // remaining (closing)
  });

  it('renders a totals footer row summing all visible rows', async () => {
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');
    const totalsRow = screen.getByText(/Totals · 2 salesmen/i).closest('tr');
    expect(totalsRow.textContent).toContain('₹1200.00'); // outstanding: 1000 + 200
    expect(totalsRow.textContent).toContain('₹500.00');  // bill: 500 + 0
    expect(totalsRow.textContent).toContain('₹600.00');  // paid: 400 + 200
    expect(totalsRow.textContent).toContain('₹1100.00'); // remaining: 1100 + 0
  });

  it('filters rows by search on name', async () => {
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), { target: { value: 'mahesh' } });
    expect(screen.getByText('Mahesh')).toBeInTheDocument();
    expect(screen.queryByText('Ramesh')).not.toBeInTheDocument();
  });

  it('shows the all-settled empty state when no salesman has activity', async () => {
    mockApi([
      { salespersonId: 2, salespersonName: 'Suresh', route: 'Route 2', openingBalance: 0, stockGiven: 0, amountPaid: 0, closingBalance: 0 },
    ]);
    render(<SalesmanDayBalance />);
    expect(await screen.findByText(/All settled — no outstanding or payments/i)).toBeInTheDocument();
  });

  it('preserves the API display order instead of sorting alphabetically', async () => {
    // The endpoint orders by the admin-defined displayOrder; the page must not re-sort.
    mockApi([
      { salespersonId: 3, salespersonName: 'Zahir',  route: null, openingBalance: 100, stockGiven: 0, amountPaid: 0, closingBalance: 100 },
      { salespersonId: 1, salespersonName: 'Ramesh', route: null, openingBalance: 200, stockGiven: 0, amountPaid: 0, closingBalance: 200 },
      { salespersonId: 2, salespersonName: 'Anil',   route: null, openingBalance: 300, stockGiven: 0, amountPaid: 0, closingBalance: 300 },
    ]);
    const { container } = render(<SalesmanDayBalance />);
    await screen.findByText('Zahir');
    const names = [...container.querySelectorAll('tbody tr td:first-child p:first-child')]
      .map(p => p.textContent);
    expect(names).toEqual(['Zahir', 'Ramesh', 'Anil']);
  });

  it('shows an error banner when the API fails', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    render(<SalesmanDayBalance />);
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });
});
