/**
 * StockSummaryPrint tests.
 *
 * Covers reading from/to/brandId/routeId into the fetch URL, the brand →
 * category → product aggregation (mirrors StockSummary.jsx's own logic),
 * the category sub-header appearing only with multiple categories, the
 * GRAND TOTAL footer, loading/error states, and auto/manual print.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StockSummaryPrint from './StockSummaryPrint';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

function receipt(overrides) {
  return {
    brandName: 'Nandini', brandDisplayOrder: 0,
    category: 'Milk', categoryDisplayOrder: 0,
    productName: 'Toned Milk',
    unitsPerContainer: 20, containerType: 'crate', unitSize: 500, unitSizeGrams: null,
    costPrice: 20, displayOrder: 0,
    quantity: 40, amount: 800,
    ...overrides,
  };
}

function summaryData({ receipts = [receipt()], grandTotalReceived = 800, grandTotalDispatched = 300 } = {}) {
  return { rows: [{ receipts }], grandTotalReceived, grandTotalDispatched };
}

function mockApi(data = summaryData()) {
  vi.mocked(api.get).mockResolvedValue({ data: { data } });
}

function renderWithParams(qs) {
  return render(
    <MemoryRouter initialEntries={[`/print/stock-summary?${qs}`]}>
      <StockSummaryPrint />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi();
  vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StockSummaryPrint — fetch', () => {
  it('reads from/to/brandId/routeId into the fetch URL', async () => {
    renderWithParams('from=2026-08-01&to=2026-08-09&brandId=1&routeId=100');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/stock-summary?from=2026-08-01&to=2026-08-09&brandId=1&routeId=100')
    );
  });

  it('shows the route banner when routeId + routeNumber are present', async () => {
    renderWithParams('from=2026-08-05&to=2026-08-05&brandId=1&routeId=100&routeNumber=R1');
    expect(await screen.findByText('Route: R1')).toBeInTheDocument();
  });
});

describe('StockSummaryPrint — states', () => {
  it('shows "Loading…" before data resolves', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message on a failed fetch', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Failed to load report')).toBeInTheDocument();
  });
});

describe('StockSummaryPrint — aggregation', () => {
  it('shows the brand row with item count and the product row beneath it', async () => {
    renderWithParams('from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText(/Nandini/)).toBeInTheDocument();
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText(/1 items/)).toBeInTheDocument();
  });

  // Same per-brand color identity as Dairy Settings' Brands list and the
  // Dispatch Stock Summary report — not a uniform slate.
  it("colors the brand row with that brand's own color", async () => {
    renderWithParams('from=2026-08-05&to=2026-08-05');
    const row = (await screen.findByText(/Nandini/)).closest('tr');
    expect(row).toHaveStyle({ '--brand-color': '#b45309' });
  });

  // Regression: tr:nth-child(even) td (specificity 0,1,2) used to outrank
  // .brand-row td (0,1,1), so a brand header landing on an even row — the
  // second brand onwards — was repainted #f9fafb and its white text vanished
  // from the printed sheet. jsdom does not resolve var(), so the brand color
  // itself can't be asserted here; what matters is that the zebra fill no
  // longer claims the row.
  it('keeps the brand color on a brand header that falls on an even row', async () => {
    mockApi(summaryData({ receipts: [
      receipt({ productName: 'Toned Milk' }),
      receipt({ productName: 'Homogenised Milk 500ml', displayOrder: 1 }),
      receipt({ brandName: 'Jersey', brandDisplayOrder: 1, productName: 'HTM 1000ml' }),
    ] }));
    renderWithParams('from=2026-08-05&to=2026-08-05');

    // Row order: Nandini (1) · two products (2, 3) · Jersey (4 — even).
    const jerseyRow = (await screen.findByText(/Jersey/)).closest('tr');
    expect(jerseyRow.matches('tr:nth-child(even)')).toBe(true);
    expect(getComputedStyle(jerseyRow.querySelector('td')).backgroundColor).not.toBe('rgb(249, 250, 251)');
  });

  it('shows a category sub-header only when the brand has more than one category', async () => {
    mockApi(summaryData({ receipts: [
      receipt({ productName: 'Toned Milk', category: 'Milk' }),
      receipt({ productName: 'Curd 200g', category: 'Curd', containerType: null, unitSize: null, quantity: 5, amount: 50 }),
    ] }));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await screen.findByText('Toned Milk');
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
  });

  it('shows the GRAND TOTAL footer with the received figure', async () => {
    mockApi(summaryData({ grandTotalReceived: 1234 }));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    const footer = (await screen.findByText('GRAND TOTAL')).closest('tr');
    expect(footer.textContent).toContain('₹1,234.00');
  });
});

describe('StockSummaryPrint — crate display precision', () => {
  it('shows the same 2-decimal crate figure at the product, brand, and grand-total levels', async () => {
    // 35 units / 24 per crate = 1.4583... -> must render as "1.46" everywhere,
    // not "1.5" (old 1-decimal rounding).
    mockApi(summaryData({ receipts: [receipt({ unitsPerContainer: 24, quantity: 35, amount: 700 })] }));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await screen.findByText('Toned Milk');

    expect(screen.queryByText('1.5')).not.toBeInTheDocument();
    // Single product, so the product, brand, and grand-total figures are identical.
    expect(screen.getAllByText('1.46').length).toBeGreaterThanOrEqual(3);
  });
});

describe('StockSummaryPrint — printing', () => {
  it('auto-triggers window.print() once data has loaded', async () => {
    vi.useFakeTimers();
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('the manual Print button calls window.print() immediately', async () => {
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await screen.findByText('GRAND TOTAL');
    // A real (non-fake-timer) setTimeout from an earlier test's auto-print
    // can still be pending and fire mid-suite — clear the count right before
    // the assertion so this test only measures its own click.
    vi.mocked(window.print).mockClear();
    screen.getByText('Print / Save PDF').click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
