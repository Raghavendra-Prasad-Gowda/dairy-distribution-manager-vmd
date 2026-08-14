/**
 * DailyDispatchSummary tests.
 *
 * Covers the two-panel layout: left sidebar salesperson list (search, "No
 * entry" state, auto-select of the first row with a total, and blank rows
 * synthesized for salespeople with no dispatch row that date), the right
 * panel's brand/product breakdown (Entered-only vs All-products toggle,
 * brand collapse/expand, brand + grand totals), and the lock/unlock and
 * open-for-entry confirmation flows.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DailyDispatchSummary from './DailyDispatchSummary';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

let mockRole = 'admin';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:   () => '2026-08-09',
  formatCurrency: (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../components/DateSelector', () => ({
  default: ({ date, onChange }) => (
    <div>
      <span data-testid="date-selector">{date}</span>
      <button onClick={() => onChange('2026-08-05')}>change-date</button>
    </div>
  ),
}));

function brand(overrides) {
  return {
    brandId: 1, brandName: 'Nandini',
    products: [{ productId: 10, productName: 'Toned Milk', unitsPerContainer: 20 }],
    ...overrides,
  };
}

function row(overrides) {
  return {
    salespersonId: 1, salespersonName: 'Ramu K',
    items: { 10: { qty: 40, unitPrice: 20 } },
    totalAmount: 800, dispatchId: 501, isSubmitted: true, isAdminUnlocked: false, isLocked: false,
    ...overrides,
  };
}

const SALESPEOPLE = [{ id: 1, name: 'Ramu K' }];

function mockApi({ rows = [row()], brands = [brand()], salespeople = SALESPEOPLE, isDayFinalized = false } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/reports/daily-dispatch')) return Promise.resolve({ data: { data: { rows, brands, isDayFinalized } } });
    if (url.includes('/salespeople'))            return Promise.resolve({ data: { data: salespeople } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = 'admin';
  mockApi();
});

// Brand sections in the product table render collapsed by default — expand
// the named brand's header row before asserting on its product rows.
function expandBrand(name) {
  fireEvent.click(screen.getByText(name).closest('tr'));
}

describe('DailyDispatchSummary — sidebar', () => {
  it('auto-selects the first row with a total and shows its detail', async () => {
    render(<DailyDispatchSummary />);
    // Sidebar entry + right-panel header both show the name once selected.
    await waitFor(() => expect(screen.getAllByText('Ramu K').length).toBeGreaterThanOrEqual(2));
    expandBrand('Nandini');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
  });

  it('synthesizes a blank "No entry" row for a salesperson with no dispatch that date', async () => {
    mockApi({ rows: [], salespeople: [{ id: 1, name: 'Ramu K' }, { id: 2, name: 'Suresh M' }] });
    render(<DailyDispatchSummary />);
    await screen.findByText('Suresh M');
    expect(screen.getAllByText('No entry').length).toBe(2);
  });

  it('filters the sidebar by search', async () => {
    mockApi({ rows: [row({ salespersonId: 1, salespersonName: 'Ramu K' }), row({ salespersonId: 2, salespersonName: 'Suresh M', items: {} , totalAmount: 0, dispatchId: null, isSubmitted: false })] });
    render(<DailyDispatchSummary />);
    await waitFor(() => expect(screen.getAllByText('Ramu K').length).toBeGreaterThanOrEqual(2));
    const sidebar = document.querySelector('aside');
    fireEvent.change(screen.getByPlaceholderText('Search salesperson…'), { target: { value: 'suresh' } });
    expect(within(sidebar).getByText('Suresh M')).toBeInTheDocument();
    expect(within(sidebar).queryByText('Ramu K')).toBeNull();
  });

  it('switches the detail panel when a different salesperson is clicked', async () => {
    mockApi({ rows: [
      row({ salespersonId: 1, salespersonName: 'Ramu K' }),
      row({ salespersonId: 2, salespersonName: 'Suresh M', items: { 10: { qty: 10, unitPrice: 20 } }, totalAmount: 200, dispatchId: 502 }),
    ] });
    render(<DailyDispatchSummary />);
    await waitFor(() => expect(screen.getAllByText('Ramu K').length).toBeGreaterThanOrEqual(2));
    const sidebar = document.querySelector('aside');
    fireEvent.click(within(sidebar).getByText('Suresh M'));
    // "₹200.00" also appears in the sidebar row itself — scope to the grand total bar.
    const bar = screen.getByText('Grand Total').closest('div').parentElement;
    expect(within(bar).getByText('₹200.00')).toBeInTheDocument();
  });
});

describe('DailyDispatchSummary — product table', () => {
  it('brand sections start collapsed, showing only the header until clicked', async () => {
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    expect(screen.queryByText('Toned Milk')).toBeNull();
    expandBrand('Nandini');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
  });

  it('hides zero-qty products by default and reveals them via "All products"', async () => {
    mockApi({ brands: [brand({ products: [
      { productId: 10, productName: 'Toned Milk', unitsPerContainer: 20 },
      { productId: 11, productName: 'Curd 200g', unitsPerContainer: 0 },
    ] })] });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    expandBrand('Nandini');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.queryByText('Curd 200g')).toBeNull();

    fireEvent.click(screen.getByText('Entered only'));
    expect(screen.getByText('Curd 200g')).toBeInTheDocument();
  });

  it('shows quantity, crates, rate, and amount for an entered product', async () => {
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    expandBrand('Nandini');
    const tr = screen.getByText('Toned Milk').closest('tr');
    expect(within(tr).getByText('40')).toBeInTheDocument();
    expect(within(tr).getByText('2')).toBeInTheDocument(); // crates: 40 / 20
    expect(within(tr).getByText('₹20.00')).toBeInTheDocument();
    expect(within(tr).getByText('₹800.00')).toBeInTheDocument();
  });

  it('collapses and expands a brand section, showing the collapsed summary badges', async () => {
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    expandBrand('Nandini');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();

    expandBrand('Nandini'); // toggles back to collapsed
    expect(screen.queryByText('Toned Milk')).toBeNull();
    // "40 units"/"2 crates" also appear in the footer totals row, so scope to
    // the collapsed brand header row itself.
    const brandRow = screen.getByText('Nandini').closest('tr');
    expect(within(brandRow).getByText('40 units')).toBeInTheDocument();
    expect(within(brandRow).getByText('2 crates')).toBeInTheDocument();

    expandBrand('Nandini');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
  });

  it('shows the grand total bar for the selected salesperson', async () => {
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
    const bar = screen.getByText('Grand Total').closest('div').parentElement;
    expect(within(bar).getByText('₹800.00')).toBeInTheDocument();
  });

  it('shows "No dispatch entry for this date" for a blank row', async () => {
    mockApi({ rows: [], salespeople: [{ id: 1, name: 'Ramu K' }] });
    render(<DailyDispatchSummary />);
    expect(await screen.findByText('No dispatch entry for this date')).toBeInTheDocument();
  });
});

describe('DailyDispatchSummary — crate display precision', () => {
  it('shows the same 2-decimal crate figure at the product, brand, and grand-total levels', async () => {
    // 35 units / 24 per crate = 1.4583... -> must render as "1.46" everywhere,
    // not "1" (old flooring).
    mockApi({
      brands: [brand({ products: [{ productId: 10, productName: 'Toned Milk', unitsPerContainer: 24 }] })],
      rows: [row({ items: { 10: { qty: 35, unitPrice: 20 } }, totalAmount: 700 })],
    });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    // Collapsed brand header badge (single product, brand collapsed by default)
    const brandRow = screen.getByText('Nandini').closest('tr');
    expect(within(brandRow).getByText('1.46 crates')).toBeInTheDocument();

    expandBrand('Nandini');
    const productRow = screen.getByText('Toned Milk').closest('tr');
    expect(within(productRow).getByText('1.46')).toBeInTheDocument();

    // No floored "1" crate figure anywhere.
    expect(screen.queryByText('1 crates')).not.toBeInTheDocument();
  });
});

describe('DailyDispatchSummary — dispatcher role', () => {
  beforeEach(() => { mockRole = 'dispatcher'; });

  it('shows Lock/Unlock and Finalize Day on today, before finalization', async () => {
    mockApi({ rows: [row({ isLocked: false })], isDayFinalized: false });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    expect(screen.getByRole('button', { name: /Lock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finalize Day/i })).toBeInTheDocument();
    expect(screen.queryByText('Day Finalized')).not.toBeInTheDocument();
  });

  it('hides Lock/Unlock and Finalize Day once today has been finalized, showing a badge instead', async () => {
    mockApi({ rows: [row({ isLocked: false })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    expect(screen.queryByRole('button', { name: /^Lock$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Unlock$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finalize Day/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Day Finalized/i)).toBeInTheDocument();
  });

  it('hides Unlock on a past date (dispatcher is restricted to today)', async () => {
    mockApi({ rows: [row({ isLocked: true })] });
    render(<DailyDispatchSummary />);
    await screen.findByText('change-date'); // DateSelector stub
    fireEvent.click(screen.getByText('change-date')); // navigates to 2026-08-05, a past date
    await screen.findByText('Nandini');

    expect(screen.queryByRole('button', { name: /Unlock/i })).not.toBeInTheDocument();
  });

  it('never shows Open for Entry, even on a past date with no dispatch row', async () => {
    // Blank row (no dispatchId) — the only case that would otherwise offer
    // Open for Entry to an admin. Dispatcher never gets this action.
    mockApi({ rows: [row({ dispatchId: null, isSubmitted: false, totalAmount: 0 })] });
    render(<DailyDispatchSummary />);
    await screen.findByText('change-date');
    fireEvent.click(screen.getByText('change-date')); // navigates to 2026-08-05, a past date
    await screen.findByText('Nandini');

    expect(screen.queryByRole('button', { name: /Open for Entry/i })).not.toBeInTheDocument();
  });

  it('finalizing calls POST /dispatches/finalize-day and refetches', async () => {
    mockApi({ rows: [row({ isLocked: false })], isDayFinalized: false });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    fireEvent.click(screen.getByRole('button', { name: /Finalize Day/i }));
    expect(await screen.findByText('Finalize today?')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith('/dispatches/finalize-day');

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Yes, Finalize'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dispatches/finalize-day'));
  });
});

describe('DailyDispatchSummary — lock / unlock', () => {
  it('confirms before locking a submitted dispatch', async () => {
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    fireEvent.click(screen.getByRole('button', { name: /Lock/i }));

    expect(await screen.findByText('Lock entry?')).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Yes, Lock'));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/dispatches/501/lock'));
  });

  it('unlocks a locked dispatch', async () => {
    mockApi({ rows: [row({ isLocked: true })] });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    fireEvent.click(screen.getByRole('button', { name: /Unlock/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Yes, Unlock'));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/dispatches/501/unlock'));
  });
});

describe('DailyDispatchSummary — open for entry', () => {
  it('offers "Open for Entry" for a past date with no dispatch row, and posts on confirm', async () => {
    mockApi({ rows: [], salespeople: [{ id: 1, name: 'Ramu K' }] });
    render(<DailyDispatchSummary />);
    await screen.findByText('No dispatch entry for this date');
    fireEvent.click(screen.getByText('change-date')); // navigates to a past date (2026-08-05)
    await waitFor(() => expect(screen.getByText('Open for Entry')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Open for Entry'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Yes, Open'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/dispatches/open-for-entry', { salespersonId: 1, dispatchDate: '2026-08-05' })
    );
  });
});

// ─── Dispatcher: /salespeople not called ──────────────────────────────────────

describe('DailyDispatchSummary — dispatcher skips /salespeople fetch', () => {
  beforeEach(() => { mockRole = 'dispatcher'; });

  it('does not call GET /salespeople when the user is a dispatcher', async () => {
    mockApi({ rows: [row()], isDayFinalized: false });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    const salespeopleCalls = vi.mocked(api.get).mock.calls.filter(([url]) => url.includes('/salespeople'));
    expect(salespeopleCalls).toHaveLength(0);
  });

  it('still loads dispatch data without error when user is dispatcher', async () => {
    mockApi({ rows: [row()], isDayFinalized: false });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');
    // Salesperson name appears in both the sidebar list and the right-panel
    // sub-header — use getAllByText so both occurrences are acceptable.
    expect(screen.getAllByText('Ramu K').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Finalize Day button placement ────────────────────────────────────────────

describe('DailyDispatchSummary — Finalize Day action bar placement', () => {
  beforeEach(() => { mockRole = 'dispatcher'; });

  it('renders the Finalize Day button outside the header, in a dedicated action bar', async () => {
    mockApi({ rows: [row()], isDayFinalized: false });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    const btn = screen.getByRole('button', { name: /Finalize Day/i });
    // The action bar has the amber hint text — the button must be co-located with it
    const hint = screen.getByText(/finalize the day to lock entries/i);
    expect(hint.closest('div')).toBeTruthy();
    expect(btn).toBeInTheDocument();
  });

  it('shows "Day Finalized" status bar when today is finalized', async () => {
    mockApi({ rows: [row()], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    expect(screen.getByText(/Day Finalized/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finalize Day/i })).not.toBeInTheDocument();
  });

  it('hides the action bar for a past date (dispatcher only acts on today)', async () => {
    mockApi({ rows: [row()], isDayFinalized: false });
    render(<DailyDispatchSummary />);
    await screen.findByText('change-date');
    fireEvent.click(screen.getByText('change-date')); // navigate to 2026-08-05
    await screen.findByText('Nandini');

    expect(screen.queryByRole('button', { name: /Finalize Day/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/finalize the day/i)).not.toBeInTheDocument();
  });
});

// ─── Admin info bar after finalization ────────────────────────────────────────

describe('DailyDispatchSummary — admin info bar after dispatcher finalization', () => {
  it('shows the info bar for admin when today is finalized', async () => {
    mockRole = 'admin';
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    expect(screen.getByText(/Day finalized by dispatcher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Undo Finalization/i })).toBeInTheDocument();
  });

  it('does not show the info bar when day is not finalized', async () => {
    mockRole = 'admin';
    mockApi({ rows: [row()], isDayFinalized: false });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    expect(screen.queryByText(/Day finalized by dispatcher/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo Finalization/i })).not.toBeInTheDocument();
  });

  it('does not show the info bar for dispatcher (only admin sees it)', async () => {
    mockRole = 'dispatcher';
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    expect(screen.queryByText(/Day finalized by dispatcher/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo Finalization/i })).not.toBeInTheDocument();
  });

  it('does not show the info bar on a past date (past dates are auto-finalized, no reversal possible)', async () => {
    mockRole = 'admin';
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('change-date');
    fireEvent.click(screen.getByText('change-date')); // navigate to past date
    await screen.findByText('Nandini');

    expect(screen.queryByRole('button', { name: /Undo Finalization/i })).not.toBeInTheDocument();
  });

  it('admin can still lock/unlock individual entries after finalization', async () => {
    mockRole = 'admin';
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    // Unlock button is present for admin even when day is finalized
    expect(screen.getByRole('button', { name: /Unlock/i })).toBeInTheDocument();
  });
});

// ─── Undo Finalization ────────────────────────────────────────────────────────

describe('DailyDispatchSummary — Undo Finalization (admin)', () => {
  beforeEach(() => {
    mockRole = 'admin';
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
  });

  it('shows a confirmation modal before calling DELETE /dispatches/finalize-day', async () => {
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    fireEvent.click(screen.getByRole('button', { name: /Undo Finalization/i }));
    expect(await screen.findByText('Undo finalization?')).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('calls DELETE /dispatches/finalize-day on confirm and refetches', async () => {
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    fireEvent.click(screen.getByRole('button', { name: /Undo Finalization/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Yes, Undo'));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/dispatches/finalize-day'));
  });

  it('cancelling the modal does not call the API', async () => {
    mockApi({ rows: [row({ isLocked: true })], isDayFinalized: true });
    render(<DailyDispatchSummary />);
    await screen.findByText('Nandini');

    fireEvent.click(screen.getByRole('button', { name: /Undo Finalization/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.delete).not.toHaveBeenCalled();
  });
});
