/**
 * SalespersonStatementPrint tests.
 *
 * Covers reading salespersonId/from/to into the fetch URL, resolving the
 * salesperson's name (+ route when present) from /salespeople, the
 * owing/clear/credit row tinting, the TOTAL footer, loading/error states,
 * and auto/manual print.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SalespersonStatementPrint from './SalespersonStatementPrint';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

const SALESPEOPLE = [{ id: 1, name: 'Ramu K', route: 'North Zone' }];

function row(overrides) {
  return { date: '2026-08-05', openingBalance: 500, stockGiven: 1000, amountPaid: 800, closingBalance: 700, ...overrides };
}

function mockApi({ rows = [], salespeople = SALESPEOPLE } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/reports/salesperson-statement')) return Promise.resolve({ data: { data: rows } });
    if (url.includes('/salespeople')) return Promise.resolve({ data: { data: salespeople } });
    return Promise.resolve({ data: { data: [] } });
  });
}

function renderWithParams(qs) {
  return render(
    <MemoryRouter initialEntries={[`/print/salesperson-statement?${qs}`]}>
      <SalespersonStatementPrint />
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

describe('SalespersonStatementPrint — fetch', () => {
  it('reads salespersonId/from/to into the fetch URL', async () => {
    renderWithParams('salespersonId=1&from=2026-08-01&to=2026-08-09');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/salesperson-statement?salespersonId=1&from=2026-08-01&to=2026-08-09')
    );
  });

  it('shows the salesperson name with route in the header', async () => {
    mockApi({ rows: [row()] });
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText(/Ramu K — North Zone/)).toBeInTheDocument();
  });

  it('shows just the name when the salesperson has no route', async () => {
    mockApi({ rows: [row()], salespeople: [{ id: 1, name: 'Ramu K', route: null }] });
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText(/Vikas Milk Dairy — Ramu K/)).toBeInTheDocument();
  });
});

describe('SalespersonStatementPrint — states', () => {
  it('shows "Loading…" before data resolves', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-05');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message on a failed fetch', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Failed to load report')).toBeInTheDocument();
  });
});

describe('SalespersonStatementPrint — table', () => {
  it('shows the TOTAL footer with summed given/collected and the closing balance', async () => {
    mockApi({ rows: [
      row({ date: '2026-08-05', stockGiven: 1000, amountPaid: 800, closingBalance: 700 }),
      row({ date: '2026-08-06', stockGiven: 500, amountPaid: 700, closingBalance: 500 }),
    ] });
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-06');

    const footer = (await screen.findByText('TOTAL')).closest('tr');
    expect(footer.textContent).toContain('₹1,500.00'); // given
    expect(footer.textContent).toContain('₹1,500.00'); // collected (800+700)
    expect(footer.textContent).toContain('₹500.00');   // closing = last row's
  });

  it('tints owing, clear, and credit rows differently', async () => {
    mockApi({ rows: [
      row({ date: '2026-08-05', closingBalance: 700 }),  // owing
      row({ date: '2026-08-06', closingBalance: 0 }),    // clear
      row({ date: '2026-08-07', closingBalance: -200 }), // credit
    ] });
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-07');
    await screen.findByText('TOTAL');

    const rows = screen.getAllByRole('row');
    expect(rows.some(r => r.className.includes('balance-owing'))).toBe(true);
    expect(rows.some(r => r.className.includes('balance-clear'))).toBe(true);
    expect(rows.some(r => r.className.includes('balance-credit'))).toBe(true);
  });
});

describe('SalespersonStatementPrint — printing', () => {
  it('auto-triggers window.print() once data has loaded', async () => {
    vi.useFakeTimers();
    mockApi({ rows: [row()] });
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-05');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('the manual Print button calls window.print() immediately', async () => {
    mockApi({ rows: [row()] });
    renderWithParams('salespersonId=1&from=2026-08-05&to=2026-08-05');
    await screen.findByText('TOTAL');
    screen.getByText('Print / Save PDF').click();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
