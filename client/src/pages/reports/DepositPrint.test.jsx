/**
 * DepositPrint tests.
 *
 * Covers reading brandId/from/to into the fetch URL, the "deposit not
 * enabled" branch, opening deposit carried forward, category grouping
 * within a date, the top-up line rendering, the GRAND TOTAL footer, and
 * auto/manual print.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DepositPrint from './DepositPrint';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

function depositData(overrides) {
  return {
    brandName: 'Nandini', depositEnabled: true, depositPerLitre: 2,
    openingDeposit: 0, totalDeposit: 0, rows: [],
    ...overrides,
  };
}

function mockApi(data = depositData()) {
  vi.mocked(api.get).mockResolvedValue({ data: { data } });
}

function renderWithParams(qs) {
  return render(
    <MemoryRouter initialEntries={[`/print/deposit?${qs}`]}>
      <DepositPrint />
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

describe('DepositPrint — fetch', () => {
  it('reads brandId/from/to into the fetch URL', async () => {
    renderWithParams('brandId=1&from=2026-08-01&to=2026-08-09');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/deposit-summary?brandId=1&from=2026-08-01&to=2026-08-09')
    );
  });
});

describe('DepositPrint — states', () => {
  it('shows "Loading…" before data resolves', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message on a failed fetch', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Failed to load report')).toBeInTheDocument();
  });

  it('shows a message when deposit is not enabled for the brand', async () => {
    mockApi(depositData({ depositEnabled: false }));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Deposit is not enabled for this brand.')).toBeInTheDocument();
  });
});

describe('DepositPrint — table', () => {
  it('shows an opening-deposit carry-forward row when present', async () => {
    mockApi(depositData({ openingDeposit: 500 }));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText(/Opening deposit carried forward/)).toBeInTheDocument();
  });

  it('shows "No qualifying receipts" for a day with zero deposit', async () => {
    mockApi(depositData({ rows: [{ date: '2026-08-05', dailyDeposit: 0, runningTotal: 500, items: [] }] }));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('No qualifying receipts')).toBeInTheDocument();
  });

  it('groups items by category and shows a top-up line distinctly', async () => {
    mockApi(depositData({
      totalDeposit: 150,
      rows: [{
        date: '2026-08-05', dailyDeposit: 150, runningTotal: 150,
        items: [
          { category: 'Milk', productName: 'Toned Milk', quantity: 10, unitType: 'ml', unitSize: 500, volumeOrWeight: 5, depositAmount: 100 },
          { category: 'Milk', productName: 'Manual Top-up', isTopUp: true, notes: 'crate replacement', createdBy: 'admin', depositAmount: 50 },
        ],
      }],
    }));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText(/Manual Top-up/)).toBeInTheDocument();
    expect(screen.getByText(/crate replacement/)).toBeInTheDocument();
  });

  it('shows the GRAND TOTAL footer with the days-with-deposit count and total', async () => {
    mockApi(depositData({
      totalDeposit: 300,
      rows: [
        { date: '2026-08-05', dailyDeposit: 100, runningTotal: 100, items: [{ category: 'Milk', productName: 'Toned Milk', quantity: 5, unitType: 'ml', unitSize: 500, volumeOrWeight: 2.5, depositAmount: 100 }] },
        { date: '2026-08-06', dailyDeposit: 200, runningTotal: 300, items: [{ category: 'Milk', productName: 'Toned Milk', quantity: 10, unitType: 'ml', unitSize: 500, volumeOrWeight: 5, depositAmount: 200 }] },
      ],
    }));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-06');
    const footer = await screen.findByText(/GRAND TOTAL/);
    expect(footer.closest('tr').textContent).toContain('2 days with deposit');
    expect(footer.closest('tr').textContent).toContain('₹300.00');
  });
});

describe('DepositPrint — printing', () => {
  it('auto-triggers window.print() once data has loaded', async () => {
    vi.useFakeTimers();
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('the manual Print button calls window.print() immediately', async () => {
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    await screen.findByText('Deposit Report');
    screen.getByText('Print / Save PDF').click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
