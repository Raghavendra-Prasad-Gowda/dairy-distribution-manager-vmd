/**
 * DairyStatementPrint tests.
 *
 * Covers reading brandId/from/to/route params into the fetch URL, resolving
 * the brand name from the /brands list, the loading/error states, the
 * TOTAL footer math, the owing/clear row tinting, and the auto-print
 * (fires window.print() ~400ms after data lands) plus the manual button.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DairyStatementPrint from './DairyStatementPrint';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const BRANDS = [{ id: 1, name: 'Nandini' }];

function row(overrides) {
  return { date: '2026-08-05', openingBalance: 500, stockValue: 1000, depositValue: 0, amountPaid: 800, closingBalance: 700, ...overrides };
}

function mockApi({ rows = [], brands = BRANDS } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/reports/dairy-statement')) return Promise.resolve({ data: { data: rows } });
    if (url.includes('/brands')) return Promise.resolve({ data: { data: brands } });
    return Promise.resolve({ data: { data: [] } });
  });
}

function renderWithParams(qs) {
  return render(
    <MemoryRouter initialEntries={[`/print/dairy-statement?${qs}`]}>
      <DairyStatementPrint />
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

describe('DairyStatementPrint — fetch', () => {
  it('reads brandId/from/to from the URL into the fetch call', async () => {
    renderWithParams('brandId=1&from=2026-08-01&to=2026-08-09');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/dairy-statement?brandId=1&from=2026-08-01&to=2026-08-09')
    );
  });

  it('resolves and shows the brand name from /brands', async () => {
    mockApi({ rows: [row()], brands: [{ id: 1, name: 'Jersey' }] });
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText(/Jersey/)).toBeInTheDocument();
  });

  it('shows the route number banner when routeNumber is present', async () => {
    mockApi({ rows: [row()] });
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05&routeId=100&routeNumber=R1');
    expect(await screen.findByText('Route: R1')).toBeInTheDocument();
  });
});

describe('DairyStatementPrint — states', () => {
  it('shows "Loading…" before data resolves', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Failed to load report')).toBeInTheDocument();
  });
});

describe('DairyStatementPrint — table', () => {
  it('shows the TOTAL footer with summed bill/paid and the closing balance', async () => {
    mockApi({ rows: [
      row({ date: '2026-08-05', stockValue: 1000, amountPaid: 800, closingBalance: 700 }),
      row({ date: '2026-08-06', stockValue: 500, amountPaid: 500, closingBalance: 700 }),
    ] });
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-06');

    const footer = (await screen.findByText('TOTAL')).closest('tr');
    expect(footer.textContent).toContain('₹1,500.00'); // total bill 1000+500
    expect(footer.textContent).toContain('₹1,300.00'); // total paid 800+500
    expect(footer.textContent).toContain('₹700.00');   // closing = last row's
  });

  it('tints an owing row differently from a cleared row', async () => {
    mockApi({ rows: [
      row({ date: '2026-08-05', closingBalance: 700 }),  // owing
      row({ date: '2026-08-06', closingBalance: 0 }),    // cleared
    ] });
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-06');
    await screen.findByText('TOTAL');

    const rows = screen.getAllByRole('row');
    const owingRow  = rows.find(r => r.className.includes('balance-owing'));
    const clearRow  = rows.find(r => r.className.includes('balance-clear'));
    expect(owingRow).toBeTruthy();
    expect(clearRow).toBeTruthy();
  });
});

describe('DairyStatementPrint — printing', () => {
  it('auto-triggers window.print() once data has loaded', async () => {
    vi.useFakeTimers();
    mockApi({ rows: [row()] });
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('the manual Print button calls window.print() immediately', async () => {
    mockApi({ rows: [row()] });
    renderWithParams('brandId=1&from=2026-08-05&to=2026-08-05');
    await screen.findByText('TOTAL'); // let the fetch settle before interacting
    // A real (non-fake-timer) setTimeout from an earlier test's auto-print
    // can still be pending and fire mid-suite — clear the count right before
    // the assertion so this test only measures its own click.
    vi.mocked(window.print).mockClear();
    screen.getByText('Print / Save PDF').click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
