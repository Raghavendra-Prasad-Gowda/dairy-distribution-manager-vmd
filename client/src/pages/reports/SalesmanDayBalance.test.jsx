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

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

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
  TumblerSpinner: () => <span data-testid="tumbler" />,
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
    expect(screen.getByText("Today's Bill")).toBeInTheDocument();
    expect(screen.getByText('Outstanding Balance')).toBeInTheDocument();
    expect(screen.getByText('Today Bill + Outstanding Balance')).toBeInTheDocument();
    expect(screen.getByText('Today Paid')).toBeInTheDocument();
    expect(screen.getByText('Today Balance')).toBeInTheDocument();
    expect(screen.getByText('Total Balance')).toBeInTheDocument();
  });

  it('swaps "Today" headers for the actual date when viewing a different day', async () => {
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');
    fireEvent.click(screen.getByText('change-date'));
    expect(await screen.findByText("05 Jul's Bill")).toBeInTheDocument();
    expect(screen.getByText('05 Jul Bill + Outstanding Balance')).toBeInTheDocument();
    expect(screen.getByText('05 Jul Paid')).toBeInTheDocument();
    expect(screen.getByText('05 Jul Balance')).toBeInTheDocument();
    expect(screen.queryByText("Today's Bill")).not.toBeInTheDocument();
    expect(screen.queryByText('Today Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Today Balance')).not.toBeInTheDocument();
  });

  it('hides fully-settled salespeople (all three amounts zero)', async () => {
    render(<SalesmanDayBalance />);
    expect(await screen.findByText('Ramesh')).toBeInTheDocument();
    expect(screen.getByText('Mahesh')).toBeInTheDocument();   // paid today → shown
    expect(screen.queryByText('Suresh')).not.toBeInTheDocument(); // all zero → hidden
  });

  it('shows each salesman with bill, outstanding balance, bill+balance, paid, today balance and total balance', async () => {
    render(<SalesmanDayBalance />);
    const rameshCell = await screen.findByText('Ramesh');
    const row = rameshCell.closest('tr');
    expect(row.textContent).toContain('₹500.00');  // today's bill (stock given)
    expect(row.textContent).toContain('₹1000.00'); // outstanding balance (opening)
    expect(row.textContent).toContain('₹1500.00'); // bill + balance
    expect(row.textContent).toContain('₹400.00');  // paid today
    expect(row.textContent).toContain('₹100.00');  // today balance (500 - 400)
    expect(row.textContent).toContain('₹1100.00'); // total balance (closing)
  });

  it('renders a totals footer row summing all visible rows', async () => {
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');
    const totalsRow = screen.getByText(/Totals · 2 salesmen/i).closest('tr');
    expect(totalsRow.textContent).toContain('₹500.00');  // bill: 500 + 0
    expect(totalsRow.textContent).toContain('₹1200.00'); // balance: 1000 + 200
    expect(totalsRow.textContent).toContain('₹1700.00'); // bill+balance: 1500 + 200
    expect(totalsRow.textContent).toContain('₹600.00');  // paid: 400 + 200
    // Day balance floors at zero per row, so Mahesh's ₹200 old-dues recovery no
    // longer nets off Ramesh's genuine ₹100 shortfall.
    expect(totalsRow.textContent).toContain('₹100.00');  // today balance: max(500-400,0) + max(0-200,0)
    expect(totalsRow.textContent).toContain('₹200.00');  // excess paid: Mahesh's 200 over a nil bill
    expect(totalsRow.textContent).not.toContain('₹-100.00');
    expect(totalsRow.textContent).toContain('₹1100.00'); // total balance: 1100 + 0
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

// ─── Top-ups ─────────────────────────────────────────────────────────────────

/**
 * closing = opening + stockGiven + topUpAmount − amountPaid. The derived
 * columns used to omit topUpAmount, so "Bill + Outstanding Balance" minus
 * "Paid" disagreed with "Total Balance" by exactly the top-up.
 */
describe('SalesmanDayBalance — top-ups', () => {
  const WITH_TOPUP = [
    {
      salespersonId: 1, salespersonName: 'Ramesh', route: 'Route 1',
      openingBalance: 1000, stockGiven: 500, topUpAmount: 1500,
      amountPaid: 400, closingBalance: 2600,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an Old Balance Added column and folds the top-up into the derived columns', async () => {
    mockApi(WITH_TOPUP);
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');

    expect(screen.getByRole('columnheader', { name: 'Old Balance Added' })).toBeInTheDocument();
    // bill 500 + top-up 1500 + opening 1000 = 3000, and 3000 − paid 400 = 2600,
    // which must equal the ledger's Total Balance.
    expect(screen.getAllByText('₹3000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₹1600.00').length).toBeGreaterThanOrEqual(1); // day balance: 500 + 1500 − 400
    expect(screen.getAllByText('₹2600.00').length).toBeGreaterThanOrEqual(1);
  });

  it('hides the Old Balance Added column when no salesman has a top-up', async () => {
    mockApi(BALANCES);
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');

    expect(screen.queryByRole('columnheader', { name: 'Old Balance Added' })).not.toBeInTheDocument();
  });

  it('treats a row with no topUpAmount field as zero', async () => {
    mockApi([{ ...WITH_TOPUP[0], topUpAmount: undefined, closingBalance: 1100 }]);
    render(<SalesmanDayBalance />);
    await screen.findByText('Ramesh');

    expect(screen.queryByRole('columnheader', { name: 'Old Balance Added' })).not.toBeInTheDocument();
    // Falls back to bill 500 + opening 1000 = 1500 with no top-up added in.
    expect(screen.getAllByText('₹1500.00').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Day balance vs. old-dues recovery ──────────────────────────────

/**
 * A salesman's collection clears THAT DAY'S bill first; only what he hands over
 * beyond it reaches the dues carried in from earlier days.
 *
 * The day balance was a signed net (bill − paid), so an overpayment rendered as
 * a negative and — because the totals row summed those signed values — quietly
 * subtracted from every other salesman's genuine shortfall, understating the
 * day's uncollected billing by exactly the amount recovered against old dues.
 */
describe('SalesmanDayBalance — day balance vs old dues', () => {
  // Real figures from the reported case: today's bill 27,797, handed over
  // 28,227 — the extra 430 came off an opening balance of 5,429.
  const OVERPAID = [{
    salespersonId: 1, salespersonName: 'K Pandu', route: 'Route A',
    openingBalance: 5429, stockGiven: 27797, amountPaid: 28227, closingBalance: 4999,
  }];

  const SHORT_PAID = {
    salespersonId: 2, salespersonName: 'Hari', route: 'Route B',
    openingBalance: 0, stockGiven: 10000, amountPaid: 9000, closingBalance: 1000,
  };

  /** Column headers in render order, so cell lookups are position-aware. */
  const headersOf = (row) =>
    [...row.closest('table').querySelectorAll('thead th')].map(th => th.textContent.trim());

  /**
   * Read one cell of a row BY COLUMN, not by scanning the row's text. A plain
   * `row.textContent).toContain('₹430.00')` passes even when the figure lands in
   * the wrong column, which is exactly the regression these tests must catch.
   */
  function cellFor(row, header) {
    const idx = headersOf(row).indexOf(header);
    expect(idx, `no "${header}" column in [${headersOf(row).join(' | ')}]`).toBeGreaterThanOrEqual(0);
    return row.children[idx];
  }

  const amountIn = (row, header) => Number(cellFor(row, header).textContent.replace(/[₹,]/g, ''));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('floors the day balance at zero when a salesman pays past the day\'s bill', async () => {
    mockApi(OVERPAID);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('K Pandu')).closest('tr');

    // Today's bill is fully covered — not −430.
    expect(cellFor(row, 'Today Balance')).toHaveTextContent('₹0.00');
    expect(cellFor(row, 'Today Balance')).not.toHaveTextContent('-430');
    // The old balance still owed is unchanged and stays on Total Balance.
    expect(cellFor(row, 'Total Balance')).toHaveTextContent('₹4999.00');
  });

  it('shows the overpayment in its own Excess Paid column', async () => {
    mockApi(OVERPAID);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('K Pandu')).closest('tr');

    expect(cellFor(row, 'Today Paid')).toHaveTextContent('₹28227.00');  // what he handed over
    expect(cellFor(row, 'Excess Paid')).toHaveTextContent('₹430.00');   // the part that hit his old balance
  });

  it('places Excess Paid between Today Paid and Today Balance', async () => {
    mockApi(OVERPAID);
    render(<SalesmanDayBalance />);
    await screen.findByText('K Pandu');

    const headers = headersOf(screen.getByText('K Pandu').closest('tr'));
    expect(headers.indexOf('Excess Paid')).toBe(headers.indexOf('Today Paid') + 1);
    expect(headers.indexOf('Today Balance')).toBe(headers.indexOf('Excess Paid') + 1);
  });

  it('keeps one salesman\'s overpayment out of the day\'s total shortfall', async () => {
    mockApi([...OVERPAID, SHORT_PAID]);
    render(<SalesmanDayBalance />);
    await screen.findByText('K Pandu');
    const totalsRow = screen.getByText(/Totals · 2 salesmen/i).closest('tr');

    // Hari is 1,000 short; K Pandu's 430 recovery must not cancel any of it.
    expect(amountIn(totalsRow, 'Today Balance')).toBe(1000);
    expect(amountIn(totalsRow, 'Today Balance')).not.toBe(570); // the old signed-net answer
    expect(amountIn(totalsRow, 'Excess Paid')).toBe(430);
  });

  it('reconciles: outstanding + day balance − excess paid = total balance', async () => {
    mockApi([...OVERPAID, SHORT_PAID]);
    render(<SalesmanDayBalance />);
    await screen.findByText('K Pandu');
    const totalsRow = screen.getByText(/Totals · 2 salesmen/i).closest('tr');

    const outstanding = amountIn(totalsRow, 'Outstanding Balance');
    const dayBalance  = amountIn(totalsRow, 'Today Balance');
    const excess      = amountIn(totalsRow, 'Excess Paid');
    const total       = amountIn(totalsRow, 'Total Balance');

    expect(outstanding + dayBalance - excess).toBeCloseTo(total, 2);
    expect(total).toBe(5999); // 5429 + 1000 − 430, and the ledger's own closing sum
  });

  it('hides the Excess Paid column when nobody pays past the day\'s bill', async () => {
    mockApi([{
      salespersonId: 1, salespersonName: 'Ramesh', route: null,
      openingBalance: 1000, stockGiven: 500, amountPaid: 400, closingBalance: 1100,
    }]);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('Ramesh')).closest('tr');

    expect(cellFor(row, 'Today Balance')).toHaveTextContent('₹100.00'); // 500 − 400 still uncollected
    expect(screen.queryByRole('columnheader', { name: 'Excess Paid' })).not.toBeInTheDocument();
  });

  it('shows no excess when the payment exactly equals the day\'s bill', async () => {
    mockApi([{
      salespersonId: 1, salespersonName: 'Hari', route: null,
      openingBalance: 2000, stockGiven: 41443, amountPaid: 41443, closingBalance: 2000,
    }]);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('Hari')).closest('tr');

    expect(cellFor(row, 'Today Balance')).toHaveTextContent('₹0.00');
    expect(screen.queryByRole('columnheader', { name: 'Excess Paid' })).not.toBeInTheDocument();
    // Paying the bill exactly must not touch the old balance.
    expect(cellFor(row, 'Total Balance')).toHaveTextContent('₹2000.00');
  });

  it('drops the Excess Paid column when the search filters the overpayer out', async () => {
    mockApi([...OVERPAID, SHORT_PAID]);
    render(<SalesmanDayBalance />);
    await screen.findByText('K Pandu');
    expect(screen.getByRole('columnheader', { name: 'Excess Paid' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), { target: { value: 'hari' } });

    expect(screen.queryByText('K Pandu')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Excess Paid' })).not.toBeInTheDocument();
  });

  it('reports a genuine advance when there are no old dues left to recover', async () => {
    mockApi([{
      salespersonId: 1, salespersonName: 'Seena', route: null,
      openingBalance: 0, stockGiven: 300, amountPaid: 500, closingBalance: -200,
    }]);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('Seena')).closest('tr');

    expect(cellFor(row, 'Excess Paid')).toHaveTextContent('₹200.00');
    // Violet marks money with no old dues to absorb it, unlike an ordinary recovery.
    expect(cellFor(row, 'Excess Paid').className).toContain('text-violet-600');
    // A real credit still reads negative on Total Balance, where it belongs.
    expect(cellFor(row, 'Total Balance')).toHaveTextContent('₹-200.00');
  });

  it('marks an ordinary old-dues recovery amber rather than violet', async () => {
    mockApi(OVERPAID);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('K Pandu')).closest('tr');

    expect(cellFor(row, 'Excess Paid').className).toContain('text-amber-600');
    expect(cellFor(row, 'Excess Paid').className).not.toContain('text-violet-600');
  });

  it('counts a top-up on the day\'s side before any old dues are touched', async () => {
    mockApi([{
      salespersonId: 1, salespersonName: 'Nagraj', route: null,
      openingBalance: 1000, stockGiven: 500, topUpAmount: 1500,
      amountPaid: 2100, closingBalance: 900,
    }]);
    render(<SalesmanDayBalance />);
    const row = (await screen.findByText('Nagraj')).closest('tr');

    // Bill 500 + top-up 1500 = 2000 cleared first; only the last 100 hits old dues.
    expect(cellFor(row, 'Excess Paid')).toHaveTextContent('₹100.00');
    expect(cellFor(row, 'Today Balance')).toHaveTextContent('₹0.00');
    expect(cellFor(row, 'Total Balance')).toHaveTextContent('₹900.00');
  });

  it('carries paise through the derived columns and the totals', async () => {
    // Real collections land on paise (₹25,000.25, ₹18,027.50 in production).
    mockApi([
      { salespersonId: 1, salespersonName: 'Shabari', route: null,
        openingBalance: 3.75, stockGiven: 25000.25, amountPaid: 25000.5, closingBalance: 3.5 },
      { salespersonId: 2, salespersonName: 'S Manu', route: null,
        openingBalance: 1991.25, stockGiven: 18027.5, amountPaid: 18000.25, closingBalance: 2018.5 },
    ]);
    render(<SalesmanDayBalance />);
    const shabari = (await screen.findByText('Shabari')).closest('tr');
    const totalsRow = screen.getByText(/Totals · 2 salesmen/i).closest('tr');

    expect(cellFor(shabari, 'Excess Paid')).toHaveTextContent('₹0.25');   // 25000.50 − 25000.25
    expect(amountIn(totalsRow, 'Today Balance')).toBeCloseTo(27.25, 2);        // S Manu short by 27.25
    expect(amountIn(totalsRow, 'Excess Paid')).toBeCloseTo(0.25, 2);
    // And the footer still reconciles on paise.
    expect(
      amountIn(totalsRow, 'Outstanding Balance') +
      amountIn(totalsRow, 'Today Balance') -
      amountIn(totalsRow, 'Excess Paid')
    ).toBeCloseTo(amountIn(totalsRow, 'Total Balance'), 2);
  });
});
