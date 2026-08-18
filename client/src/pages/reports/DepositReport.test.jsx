/**
 * DepositReport — date-range auto-widen regression test.
 *
 * The "Deposit Top-up" modal defaults its date to today (getIndiaDate),
 * while this report defaults its own range to yesterday→yesterday
 * (getYesterday). A same-day top-up landed outside the visible window and
 * looked exactly like nothing had happened — the report still showed the
 * old total. This test locks in the fix: saving a top-up outside the
 * current [from, to] window must widen the window to include it.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DepositReport from './DepositReport';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'superadmin' } }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return {
    ...actual,
    getIndiaDate: () => '2026-08-09', // "today"
    getYesterday: () => '2026-08-08', // report's default range
  };
});

const BRAND  = { id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0.1 };
const JERSEY = { id: 2, name: 'Jersey',  depositEnabled: false, depositPerLitre: 0 };

function emptyReport(overrides = {}) {
  return {
    brandName: 'Nandini', depositEnabled: true, depositPerLitre: 0.1,
    openingDeposit: 0, totalDeposit: 8380.60, rows: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
    return Promise.resolve({ data: { data: emptyReport() } });
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: { count: 1, total: 20000 } } });
});

async function renderPage() {
  const utils = render(<DepositReport />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/reports/deposit-summary')));
  return utils;
}

/** The two plain date inputs on the page itself (From, To) — no label association, so query by position. */
function getPageDateInputs(container) {
  return [...container.querySelectorAll('input[type="date"]')];
}

/** Opens the modal, picks Nandini, moves to the amounts step, and enters an amount. */
function openModalAndFillAmount() {
  fireEvent.click(screen.getByRole('button', { name: /Deposit Top-up/i }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByText('Nandini'));
  fireEvent.click(within(dialog).getByRole('button', { name: /^Next$/ }));
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20000' } });
  return dialog;
}

describe('DepositReport — deposit top-up outside the visible range', () => {
  it('widens "to" when the top-up date (left on its "today" default) is after the current range', async () => {
    const { container } = await renderPage();
    // Default range is yesterday→yesterday (2026-08-08 to 2026-08-08); the
    // modal's date field defaults to today (2026-08-09) — one day past it,
    // matching the real bug exactly (nobody touches either date field).
    openModalAndFillAmount();
    fireEvent.click(screen.getByRole('button', { name: /Add deposit top-up/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dairy-deposit-topups/bulk', {
      topUpDate: '2026-08-09',
      notes:     undefined,
      entries:   [{ brandId: 1, amount: 20000 }],
    }));

    // The report re-fetches once "to" widens to include 2026-08-09.
    await waitFor(() => {
      const toInput = getPageDateInputs(container)[1];
      expect(toInput.value).toBe('2026-08-09');
    });
    await waitFor(() => {
      const calls = vi.mocked(api.get).mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('to=2026-08-09'))).toBe(true);
    });
  });

  it('widens "from" when the top-up date is before the current range', async () => {
    const { container } = await renderPage();
    const [fromInput] = getPageDateInputs(container);
    fireEvent.change(fromInput, { target: { value: '2026-08-05' } }); // to stays 2026-08-08

    openModalAndFillAmount();
    // Pick a date before the (now 2026-08-05 to 2026-08-08) window.
    fireEvent.change(screen.getByDisplayValue('2026-08-09'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Add deposit top-up/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dairy-deposit-topups/bulk', {
      topUpDate: '2026-08-01',
      notes:     undefined,
      entries:   [{ brandId: 1, amount: 20000 }],
    }));

    await waitFor(() => {
      const [widenedFrom] = getPageDateInputs(container);
      expect(widenedFrom.value).toBe('2026-08-01');
    });
  });

  it('does not touch the range when the picked top-up date is already inside it', async () => {
    const { container } = await renderPage();
    const [fromInput] = getPageDateInputs(container);
    fireEvent.change(fromInput, { target: { value: '2026-08-01' } }); // range now 2026-08-01 to 2026-08-08

    openModalAndFillAmount();
    // Explicitly pick a date already inside the window, instead of leaving
    // the field on its "today" default.
    fireEvent.change(screen.getByDisplayValue('2026-08-09'), { target: { value: '2026-08-03' } });
    fireEvent.click(screen.getByRole('button', { name: /Add deposit top-up/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dairy-deposit-topups/bulk', {
      topUpDate: '2026-08-03',
      notes:     undefined,
      entries:   [{ brandId: 1, amount: 20000 }],
    }));

    // A refetch still happens (the "already in range" branch explicitly
    // calls fetchDeposit), but the visible range itself never moves.
    await waitFor(() => {
      const calls = vi.mocked(api.get).mock.calls.map(c => c[0]);
      expect(calls.filter(u => u.includes('/reports/deposit-summary')).length).toBeGreaterThan(1);
    });
    const [finalFrom, finalTo] = getPageDateInputs(container);
    expect(finalFrom.value).toBe('2026-08-01');
    expect(finalTo.value).toBe('2026-08-08');
  });
});

