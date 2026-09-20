/**
 * SalespersonStatement tests.
 *
 * Covers the salesperson header band (avatar + name + route shown when a
 * salesperson is selected) and the totals footer row (sum of Given and
 * Collected, final Due).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalespersonStatement from './SalespersonStatement';
import api from '../../api/axios';

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:       () => '2026-07-09',
  getFirstDayOfMonth: () => '2026-07-01',
  formatCurrency:     (v) => `₹${Number(v).toFixed(2)}`,
  // Identity is enough here — the Bills tab's history table only needs a
  // callable formatter, and no test asserts on its exact display format.
  formatDateShort:    (d) => d,
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

    // Each brand's header row is colored with its own brand identity (same
    // as Dairy Settings' Brands list) — not a uniform slate.
    expect(screen.getByText(/Nandini/).closest('tr')).toHaveClass('bg-nandini-700');
    expect(screen.getByText(/Jersey/).closest('tr')).toHaveClass('bg-jersey-700');

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

// ─── Sidebar collapse/expand ────────────────────────────────────────────────

describe('SalespersonStatement — sidebar collapse/expand', () => {
  const TWO_SP = [
    { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
    { id: 2, name: 'Suresh Babu', route: 'Route 5' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi({ salespeople: TWO_SP });
  });

  it('hides the salesperson list when the collapse rail is clicked, and restores it on click again', async () => {
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');
    expect(screen.getByRole('button', { name: /Suresh Babu/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hide salesperson list/i }));
    expect(screen.queryByRole('button', { name: /Suresh Babu/ })).not.toBeInTheDocument();
    // Search box (also inside the collapsible panel) is hidden too.
    expect(screen.queryByPlaceholderText('Search name or route…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show salesperson list/i }));
    expect(screen.getByRole('button', { name: /Suresh Babu/ })).toBeInTheDocument();
  });

  it('keeps the selected salesperson and statement visible while the sidebar is collapsed', async () => {
    render(<SalespersonStatement />);
    await screen.findAllByText('Ramesh Kumar');

    fireEvent.click(screen.getByRole('button', { name: /Hide salesperson list/i }));
    // Header band + statement content still render.
    expect(screen.getAllByText('Ramesh Kumar').length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('Totals')).toBeInTheDocument();
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

// ─── Top-ups ─────────────────────────────────────────────────────────────────

/**
 * A top-up is a pre-existing due an admin loaded: closing = opening +
 * stockGiven + topUpAmount − amountPaid. It used to be absent from this
 * report entirely, so "given − collected" disagreed with the outstanding by
 * exactly the top-up, and the top-up itself was listed among the collections.
 */
