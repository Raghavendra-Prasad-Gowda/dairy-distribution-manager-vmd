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
  // Fake timers for EVERY test, not just the auto-print one below: the
  // component schedules a real `setTimeout(() => window.print(), 400)` on
  // every render, so a test that renders the page under real timers leaves
  // a genuine pending Node timer behind. afterEach's useRealTimers() only
  // stops installing fake ones going forward — it does not cancel that real
  // timer, which can then fire mid-suite and pollute a LATER test's fresh
  // window.print spy (this is what caused the auto-print test to
  // intermittently see a call before it ever advanced the clock). Fake
  // timers everywhere means that setTimeout always lands on the fake clock
  // and is discarded harmlessly when the test ends.
  // shouldAdvanceTime keeps findByText/waitFor's real-time polling working.
  vi.useFakeTimers({ shouldAdvanceTime: true });
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
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('the manual Print button calls window.print() immediately', async () => {
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await screen.findByText('GRAND TOTAL');
    // This render ALSO scheduled its own auto-print (every render does),
    // and shouldAdvanceTime lets the fake clock creep forward in near-real
    // time while findByText polls above — under load, 400ms can elapse
    // during that wait and fire the auto-print before the click below.
    // Clear right before the deliberate click so this test measures only
    // that action, not whichever of the two fired the mock first.
    vi.mocked(window.print).mockClear();
    screen.getByText('Print / Save PDF').click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