describe('DepositReport — Deposit Top-up button visibility', () => {
  it('hides the button on a brand tab that does not have deposit enabled', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [JERSEY, BRAND] } });
      return Promise.resolve({ data: { data: emptyReport({ depositEnabled: false }) } });
    });

    await renderPage();
    // Jersey (no deposit) is first in the list, so it's the active tab by default.
    expect(screen.queryByRole('button', { name: /Deposit Top-up/i })).toBeNull();
  });

  it('shows the button once you switch to a brand tab that does have deposit enabled', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [JERSEY, BRAND] } });
      return Promise.resolve({ data: { data: emptyReport() } });
    });

    await renderPage();
    expect(screen.queryByRole('button', { name: /Deposit Top-up/i })).toBeNull();

    fireEvent.click(screen.getByText('Nandini'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Deposit Top-up/i })).toBeInTheDocument());
  });

  it('still offers every deposit-enabled brand in the picker, even when viewing one that has none', async () => {
    // The button itself is scoped to the active tab, but once you do reach a
    // deposit-enabled tab, the modal's picker still offers every
    // deposit-enabled brand — not just the one you happened to open it from.
    const OTHER_ENABLED = { id: 3, name: 'Gowardhan', depositEnabled: true, depositPerLitre: 0.15 };
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND, OTHER_ENABLED, JERSEY] } });
      return Promise.resolve({ data: { data: emptyReport() } });
    });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Deposit Top-up/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Nandini')).toBeInTheDocument();
    expect(within(dialog).getByText('Gowardhan')).toBeInTheDocument();
    expect(within(dialog).queryByText('Jersey')).toBeNull();
  });
});

describe('DepositReport — deleting a manual top-up row (superadmin only)', () => {
  function reportWithTopUpRow() {
    return emptyReport({
      totalDeposit: 500,
      rows: [{
        date: '2026-08-08', dailyDeposit: 500, runningTotal: 500,
        items: [{
          isTopUp: true, id: 5, category: 'Deposits',
          productName: 'Manual Top-up', depositAmount: 500,
          notes: 'Opening balance', createdBy: 'admin',
        }],
      }],
    });
  }

  it('asks for confirmation before deleting, without calling DELETE yet', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithTopUpRow() } });
    });
    await renderPage();

    await screen.findByText('Manual Top-up');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/Delete this deposit top-up/)).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('does NOT delete when the confirmation is cancelled', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithTopUpRow() } });
    });
    await renderPage();

    await screen.findByText('Manual Top-up');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('calls DELETE and refreshes the report when confirmed', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithTopUpRow() } });
    });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
    await renderPage();

    await screen.findByText('Manual Top-up');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/dairy-deposit-topups/5'));
    expect(notify).toHaveBeenCalledWith('Deposit top-up deleted', 'success');
  });

  it('shows the server error, and falls back to a generic message with no server error', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithTopUpRow() } });
    });
    vi.mocked(api.delete).mockRejectedValue({ response: { data: { error: 'Locked' } } });
    await renderPage();

    await screen.findByText('Manual Top-up');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Locked', 'error'));

    vi.mocked(api.delete).mockRejectedValue(new Error('network down'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to delete deposit top-up', 'error'));
  });
});

// ─── Row expand/collapse ─────────────────────────────────────────────────────

