/**
 * StockBalanceSummary tests.
 *
 * Covers the label renames (Received → Supply, Remaining → Shortage) and the
 * footer row order (Dispatched → Shortage → Supply).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StockBalanceSummary from './StockBalanceSummary';
import api from '../../api/axios';

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate: () => '2026-07-09',
}));

vi.mock('../../components/DateSelector', () => ({
  default: ({ date }) => <span data-testid="date-selector">{date}</span>,
}));

vi.mock('../../components/BrandTabs', () => ({
  default: () => <div data-testid="brand-tabs" />,
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
  TumblerSpinner: () => <span data-testid="tumbler" />,
}));

function mockApi({ availability = [], dispatch = null } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/stock-receipts/availability')) return Promise.resolve({ data: { data: availability } });
    if (url.includes('/reports/daily-dispatch'))     return Promise.resolve({ data: { data: dispatch } });
    return Promise.resolve({ data: { data: [] } });
  });
}

const DISPATCH_DATA = {
  date: '2026-07-09',
  brands: [{
    brandId: 1,
    brandName: 'Nandini',
    products: [{ productId: 10, productName: 'Milk 500ml', category: 'Milk', unitsPerContainer: 20 }],
  }],
  rows: [{
    salespersonId: 1,
    salespersonName: 'Ramesh',
    items: { 10: { qty: 40 } },
    totalAmount: 880,
  }],
  totals: { 10: 40 },
};

describe('StockBalanceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Supply and Shortage chips instead of Received and Remaining', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    // Chips + footer rows both use these labels
    expect(screen.getAllByText('Supply').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shortage').length).toBeGreaterThan(0);
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
    expect(screen.queryByText('Remaining')).not.toBeInTheDocument();
  });

  it('renders footer rows in Dispatched → Shortage → Supply → Crates order', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50, unitsPerContainer: 20 }],
      dispatch: DISPATCH_DATA,
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const footerLabels = [...container.querySelectorAll('tfoot tr td:first-child')]
      .map(td => td.textContent.trim());
    expect(footerLabels).toEqual(['Dispatched', 'Shortage', 'Supply', 'Crates Received', 'Crates Dispatched']);
  });

  it('computes shortage as supply minus dispatched', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA, // 40 dispatched
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const shortageRow = [...container.querySelectorAll('tfoot tr')]
      .find(tr => tr.textContent.includes('Shortage'));
    // 50 received − 40 dispatched = 10 (per-product cell and grand total)
    expect(shortageRow.textContent).toContain('10');
  });

  it('shows empty state when there is no dispatch data', async () => {
    mockApi({ availability: [], dispatch: { date: '2026-07-09', brands: [], rows: [], totals: {} } });
    render(<StockBalanceSummary />);
    expect(await screen.findByText(/No dispatch data for this date/i)).toBeInTheDocument();
  });
});

describe('StockBalanceSummary — crate display precision', () => {
  // 24 per crate, not a divisor of either quantity, so every crate figure on
  // this page must agree at 2 decimals rather than flooring or 1-decimal
  // rounding: 35 received -> 1.46, 15 dispatched -> 0.63, shortage -> 0.83.
  const FRACTIONAL_DISPATCH = {
    date: '2026-07-09',
    brands: [{
      brandId: 1,
      brandName: 'Nandini',
      products: [{ productId: 10, productName: 'Milk 500ml', category: 'Milk', unitsPerContainer: 24 }],
    }],
    rows: [{
      salespersonId: 1,
      salespersonName: 'Ramesh',
      items: { 10: { qty: 15 } },
      totalAmount: 330,
    }],
    totals: { 10: 15 },
  };

  it('shows the same 2-decimal crate figures at the row, column, and grand-total levels', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 35, unitsPerContainer: 24 }],
      dispatch: FRACTIONAL_DISPATCH,
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');

    // Per-salesperson row: 15 / 24 = 0.625 -> "0.63"
    const ramesRow = screen.getByText('Ramesh').closest('tr');
    expect(within(ramesRow).getByText('0.63')).toBeInTheDocument();

    // Chips + footer: cratesReceived 35/24=1.46, cratesDispatched 15/24=0.63, shortage 0.83
    expect(screen.getAllByText('1.46').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.63').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.83').length).toBeGreaterThan(0);

    // No stray 1-decimal or floored artifacts anywhere on the page.
    expect(container.textContent).not.toMatch(/\b1\.5\b/);
    expect(screen.queryByText('0.6')).not.toBeInTheDocument();
  });
});

describe('StockBalanceSummary — dispatcher access', () => {
  // This page never reads role — it's purely a consumer of whatever the API
  // returns, so a dispatcher (who can reach it, per the route/API gating)
  // sees the exact same read-only page an admin does. Pinning that here
  // guards against someone later adding role-gating logic into this
  // component itself instead of at the route/API layer.
  it('renders identically for a dispatcher — no role-specific branching in this component', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    expect(screen.getAllByText('Supply').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shortage').length).toBeGreaterThan(0);
  });

  // GET /brands is admin-only (routes/brands.js), while this page is reached
  // by dispatchers too. It must derive its brand tabs from the daily-dispatch
  // response instead of calling /brands directly — otherwise a dispatcher's
  // 403 on that call broke the whole page ("Failed to load brands").
  it('never calls the admin-only /brands endpoint', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const calledUrls = vi.mocked(api.get).mock.calls.map(([url]) => url);
    expect(calledUrls.some(url => url.includes('/brands'))).toBe(false);
  });
});
