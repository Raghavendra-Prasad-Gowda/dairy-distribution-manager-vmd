/**
 * SalespersonStatement tests.
 *
 * Covers the salesperson header band (avatar + name + route shown when a
 * salesperson is selected) and the totals footer row (sum of Given and
 * Collected, final Due).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalespersonStatement from './SalespersonStatement';
import api from '../../api/axios';

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:       () => '2026-07-09',
  getFirstDayOfMonth: () => '2026-07-01',
  formatCurrency:     (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
  TumblerSpinner: () => <span data-testid="tumbler" />,
}));

const SALESPEOPLE = [
  { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
];

const ROWS = [
  { date: '2026-07-08', openingBalance: 1000, stockGiven: 500, amountPaid: 300, closingBalance: 1200, items: [], payments: [] },
  { date: '2026-07-09', openingBalance: 1200, stockGiven: 400, amountPaid: 600, closingBalance: 1000, items: [], payments: [] },
];

function mockApi({ rows = ROWS, salespeople = SALESPEOPLE } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/reports/salesperson-statement')) return Promise.resolve({ data: { data: rows } });
    if (url.includes('/salespeople'))                   return Promise.resolve({ data: { data: salespeople } });
    return Promise.resolve({ data: { data: [] } });
  });
}

async function selectRamesh() {
  render(<SalespersonStatement />);
  // Ramesh is auto-selected by default, so "Ramesh Kumar" may already appear
  // in both the sidebar and the header band — click the sidebar entry.
  const [spButton] = await screen.findAllByText('Ramesh Kumar');
  fireEvent.click(spButton);
}

describe('SalespersonStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('shows the "select a salesperson" placeholder when there are none', async () => {
    mockApi({ salespeople: [] });
    render(<SalespersonStatement />);
    expect(await screen.findByText('Select a salesperson')).toBeInTheDocument();
  });

  it('auto-selects the first salesperson by default', async () => {
    mockApi({
      salespeople: [
        { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
        { id: 2, name: 'Suresh Babu', route: 'Route 5' },
      ],
    });
    render(<SalespersonStatement />);
    // Header band renders for Ramesh (first in the list) without any click.
    expect(await screen.findByText('RK')).toBeInTheDocument();
    expect(screen.getAllByText('Ramesh Kumar').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the header band with initials, name and route after selecting', async () => {
    await selectRamesh();
    // Initials avatar (first + last name)
    expect(await screen.findByText('RK')).toBeInTheDocument();
    // Name appears in sidebar and header band
    expect(screen.getAllByText('Ramesh Kumar').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Route 3').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a totals footer row summing Given and Collected with final Due', async () => {
    await selectRamesh();
    const totalsCell = await screen.findByText('Totals');
    const row = totalsCell.closest('tr');
    expect(row.textContent).toContain('₹900.00');  // total given: 500 + 400
    expect(row.textContent).toContain('₹900.00');  // total collected: 300 + 600
    expect(row.textContent).toContain('₹1000.00'); // final due = last closing
  });

  it('does not render the totals row when there is no data', async () => {
    mockApi({ rows: [] });
    await selectRamesh();
    expect(await screen.findByText(/No data for this period/i)).toBeInTheDocument();
    expect(screen.queryByText('Totals')).not.toBeInTheDocument();
  });
});

// ─── Loading / error states ─────────────────────────────────────────────────

describe('SalespersonStatement — loading and error states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the loader while the statement is in flight', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/salespeople')) return Promise.resolve({ data: { data: SALESPEOPLE } });
      return new Promise(() => {}); // report never resolves
    });
    render(<SalespersonStatement />);
    expect(await screen.findByTestId('loader')).toBeInTheDocument();
  });

  it('degrades to the "select a salesperson" placeholder (not a crash) when the salespeople fetch fails', async () => {
    // spError is set on failure, but since no salesperson can ever get
    // auto-selected from an empty list, the error banner (which only
    // renders once a salesperson is selected) never actually becomes
    // visible — this exercises the catch path without crashing the page.
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/salespeople')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<SalespersonStatement />);
    expect(await screen.findByText('Select a salesperson')).toBeInTheDocument();
  });

  it('shows an error banner when the statement report fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/salespeople')) return Promise.resolve({ data: { data: SALESPEOPLE } });
      if (url.includes('/reports/salesperson-statement')) return Promise.reject({ response: { data: { error: 'Report failed' } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<SalespersonStatement />);
    expect(await screen.findByText('Report failed')).toBeInTheDocument();
  });
});

// ─── Sidebar search ──────────────────────────────────────────────────────────

describe('SalespersonStatement — sidebar search', () => {
  const TWO_SP = [
    { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
    { id: 2, name: 'Suresh Babu', route: 'Route 5' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi({ salespeople: TWO_SP });
  });

  // Ramesh is auto-selected, so his name also renders in the (unfiltered)
  // header band — sidebar entries are <button>s, so scope assertions there.
  function sidebarHasRamesh() {
    return screen.queryByRole('button', { name: /Ramesh Kumar/ }) !== null;
  }

  it('filters the sidebar by name or route', async () => {
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');

    const input = screen.getByPlaceholderText('Search name or route…');
    fireEvent.change(input, { target: { value: 'suresh' } });
    expect(screen.getByRole('button', { name: /Suresh Babu/ })).toBeInTheDocument();
    expect(sidebarHasRamesh()).toBe(false);

    fireEvent.change(input, { target: { value: 'route 3' } });
    expect(sidebarHasRamesh()).toBe(true);
    expect(screen.queryByRole('button', { name: /Suresh Babu/ })).not.toBeInTheDocument();
  });

  it('shows "No results" when the search matches nobody', async () => {
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');
    fireEvent.change(screen.getByPlaceholderText('Search name or route…'), { target: { value: 'zzz-none' } });
    expect(await screen.findByText('No results')).toBeInTheDocument();
  });

  it('the X button clears the search and restores the full list', async () => {
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');
    const input = screen.getByPlaceholderText('Search name or route…');
    fireEvent.change(input, { target: { value: 'suresh' } });
    expect(sidebarHasRamesh()).toBe(false);

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(sidebarHasRamesh()).toBe(true);
  });

  it('search does not crash on a salesperson with no route (route matcher falls back to empty string)', async () => {
    mockApi({ salespeople: [...TWO_SP, { id: 3, name: 'No Route Guy', route: null }] });
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');

    fireEvent.change(screen.getByPlaceholderText('Search name or route…'), { target: { value: 'no route' } });
    expect(screen.getByText('No Route Guy')).toBeInTheDocument();
  });

  it('switching salesperson selects them and re-fetches their statement', async () => {
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');
    fireEvent.click(screen.getByText('Suresh Babu'));

    await screen.findByText('SB'); // header-band initials for Suresh Babu
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('salespersonId=2'));
  });
});

// ─── Row expand/collapse ─────────────────────────────────────────────────────

describe('SalespersonStatement — row expand/collapse', () => {
  const ROWS_WITH_DETAIL = [
    {
      date: '2026-07-08', openingBalance: 1000, stockGiven: 500, amountPaid: 300, closingBalance: 1200,
      items: [{ brandName: 'Nandini', productName: 'Toned Milk', quantity: 10, unitPrice: 25, totalAmount: 250 }],
      payments: [{ amount: 300, mode: 'Cash' }],
    },
    { date: '2026-07-09', openingBalance: 1200, stockGiven: 0, amountPaid: 0, closingBalance: 1200, items: [], payments: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi({ rows: ROWS_WITH_DETAIL });
  });

  it('a row with dispatch/collection data expands to show the detail on click, and collapses again', async () => {
    await selectRamesh();
    const dateCell = await screen.findByText('08 Jul');
    const row = dateCell.closest('tr');

    expect(screen.queryByText('Stock Dispatched')).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.getByText('Stock Dispatched')).toBeInTheDocument();
    expect(screen.getByText('Nandini Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('₹300.00 via Cash')).toBeInTheDocument();

    fireEvent.click(row);
    expect(screen.queryByText('Stock Dispatched')).not.toBeInTheDocument();
  });

  it('falls back to "Cash" when a payment has no mode recorded', async () => {
    mockApi({ rows: [{
      date: '2026-07-08', openingBalance: 0, stockGiven: 0, amountPaid: 200, closingBalance: -200,
      items: [], payments: [{ amount: 200, mode: null }],
    }] });
    await selectRamesh();
    fireEvent.click((await screen.findByText('08 Jul')).closest('tr'));
    expect(screen.getByText('₹200.00 via Cash')).toBeInTheDocument();
  });

  it('a row with no dispatch/collection data does not expand', async () => {
    await selectRamesh();
    const dateCell = await screen.findByText('09 Jul');
    fireEvent.click(dateCell.closest('tr'));
    expect(screen.queryByText('Stock Dispatched')).not.toBeInTheDocument();
  });

  it('Expand All opens every expandable row; Collapse All closes them', async () => {
    await selectRamesh();
    await screen.findByText('08 Jul');

    fireEvent.click(screen.getByText('Expand All'));
    expect(screen.getByText('Stock Dispatched')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.queryByText('Stock Dispatched')).not.toBeInTheDocument();
  });

  it('does not show the Expand/Collapse All toggle when no row has detail', async () => {
    mockApi({ rows: ROWS });
    await selectRamesh();
    await screen.findByText('Totals');
    expect(screen.queryByText('Expand All')).not.toBeInTheDocument();
  });
});

// ─── Print button ────────────────────────────────────────────────────────────

describe('SalespersonStatement — print', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('is hidden when there is no data, and opens the print URL with the current filters when clicked', async () => {
    mockApi({ rows: [] });
    await selectRamesh();
    await screen.findByText(/No data for this period/i);
    expect(screen.queryByText('Print')).not.toBeInTheDocument();

    mockApi(); // has rows again
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    render(<SalespersonStatement />);
    await screen.findByText('Print');
    fireEvent.click(screen.getByText('Print'));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\/print\/salesperson-statement\?salespersonId=1&from=2026-07-01&to=2026-07-09&type=balance$/),
      '_blank',
    );
    openSpy.mockRestore();
  });
});

// ─── Date filters ────────────────────────────────────────────────────────────

describe('SalespersonStatement — date filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('changing From/To re-fetches the report with the new date range', async () => {
    await selectRamesh();
    await screen.findByText('Totals');

    const [fromInput] = screen.getAllByDisplayValue(/2026-07-0[19]/);
    fireEvent.change(fromInput, { target: { value: '2026-06-01' } });

    await new Promise(r => setTimeout(r, 0));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('from=2026-06-01'));
  });
});

// ─── Balance styling ─────────────────────────────────────────────────────────

describe('SalespersonStatement — outstanding balance styling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a violet "credit" badge when the salesperson has overpaid (negative closing balance)', async () => {
    mockApi({ rows: [{ date: '2026-07-08', openingBalance: 0, stockGiven: 0, amountPaid: 500, closingBalance: -500, items: [], payments: [] }] });
    await selectRamesh();
    const badge = await screen.findByText(/Outstanding:/);
    expect(badge.className).toContain('text-violet-700');
  });

  it('shows a red "owing" badge when the salesperson owes money', async () => {
    mockApi({ rows: [{ date: '2026-07-08', openingBalance: 0, stockGiven: 500, amountPaid: 0, closingBalance: 500, items: [], payments: [] }] });
    await selectRamesh();
    const badge = await screen.findByText(/Outstanding:/);
    expect(badge.className).toContain('text-red-700');
  });

  it('shows an emerald "settled" badge, row, and footer total when the balance is exactly zero', async () => {
    mockApi({ rows: [{ date: '2026-07-08', openingBalance: 0, stockGiven: 500, amountPaid: 500, closingBalance: 0, items: [], payments: [] }] });
    await selectRamesh();

    const badge = await screen.findByText(/Outstanding:/);
    expect(badge.className).toContain('text-emerald-700');

    const dueCell = screen.getByText('08 Jul').closest('tr').querySelector('td:nth-child(5)');
    expect(dueCell.className).toContain('text-emerald-600');

    const totalsRow = screen.getByText('Totals').closest('tr');
    const footerDueCell = totalsRow.querySelectorAll('td')[4];
    expect(footerDueCell.className).toContain('text-emerald-300');
  });
});

// ─── Dispatch Stock Summary tab ─────────────────────────────────────────────

function statementItem(overrides) {
  return {
    brandName: 'Nandini', brandDisplayOrder: 1,
    category: 'Milk', categoryDisplayOrder: 1,
    productName: 'Toned Milk 500ml', displayOrder: 1,
    quantity: 10, unitPrice: 44.5, totalAmount: 445,
    unitType: null, unitSize: null, unitsPerContainer: null, containerType: null,
    ...overrides,
  };
}

describe('SalespersonStatement — Dispatch Stock Summary tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('stays on the Account Statement view by default', async () => {
    await selectRamesh();
    await screen.findByText('Totals');
    expect(screen.queryByText('Grand Total')).not.toBeInTheDocument();
  });

  it('switches to a Brand → Category → Product breakdown, summed across the whole date range', async () => {
    mockApi({
      rows: [
        { date: '2026-07-08', openingBalance: 0, stockGiven: 445, amountPaid: 0, closingBalance: 445, payments: [],
          items: [statementItem({ quantity: 10, totalAmount: 445 })] },
        { date: '2026-07-09', openingBalance: 445, stockGiven: 222.5, amountPaid: 0, closingBalance: 667.5, payments: [],
          items: [statementItem({ quantity: 5, totalAmount: 222.5 })] },
      ],
    });
    await selectRamesh();
    fireEvent.click(screen.getByRole('button', { name: /Dispatch Stock Summary/i }));

    // Brand header, and a category header even though this brand only has
    // one category — always shown, unlike Dairy Stock Summary.
    expect(await screen.findByText(/Nandini/)).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    // Columns: Product / Total Crates / Quantity / Liters / Kgs / Total Price
    // — no per-unit Price column
    expect(screen.getByText('Total Crates')).toBeInTheDocument();
    expect(screen.queryByText('Price', { selector: 'th' })).not.toBeInTheDocument();
    // Product row, summed across both days: 10 + 5 = 15 units, ₹445 + ₹222.50 = ₹667.50
    const productRow = screen.getByText('Toned Milk 500ml').closest('tr');
    expect(productRow.textContent).toContain('15');
    expect(productRow.textContent).toContain('₹667.50');

    // Account-statement-only content is gone
    expect(screen.queryByText('Totals')).not.toBeInTheDocument();
  });

  it('nests multiple brands and categories, each under a grey left-aligned category header, plus a grand total', async () => {
    mockApi({
      rows: [{
        date: '2026-07-08', openingBalance: 0, stockGiven: 0, amountPaid: 0, closingBalance: 0, payments: [],
        items: [
          statementItem({ productName: 'Toned Milk 500ml', category: 'Milk', categoryDisplayOrder: 1, quantity: 10, totalAmount: 445 }),
          statementItem({ productName: 'Curd 200g', category: 'Curd', categoryDisplayOrder: 2, quantity: 4, totalAmount: 50 }),
          statementItem({ brandName: 'Jersey', brandDisplayOrder: 2, productName: 'HTM 1000ml', category: 'Milk', categoryDisplayOrder: 1, quantity: 2, totalAmount: 90 }),
        ],
      }],
    });
    await selectRamesh();
    fireEvent.click(screen.getByRole('button', { name: /Dispatch Stock Summary/i }));

    expect(await screen.findByText(/Nandini/)).toBeInTheDocument();
    expect(screen.getByText(/Jersey/)).toBeInTheDocument();

    // Nandini has two categories (Milk, Curd) — its category header shows,
    // grey and left-aligned, not the old amber styling.
    const categoryHeaderCell = screen.getByText('Curd').closest('td');
    expect(categoryHeaderCell).toHaveClass('text-left', 'text-slate-700');
    expect(categoryHeaderCell.closest('tr')).toHaveClass('bg-slate-100');
    expect(categoryHeaderCell).not.toHaveClass('text-amber-800');

    // Grand total: 10 + 4 + 2 = 16 units, ₹445 + ₹50 + ₹90 = ₹585.00
    const grandTotalRow = screen.getByText('Grand Total').closest('tr');
    expect(grandTotalRow.textContent).toContain('16');
    expect(grandTotalRow.textContent).toContain('₹585.00');
  });

  it('shows an empty-state message when nothing was purchased in the period', async () => {
    mockApi({ rows: [{ date: '2026-07-08', openingBalance: 0, stockGiven: 0, amountPaid: 0, closingBalance: 0, items: [], payments: [] }] });
    await selectRamesh();
    fireEvent.click(screen.getByRole('button', { name: /Dispatch Stock Summary/i }));

    expect(await screen.findByText('No dispatch data for this period')).toBeInTheDocument();
  });

  it('includes the current view in the print link', async () => {
    mockApi({
      rows: [{ date: '2026-07-08', openingBalance: 0, stockGiven: 445, amountPaid: 0, closingBalance: 445, payments: [],
        items: [statementItem()] }],
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    await selectRamesh();
    await screen.findByText('Totals');

    fireEvent.click(screen.getByRole('button', { name: /Dispatch Stock Summary/i }));
    fireEvent.click(screen.getByRole('button', { name: /Print/i }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('type=dispatch'), '_blank');
    openSpy.mockRestore();
  });
});

// ─── getInitials ─────────────────────────────────────────────────────────────

describe('SalespersonStatement — initials avatar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a single-letter initial for a one-word name', async () => {
    mockApi({ salespeople: [{ id: 1, name: 'Cher', route: null }] });
    render(<SalespersonStatement />);
    expect(await screen.findByText('C')).toBeInTheDocument();
  });
});