describe('DepositReport — row expand/collapse', () => {
  function reportWithRows() {
    return emptyReport({
      totalDeposit: 100,
      rows: [
        {
          date: '2026-08-08', dailyDeposit: 100, runningTotal: 100,
          items: [
            { isTopUp: false, category: 'Milk', productName: 'Toned Milk', unitType: 'ml', unitSize: 500,
              quantity: 10, volumeOrWeight: 5, depositAmount: 50 },
            { isTopUp: false, category: 'Curd', productName: 'Curd Pot', unitType: 'gram', unitSize: 200,
              quantity: 5, volumeOrWeight: 1, depositAmount: 50 },
          ],
        },
        { date: '2026-08-07', dailyDeposit: 0, runningTotal: 0, items: [] },
      ],
    });
  }

  it('a deposit day starts collapsed on a multi-day range (from !== to) and expands on click', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithRows() } });
    });
    const { container } = await renderPage();
    fireEvent.change(getPageDateInputs(container)[0], { target: { value: '2026-08-01' } }); // widen range

    await screen.findByText('2 products'); // collapsed summary shows item count
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('2 products').closest('tr'));
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd Pot')).toBeInTheDocument();
    // Category sub-headers
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd')).toBeInTheDocument();
    // Volume/weight units
    expect(screen.getByText('5.00 L')).toBeInTheDocument();
    expect(screen.getByText('1.00 kg')).toBeInTheDocument();
  });

  it('a same-day range (from === to) starts fully expanded, no click needed', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithRows() } });
    });
    await renderPage(); // default from === to
    expect(await screen.findByText('Toned Milk')).toBeInTheDocument();
  });

  it('Expand All / Collapse All toggles every deposit-day row at once', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithRows() } });
    });
    const { container } = await renderPage();
    fireEvent.change(getPageDateInputs(container)[0], { target: { value: '2026-08-01' } });
    await screen.findByText('2 products'); // collapsed

    fireEvent.click(screen.getByText('Expand All'));
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('a non-deposit day within a mixed report shows "No qualifying receipts"', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: reportWithRows() } });
    });
    await renderPage();
    expect(await screen.findByText('No qualifying receipts')).toBeInTheDocument();
  });
});

// ─── Print, opening balance, empty state ─────────────────────────────────────

describe('DepositReport — print, opening balance, and empty state', () => {
  it('opens the print URL with the current brand/date filters', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: emptyReport({
        totalDeposit: 100,
        rows: [{ date: '2026-08-08', dailyDeposit: 100, runningTotal: 100, items: [] }],
      }) } });
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    await renderPage();
    fireEvent.click(await screen.findByText('Print'));

    expect(openSpy).toHaveBeenCalledWith('/print/deposit?brandId=1&from=2026-08-08&to=2026-08-08', '_blank');
    openSpy.mockRestore();
  });

  it('shows the opening-deposit-carried-forward row when there is a prior balance', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: emptyReport({ openingDeposit: 500, totalDeposit: 500 }) } });
    });
    await renderPage();
    expect(await screen.findByText(/Opening deposit carried forward/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows and no opening balance', async () => {
    await renderPage();
    expect(await screen.findByText('No stock receipts found for this period.')).toBeInTheDocument();
  });

  it('shows the "deposit not enabled" notice for a brand without deposit configured', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [JERSEY] } });
      return Promise.resolve({ data: { data: emptyReport({ depositEnabled: false, brandName: 'Jersey' }) } });
    });
    await renderPage();
    expect(await screen.findByText('Deposit not enabled for Jersey')).toBeInTheDocument();
  });

  it('changing the "To" date re-fetches with the new range', async () => {
    const { container } = await renderPage();
    fireEvent.change(getPageDateInputs(container)[1], { target: { value: '2026-08-09' } });
    await waitFor(() => {
      const calls = vi.mocked(api.get).mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('to=2026-08-09'))).toBe(true);
    });
  });

  it('shows the summary cards (total, days-with-deposit, average) once data loads', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.resolve({ data: { data: [BRAND] } });
      return Promise.resolve({ data: { data: emptyReport({
        totalDeposit: 200,
        rows: [{ date: '2026-08-08', dailyDeposit: 200, runningTotal: 200, items: [] }],
      }) } });
    });
    await renderPage();
    expect(await screen.findByText('Total Deposit')).toBeInTheDocument();
    expect(screen.getByText('Days with Deposit')).toBeInTheDocument();
    expect(screen.getByText('Avg / Active Day')).toBeInTheDocument();
  });
});
