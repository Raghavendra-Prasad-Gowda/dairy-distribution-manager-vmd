/**
 * MyStatementPrint tests.
 *
 * Covers reading from/to into the /salesperson-statement/me fetch URL, the
 * salesperson name from useAuth() in the header, the owing/clear/credit row
 * tinting, the TOTAL footer, loading/error states, and auto/manual print.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MyStatementPrint from './MyStatementPrint';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { salespersonName: 'Ramu K' } }),
}));

function row(overrides) {
  return { date: '2026-08-05', openingBalance: 500, stockGiven: 1000, amountPaid: 800, closingBalance: 700, ...overrides };
}

function mockApi(rows = []) {
  vi.mocked(api.get).mockResolvedValue({ data: { data: rows } });
}

function renderWithParams(qs) {
  return render(
    <MemoryRouter initialEntries={[`/print/my-statement?${qs}`]}>
      <MyStatementPrint />
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

describe('MyStatementPrint — fetch', () => {
  it('reads from/to into the fetch URL', async () => {
    renderWithParams('from=2026-08-01&to=2026-08-09');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/salesperson-statement/me?from=2026-08-01&to=2026-08-09')
    );
  });

  it('shows the salesperson name from useAuth in the header', async () => {
    mockApi([row()]);
    renderWithParams('from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText(/Ramu K/)).toBeInTheDocument();
  });
});

describe('MyStatementPrint — states', () => {
  it('shows "Loading…" before data resolves', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error message on a failed fetch', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderWithParams('from=2026-08-05&to=2026-08-05');
    expect(await screen.findByText('Failed to load statement')).toBeInTheDocument();
  });
});

describe('MyStatementPrint — table', () => {
  it('shows the TOTAL footer with summed billed/paid and the closing balance', async () => {
    mockApi([
      row({ date: '2026-08-05', stockGiven: 1000, amountPaid: 800, closingBalance: 700 }),
      row({ date: '2026-08-06', stockGiven: 500, amountPaid: 500, closingBalance: 700 }),
    ]);
    renderWithParams('from=2026-08-05&to=2026-08-06');

    const footer = (await screen.findByText('TOTAL')).closest('tr');
    expect(footer.textContent).toContain('₹1,500.00'); // billed
    expect(footer.textContent).toContain('₹1,300.00'); // paid
    expect(footer.textContent).toContain('₹700.00');   // balance = last row's
  });

  it('tints owing, clear, and credit rows differently', async () => {
    mockApi([
      row({ date: '2026-08-05', closingBalance: 700 }),
      row({ date: '2026-08-06', closingBalance: 0 }),
      row({ date: '2026-08-07', closingBalance: -200 }),
    ]);
    renderWithParams('from=2026-08-05&to=2026-08-07');
    await screen.findByText('TOTAL');

    const rows = screen.getAllByRole('row');
    expect(rows.some(r => r.className.includes('balance-owing'))).toBe(true);
    expect(rows.some(r => r.className.includes('balance-clear'))).toBe(true);
    expect(rows.some(r => r.className.includes('balance-credit'))).toBe(true);
  });
});

describe('MyStatementPrint — dispatch stock summary (type=dispatch)', () => {
  it('renders one row per brand+product with summed quantity and amount', async () => {
    mockApi([
      row({
        date: '2026-08-05',
        items: [
          { brandName: 'Jersey', productName: 'HTM 1000ml', quantity: 10, totalAmount: 500 },
          { brandName: 'Jersey', productName: 'HTM 1000ml', quantity: 5, totalAmount: 250 },
          { brandName: 'Nandini', productName: 'Toned Milk', quantity: 2, totalAmount: 100 },
        ],
      }),
    ]);
    renderWithParams('from=2026-08-05&to=2026-08-05&type=dispatch');

    const jerseyRow = (await screen.findByText(/Jersey/)).closest('tr');
    expect(jerseyRow.textContent).toContain('15'); // 10 + 5
    expect(jerseyRow.textContent).toContain('₹750.00'); // 500 + 250
    // Brand's own color identity (same as Dairy Settings' Brands list)
    expect(jerseyRow).toHaveStyle({ '--brand-color': '#0369a1' });

    const nandiniRow = screen.getByText(/Nandini/).closest('tr');
    expect(nandiniRow.textContent).toContain('2');
    expect(nandiniRow.textContent).toContain('₹100.00');
  });

  it('shows the TOTAL footer summed across all brands', async () => {
    mockApi([
      row({ date: '2026-08-05', items: [{ brandName: 'Jersey', productName: 'HTM 1000ml', quantity: 10, totalAmount: 500 }] }),
      row({ date: '2026-08-06', items: [{ brandName: 'Nandini', productName: 'Toned Milk', quantity: 2, totalAmount: 100 }] }),
    ]);
    renderWithParams('from=2026-08-05&to=2026-08-06&type=dispatch');

    const footer = (await screen.findByText('TOTAL')).closest('tr');
    expect(footer.textContent).toContain('12'); // 10 + 2
    expect(footer.textContent).toContain('₹600.00'); // 500 + 100
  });

  it('shows the dispatch stock summary title instead of the account statement title', async () => {
    mockApi([row({ items: [{ brandName: 'Jersey', productName: 'HTM 1000ml', quantity: 10, totalAmount: 500 }] })]);
    renderWithParams('from=2026-08-05&to=2026-08-05&type=dispatch');

    expect(await screen.findByText('My Dispatch Stock Summary')).toBeInTheDocument();
    expect(screen.queryByText('My Account Statement')).not.toBeInTheDocument();
  });

  it('shows an empty-state message when nothing was dispatched in the period', async () => {
    mockApi([row({ items: [] })]);
    renderWithParams('from=2026-08-05&to=2026-08-05&type=dispatch');

    expect(await screen.findByText('No dispatch data for this period')).toBeInTheDocument();
  });

  it('defaults to the account statement (type=balance) when type is omitted', async () => {
    mockApi([row()]);
    renderWithParams('from=2026-08-05&to=2026-08-05');

    expect(await screen.findByText('My Account Statement')).toBeInTheDocument();
  });
});

describe('MyStatementPrint — printing', () => {
  it('auto-triggers window.print() once data has loaded', async () => {
    mockApi([row()]);
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('the manual Print button calls window.print() immediately', async () => {
    mockApi([row()]);
    renderWithParams('from=2026-08-05&to=2026-08-05');
    await screen.findByText('TOTAL');
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