describe('SalespersonStatement — top-ups', () => {
  const TOPUP_ROWS = [
    {
      date: '2026-07-08', openingBalance: 0, stockGiven: 720000, topUpAmount: 1500,
      amountPaid: 520000, closingBalance: 201500, items: [],
      payments: [{ amount: 520000, mode: 'Cash', ref: 'R1' }],
      topUps:   [{ amount: 1500, notes: 'old dues', createdBy: 'raghav' }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi({ rows: TOPUP_ROWS });
  });

  it('shows an Old Balance column whose total explains the gap to the outstanding', async () => {
    render(<SalespersonStatement />);
    await screen.findByText('Totals');

    expect(screen.getByRole('columnheader', { name: 'Old Balance' })).toBeInTheDocument();
    // Given 720000 + top-up 1500 − collected 520000 = outstanding 201500.
    expect(screen.getAllByText('₹1500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₹201500.00').length).toBeGreaterThanOrEqual(1);
  });

  it('lists the top-up separately from collections when the row is expanded', async () => {
    render(<SalespersonStatement />);
    await screen.findByText('Totals');

    fireEvent.click(screen.getByText('08 Jul'));

    expect(await screen.findByText('Old Balance Added')).toBeInTheDocument();
    expect(screen.getByText(/₹1500\.00 by raghav — old dues/)).toBeInTheDocument();
    // The collection is still shown under Collections, and only once.
    expect(screen.getByText('₹520000.00 via Cash')).toBeInTheDocument();
  });

  it('expands a day that has only a top-up and no dispatch or collection', async () => {
    mockApi({
      rows: [{
        date: '2026-07-08', openingBalance: 0, stockGiven: 0, topUpAmount: 1500,
        amountPaid: 0, closingBalance: 1500, items: [], payments: [],
        topUps: [{ amount: 1500, notes: null, createdBy: 'raghav' }],
      }],
    });
    render(<SalespersonStatement />);
    await screen.findByText('Totals');

    fireEvent.click(screen.getByText('08 Jul'));
    expect(await screen.findByText('Old Balance Added')).toBeInTheDocument();
  });

  it('hides the Old Balance column entirely when there are no top-ups', async () => {
    mockApi();
    render(<SalespersonStatement />);
    await screen.findByText('Totals');

    expect(screen.queryByRole('columnheader', { name: 'Old Balance' })).not.toBeInTheDocument();
  });
});

// ─── Bills tab ───────────────────────────────────────────────────────────────

/**
 * Bill generation lives as a third tab on this page instead of a standalone
 * page, precisely so it can reuse the sidebar's salesperson search/selection
 * and the page's own From/To filters rather than duplicating either — these
 * tests exercise that sharing (switching salesperson or dates while on the
 * Bills tab) alongside the generate/preview/history/delete flows themselves.
 */
const BILL_LINES = [
  { label: 'MILK',           unit: 'ltr', quantity: 3325, rate: 52, amount: 172900 },
  { label: 'CURD',           unit: 'ltr', quantity: 2351, rate: 54, amount: 126954 },
  { label: 'GHEE',           unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'PANNEER / KOVA', unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'BUTTER',         unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'OTHERS',         unit: null, quantity: null, rate: null, amount: 0 },
];

const BILL_PREVIEW = {
  salespersonId: 1, salespersonName: 'Ramesh Kumar',
  from: '2026-07-01', to: '2026-07-09',
  lines: BILL_LINES, totalAmount: 299854,
};

const EMPTY_BILL_PREVIEW = {
  ...BILL_PREVIEW,
  lines: BILL_LINES.map((l) => ({ ...l, quantity: null, rate: null, unit: null, amount: 0 })),
  totalAmount: 0,
};

const ISSUED_BILL = {
  id: 7, billNumber: 799, poNumber: '798', partyName: 'A.T & S',
  salespersonName: 'Ramesh Kumar', fromDate: '2026-07-01', toDate: '2026-07-09',
  totalAmount: 299854, lines: BILL_LINES,
};

function mockBillsApi({ rows = ROWS, salespeople = SALESPEOPLE, billPreview = BILL_PREVIEW, bills = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/reports/salesperson-statement')) return Promise.resolve({ data: { data: rows } });
    if (url === '/bills/preview') return Promise.resolve({ data: { data: billPreview } });
    if (url === '/bills')         return Promise.resolve({ data: { data: bills } });
    if (url.includes('/salespeople')) return Promise.resolve({ data: { data: salespeople } });
    return Promise.resolve({ data: { data: [] } });
  });
}

async function selectRameshAndOpenBills() {
  render(<SalespersonStatement />);
  await screen.findAllByText('Ramesh Kumar');
  fireEvent.click(screen.getByRole('button', { name: 'Bills' }));
}

