/**
 * StockSummary tests.
 *
 * This report has no brand tabs of its own — standalone mode aggregates
 * receipts across all brands (each gets its own header row in the table);
 * shell mode scopes to one brand via `shellActiveBrandId`. Covers standalone
 * vs shell mode, the brand → category → product aggregation (crates/liters/
 * kgs derived from unit size + container type), the category sub-header
 * (only shown when a brand has more than one category), single- vs
 * multi-route products (badge vs. expandable "N routes" row), Expand/
 * Collapse All, the route filter's refetch, the toolbar totals, the Print
 * URL, the empty state, and error handling.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StockSummary from './StockSummary';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09', getFirstDayOfMonth: () => '2026-08-01' };
});

const ROUTES = [{ id: 100, routeNumber: 'R1' }, { id: 200, routeNumber: 'R2' }];

function receipt(overrides) {
  return {
    brandName: 'Nandini', brandDisplayOrder: 0,
    category: 'Milk', categoryDisplayOrder: 0,
    productName: 'Toned Milk',
    unitsPerContainer: 20, containerType: 'crate', unitSize: 500, unitSizeGrams: null,
    costPrice: 20, displayOrder: 0,
    routeNumber: 'R1', quantity: 40, amount: 800,
    ...overrides,
  };
}

function summaryData({ receipts = [receipt()], grandTotalReceived = 800, grandTotalDispatched = 300 } = {}) {
  return { rows: [{ receipts }], grandTotalReceived, grandTotalDispatched };
}

function mockApi({ routes = ROUTES, data = summaryData() } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/routes'))                 return Promise.resolve({ data: { data: routes } });
    if (url.includes('/reports/stock-summary'))   return Promise.resolve({ data: { data } });
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
  vi.spyOn(window, 'open').mockImplementation(() => {});
});

describe('StockSummary — standalone vs shell mode', () => {
  it('shows the page header when standalone', async () => {
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    expect(screen.getByText('Stock Summary')).toBeInTheDocument();
  });

  it('hides the header and scopes the fetch to the shell brand', async () => {
    render(<StockSummary shellActiveBrandId={7} />);
    await screen.findByText('Toned Milk');
    expect(screen.queryByText('Stock Summary')).toBeNull();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('brandId=7'));
  });
});

describe('StockSummary — empty and error states', () => {
  it('shows "No data for this period" when there are no receipts', async () => {
    mockApi({ data: summaryData({ receipts: [] }) });
    render(<StockSummary />);
    expect(await screen.findByText('No data for this period')).toBeInTheDocument();
  });

  it('shows the server error message on a failed fetch', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/routes')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject({ response: { data: { error: 'Invalid date range' } } });
    });
    render(<StockSummary />);
    expect(await screen.findByText('Invalid date range')).toBeInTheDocument();
  });
});

describe('StockSummary — toolbar totals', () => {
  it('shows received, dispatched, and net figures', async () => {
    // Values deliberately distinct from the fixture receipt's own totalValue (800)
    // to avoid colliding with the product row's own figure in the table below.
    mockApi({ data: summaryData({ grandTotalReceived: 1234, grandTotalDispatched: 345 }) });
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    expect(screen.getByText('₹1,234.00')).toBeInTheDocument();
    expect(screen.getByText('₹345.00')).toBeInTheDocument();
    expect(screen.getByText('₹889.00')).toBeInTheDocument(); // net
  });
});

describe('StockSummary — aggregation', () => {
  it('shows a brand header naming the product count', async () => {
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('1 product')).toBeInTheDocument();
  });

  it('shows crates/liters and unit price for a crate product with a single route', async () => {
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    const row = screen.getByText('Toned Milk').closest('tr');
    expect(within(row).getByText('R1')).toBeInTheDocument(); // single-route badge
    expect(within(row).getByText('2')).toBeInTheDocument();  // crates: 40 / 20
    expect(within(row).getByText('40')).toBeInTheDocument(); // quantity
    expect(within(row).getByText('20')).toBeInTheDocument(); // liters: 40*500/1000
    expect(within(row).getByText('₹20')).toBeInTheDocument();
    expect(within(row).getByText('₹800.00')).toBeInTheDocument();
  });

  it('shows a category sub-header only when the brand has more than one category', async () => {
    mockApi({ data: summaryData({
      receipts: [
        receipt({ productName: 'Toned Milk', category: 'Milk', categoryDisplayOrder: 0 }),
        receipt({ productName: 'Curd 200g', category: 'Curd', categoryDisplayOrder: 1, containerType: null, unitSize: null, unitSizeGrams: 200, costPrice: 10, quantity: 5, amount: 50, routeNumber: 'R1' }),
      ],
    }) });
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
  });

  it('collapses a multi-route product to "N routes" and expands it to per-route sub-rows', async () => {
    mockApi({ data: summaryData({
      receipts: [
        receipt({ routeNumber: 'R1', quantity: 20, amount: 400 }),
        receipt({ routeNumber: 'R2', quantity: 20, amount: 400 }),
      ],
    }) });
    render(<StockSummary />);
    await screen.findByText('Toned Milk');

    // "R1"/"R2" also appear as <option>s in the route filter select, so scope
    // to the route badge <span> the expanded sub-rows render them into.
    const routeBadge = (text) => screen.getAllByText(text).find(el => el.tagName === 'SPAN');
    expect(screen.getByText('2 routes')).toBeInTheDocument();
    expect(routeBadge('R2')).toBeUndefined();

    fireEvent.click(screen.getByText('Toned Milk').closest('tr'));
    expect(routeBadge('R1')).toBeInTheDocument();
    expect(routeBadge('R2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('2 routes').closest('tr'));
    expect(routeBadge('R2')).toBeUndefined();
  });

  it('Expand All / Collapse All toggles every multi-route product', async () => {
    mockApi({ data: summaryData({
      receipts: [
        receipt({ routeNumber: 'R1', quantity: 20, amount: 400 }),
        receipt({ routeNumber: 'R2', quantity: 20, amount: 400 }),
      ],
    }) });
    render(<StockSummary />);
    await screen.findByText('2 routes');
    const routeBadge = (text) => screen.getAllByText(text).find(el => el.tagName === 'SPAN');

    fireEvent.click(screen.getByText('Expand All'));
    expect(routeBadge('R1')).toBeInTheDocument();
    expect(routeBadge('R2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.getByText('2 routes')).toBeInTheDocument();
  });
});

describe('StockSummary — route filter', () => {
  it('refetches with the routeId param when a route is selected', async () => {
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    fireEvent.change(screen.getByDisplayValue('All Routes'), { target: { value: '100' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('routeId=100')));
  });
});

describe('StockSummary — print', () => {
  it('opens the print URL with the current filters', async () => {
    render(<StockSummary />);
    await screen.findByText('Toned Milk');
    fireEvent.click(screen.getByText('Print'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/print/stock-summary?from=2026-08-01&to=2026-08-09'),
      '_blank'
    );
  });
});
