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
    screen.getByText('Print / Save PDF').click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