describe('SalespersonStatement — Bills tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBillsApi();
  });

  it('previews the six fixed rows for the sidebar-selected salesperson and the page\'s date range', async () => {
    await selectRameshAndOpenBills();

    expect(await screen.findByText('MILK')).toBeInTheDocument();
    for (const label of ['CURD', 'GHEE', 'PANNEER / KOVA', 'BUTTER', 'OTHERS']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('52/ltr')).toBeInTheDocument();
    expect(screen.getByText('₹172900.00')).toBeInTheDocument();
    expect(screen.getByText('₹299854.00')).toBeInTheDocument();

    expect(api.get).toHaveBeenCalledWith('/bills/preview', {
      params: { salespersonId: '1', from: '2026-07-01', to: '2026-07-09' },
    });
  });

  it('re-previews when a different salesperson is picked in the sidebar', async () => {
    mockBillsApi({
      salespeople: [
        { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
        { id: 2, name: 'Suresh Babu', route: 'Route 5' },
      ],
    });
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');

    fireEvent.click(screen.getByRole('button', { name: /Suresh Babu/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/bills/preview', {
      params: { salespersonId: '2', from: '2026-07-01', to: '2026-07-09' },
    }));
  });

  it('re-previews when the page\'s shared From/To filters change', async () => {
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');

    const [fromInput] = screen.getAllByDisplayValue(/2026-07-0[19]/);
    fireEvent.change(fromInput, { target: { value: '2026-06-01' } });

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/bills/preview', {
      params: { salespersonId: '1', from: '2026-06-01', to: '2026-07-09' },
    }));
  });

  it('blocks generating and explains when nothing was dispatched', async () => {
    mockBillsApi({ billPreview: EMPTY_BILL_PREVIEW });
    await selectRameshAndOpenBills();

    expect(await screen.findByText(/nothing to bill/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate bill/i })).toBeDisabled();
  });

  it('posts the shared period and opens the printable bill', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: ISSUED_BILL } });
    vi.stubGlobal('open', vi.fn());
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');

    fireEvent.change(screen.getByPlaceholderText('Ramesh Kumar'), { target: { value: 'A.T & S' } });
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: '798' } });
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bills', {
      salespersonId: 1, from: '2026-07-01', to: '2026-07-09', partyName: 'A.T & S', poNumber: '798',
    }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('/print/bill?id=7', '_blank'));
    expect(notify).toHaveBeenCalledWith('Bill #799 generated', 'success');
  });

  it('omits M/s and PO No when left blank', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: ISSUED_BILL } });
    vi.stubGlobal('open', vi.fn());
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');

    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bills', {
      salespersonId: 1, from: '2026-07-01', to: '2026-07-09',
    }));
  });

  it('adds the new bill to the history without re-fetching it', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: ISSUED_BILL } });
    vi.stubGlobal('open', vi.fn());
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');

    const getsBefore = vi.mocked(api.get).mock.calls.filter(([url]) => url === '/bills').length;
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    expect(await screen.findByText('#799')).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === '/bills').length).toBe(getsBefore);
  });

  it('notifies when issuing fails', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'No stock was dispatched in this period' } } });
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');

    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('No stock was dispatched in this period', 'error'));
  });

  it('shows the per-salesperson history, scoped by the sidebar selection', async () => {
    mockBillsApi({ bills: [ISSUED_BILL] });
    await selectRameshAndOpenBills();

    expect(await screen.findByText('#799')).toBeInTheDocument();
    expect(screen.getByText('A.T & S')).toBeInTheDocument();
    expect(screen.getByText(/issued to Ramesh Kumar/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/bills', { params: { salespersonId: '1' } });
  });

  it('shows an empty state when the salesperson has no bills yet', async () => {
    mockBillsApi({ bills: [] });
    await selectRameshAndOpenBills();
    expect(await screen.findByText('No bills generated yet')).toBeInTheDocument();
  });

  it('re-fetches the history when a different salesperson is picked', async () => {
    mockBillsApi({
      salespeople: [
        { id: 1, name: 'Ramesh Kumar', route: 'Route 3' },
        { id: 2, name: 'Suresh Babu', route: 'Route 5' },
      ],
      bills: [ISSUED_BILL],
    });
    await selectRameshAndOpenBills();
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /Suresh Babu/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/bills', { params: { salespersonId: '2' } }));
  });

  it('reprints a bill from the history', async () => {
    mockBillsApi({ bills: [ISSUED_BILL] });
    vi.stubGlobal('open', vi.fn());
    await selectRameshAndOpenBills();
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /print bill #799/i }));
    expect(window.open).toHaveBeenCalledWith('/print/bill?id=7', '_blank');
  });

  it('deletes a bill after confirmation', async () => {
    mockBillsApi({ bills: [ISSUED_BILL] });
    vi.mocked(api.delete).mockResolvedValue({ data: { data: {} } });
    await selectRameshAndOpenBills();
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /delete bill #799/i }));
    expect(await screen.findByText(/Delete bill #799/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/bills/7'));
    await waitFor(() => expect(screen.queryByText('#799')).not.toBeInTheDocument());
    expect(notify).toHaveBeenCalledWith('Bill #799 deleted', 'success');
  });

  it('notifies when deleting fails', async () => {
    mockBillsApi({ bills: [ISSUED_BILL] });
    vi.mocked(api.delete).mockRejectedValue({ response: { data: { error: 'Bill not found' } } });
    await selectRameshAndOpenBills();
    await screen.findByText('#799');

    fireEvent.click(screen.getByRole('button', { name: /delete bill #799/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Bill not found', 'error'));
  });

  it('hides the header Print button on the Bills tab (printing happens per-bill in the history table)', async () => {
    mockBillsApi({ bills: [ISSUED_BILL] });
    await selectRameshAndOpenBills();
    await screen.findByText('MILK');
    expect(screen.queryByText('Print')).not.toBeInTheDocument();
  });
});
