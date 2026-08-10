/**
 * SalespersonBalance ("My Balance") tests.
 *
 * The page renders both a mobile card list and a desktop table for the same
 * history data (Tailwind responsive classes, not conditional rendering), so
 * repeated content like a date or a status badge appears twice in the DOM —
 * tests account for that rather than assuming a single match.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalespersonBalance from './SalespersonBalance';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

let mockSalespersonId = 1;
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { salespersonId: mockSalespersonId } }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

const BALANCE = { openingBalance: 6100, stockGiven: 8200, amountPaid: 1900, closingBalance: 12400 };

function historyEntry(overrides) {
  return {
    balanceDate: '2026-08-09T00:00:00.000Z',
    stockGiven: 500, amountPaid: 300, closingBalance: 200, topUps: [],
    ...overrides,
  };
}

function mockApi({ balance = BALANCE, items = [], pagination = { page: 1, pages: 1, total: items.length, limit: 20 } } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/history')) return Promise.resolve({ data: { data: { items, pagination } } });
    return Promise.resolve({ data: { data: balance } });
  });
}

beforeEach(() => {
  vi.resetAllMocks(); // clearAllMocks alone would leak a mockRejectedValue set by an earlier test
  mockSalespersonId = 1;
  mockApi();
});

async function renderPage() {
  const utils = render(<SalespersonBalance />);
  await screen.findByText('Opening');
  return utils;
}

describe('SalespersonBalance — no salesperson linked', () => {
  it('shows a fallback message instead of crashing', () => {
    mockSalespersonId = undefined;
    render(<SalespersonBalance />);
    expect(screen.getByText('Unable to load balance')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('SalespersonBalance — balance card', () => {
  it('marks it Outstanding when owed', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: 500 } });
    await renderPage();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('You Owe')).toBeInTheDocument();
  });

  it('marks it Settled when exactly zero', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: 0 } });
    await renderPage();
    expect(screen.getByText('Settled', { selector: 'span' })).toBeInTheDocument();
  });

  it('marks it Credit when negative', async () => {
    mockApi({ balance: { ...BALANCE, closingBalance: -300 } });
    await renderPage();
    expect(screen.getByText("You're in Credit")).toBeInTheDocument();
  });

  it('shows a fallback zeroed balance when the API returns no row for today', async () => {
    mockApi({ balance: null });
    await renderPage();
    expect(screen.getByText('Settled', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows an error banner when the fetch fails', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    render(<SalespersonBalance />);
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });
});

describe('SalespersonBalance — date range', () => {
  it('requests history for the default today-to-today range on first load', async () => {
    await renderPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('from=2026-08-09&to=2026-08-09'));
  });

  it('refetches history when the From date changes', async () => {
    const { container } = await renderPage();
    const [fromInput] = container.querySelectorAll('input[type="date"]');
    fromInput.dispatchEvent(new Event('input', { bubbles: true }));
    Object.defineProperty(fromInput, 'value', { value: '2026-08-01', configurable: true });
    fromInput.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('from=2026-08-01')));
  });
});

describe('SalespersonBalance — history', () => {
  it('shows an empty-state message when there is no history in range', async () => {
    await renderPage();
    expect(screen.getByText('No payment history for this date range')).toBeInTheDocument();
  });

  it('lists a history entry\'s bill/paid/balance in both the mobile and desktop layouts', async () => {
    // Two entries so a single row's own figures never coincidentally equal
    // the totals-row figures below.
    mockApi({ items: [
      historyEntry({ stockGiven: 500, amountPaid: 300, closingBalance: 200 }),
      historyEntry({ stockGiven: 111, amountPaid: 222, closingBalance: 333 }),
    ] });
    await renderPage();
    // Rendered once for mobile, once for desktop.
    expect(screen.getAllByText('₹500.00')).toHaveLength(2);
    expect(screen.getAllByText('₹300.00')).toHaveLength(2);
  });

  it('shows an admin top-up attribution line when a day has one', async () => {
    mockApi({ items: [historyEntry({ topUps: [{ amount: 5000, createdBy: 'raghav', notes: 'Opening dues' }] })] });
    await renderPage();
    expect(screen.getAllByText(/Old balance added: ₹5,000.00/)).toHaveLength(2);
    expect(screen.getAllByText(/by raghav · Opening dues/)).toHaveLength(2);
  });

  it('shows totals across the visible history', async () => {
    mockApi({ items: [
      historyEntry({ stockGiven: 500, amountPaid: 300 }),
      historyEntry({ stockGiven: 700, amountPaid: 100 }),
    ] });
    await renderPage();
    // Total bill 1200, total paid 400 — each rendered once per layout.
    expect(screen.getAllByText('₹1,200.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹400.00').length).toBeGreaterThan(0);
  });

  it('paginates when there is more than one page', async () => {
    mockApi({
      items: [historyEntry()],
      pagination: { page: 1, pages: 2, total: 21, limit: 20 },
    });
    await renderPage();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText(/Prev/).closest('button')).toBeDisabled();
    expect(screen.getByText(/Next/).closest('button')).not.toBeDisabled();
  });
});
