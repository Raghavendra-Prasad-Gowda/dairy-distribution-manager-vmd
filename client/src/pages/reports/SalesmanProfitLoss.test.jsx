/**
 * SalesmanProfitLoss tests.
 *
 * Covers the split-panel behaviour (sidebar roster → detail panel), and
 * critically that a loss renders visually distinct from a profit — the whole
 * point of the page is spotting a salesman or product that's losing money.
 */

import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalesmanProfitLoss from './SalesmanProfitLoss';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock PinModal so PIN gate tests don't need a real modal implementation.
vi.mock('../../components/PinModal', () => ({
  default: ({ isOpen, onClose, onSuccess, title }) =>
    isOpen ? (
      <div data-testid="pin-modal">
        <p>{title}</p>
        <button onClick={onClose}>Close</button>
        <button onClick={onSuccess}>Verify</button>
      </div>
    ) : null,
}));

const REPORT = {
  from: '2026-08-09', to: '2026-08-09',
  totals: { revenue: 6000, cost: 4700, profit: 1300, marginPct: 21.67 },
  daily: [
    { date: '2026-08-09T00:00:00.000Z', revenue: 6000, cost: 4700, profit: 1300, marginPct: 21.67 },
  ],
  salespeople: [
    {
      salespersonId: 1, name: 'K Pandu', route: 'Route 1',
      revenue: 4000, cost: 2500, profit: 1500, marginPct: 37.5,
      products: [
        { productId: 1, productName: 'Toned Milk', brandName: 'Nandini', category: 'Milk',
          quantity: 100, avgBilledPrice: 25, avgCostPrice: 20, revenue: 2500, cost: 2000, profit: 500 },
        { productId: 2, productName: 'Curd 200g', brandName: 'Nandini', category: 'Curd',
          quantity: 50, avgBilledPrice: 30, avgCostPrice: 10, revenue: 1500, cost: 500, profit: 1000 },
      ],
    },
    {
      // Billed below cost — a genuine loss.
      salespersonId: 2, name: 'Mahesh', route: 'Route 2',
      revenue: 2000, cost: 2200, profit: -200, marginPct: -10,
      products: [
        { productId: 1, productName: 'Toned Milk', brandName: 'Nandini', category: 'Milk',
          quantity: 100, avgBilledPrice: 20, avgCostPrice: 22, revenue: 2000, cost: 2200, profit: -200 },
      ],
    },
    {
      salespersonId: 3, name: 'Ravi', route: 'Route 3',
      revenue: 0, cost: 0, profit: 0, marginPct: 0, products: [],
    },
  ],
};

const PIN_SESSION_KEY = 'vmd_pl_pin_verified';

beforeEach(() => {
  vi.clearAllMocks();
  // Mock both the settings endpoint (gate disabled) and the report endpoint.
  // Gate disabled by default so that non-PIN tests render the page content directly.
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/pin/settings'))
      return Promise.resolve({ data: { data: { plPinEnabled: false } } });
    return Promise.resolve({ data: { data: REPORT } });
  });
  // Pre-set the PIN gate so existing tests render the page content directly.
  sessionStorage.setItem(PIN_SESSION_KEY, '1');
});

async function renderPage() {
  const utils = render(<SalesmanProfitLoss />);
  // Wait for settings to load (first api.get call) then for report data.
  await screen.findByText('K Pandu');
  return utils;
}

// ─── PIN gate tests ────────────────────────────────────────────────────────────

describe('SalesmanProfitLoss — PIN gate', () => {
  beforeEach(() => {
    // Clear the verified flag so the PIN gate appears for these tests.
    sessionStorage.removeItem(PIN_SESSION_KEY);
    // Settings say PIN is required for these tests.
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/pin/settings'))
        return Promise.resolve({ data: { data: { plPinEnabled: true } } });
      return Promise.resolve({ data: { data: REPORT } });
    });
  });

  it('shows the PinModal when plPinEnabled is true and sessionStorage has no verified flag', async () => {
    render(<SalesmanProfitLoss />);
    // Must wait for settings to load before the gate decision is made.
    expect(await screen.findByTestId('pin-modal')).toBeInTheDocument();
    expect(screen.getByText('Enter PIN to view Profit & Loss')).toBeInTheDocument();
  });

  it('does NOT call the report API before PIN is verified', async () => {
    render(<SalesmanProfitLoss />);
    await screen.findByTestId('pin-modal'); // wait for settings to settle
    const calls = vi.mocked(api.get).mock.calls.map(([url]) => url);
    expect(calls).not.toContain(expect.stringContaining('/reports/profit-loss'));
  });

  it('renders page content after onSuccess fires and sets sessionStorage', async () => {
    render(<SalesmanProfitLoss />);
    await screen.findByTestId('pin-modal');

    // Click the mock Verify button — triggers onSuccess
    fireEvent.click(screen.getByText('Verify'));

    // PIN modal should be gone; page content should load
    await waitFor(() => expect(screen.queryByTestId('pin-modal')).toBeNull());
    await screen.findByText('K Pandu');
    expect(sessionStorage.getItem(PIN_SESSION_KEY)).toBe('1');
  });

  it('calls navigate(-1) when the PIN modal is closed without verifying', async () => {
    render(<SalesmanProfitLoss />);
    await screen.findByTestId('pin-modal');
    fireEvent.click(screen.getByText('Close'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('skips the PIN modal when sessionStorage already has the verified flag', async () => {
    sessionStorage.setItem(PIN_SESSION_KEY, '1');
    render(<SalesmanProfitLoss />);
    // Gate is skipped even though plPinEnabled is true, because pinPassed is true.
    await screen.findByText('K Pandu');
    expect(screen.queryByTestId('pin-modal')).toBeNull();
  });

  it('skips the PIN modal when plPinEnabled is false (gate disabled)', async () => {
    // Override settings to disabled.
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/pin/settings'))
        return Promise.resolve({ data: { data: { plPinEnabled: false } } });
      return Promise.resolve({ data: { data: REPORT } });
    });
    render(<SalesmanProfitLoss />);
    await screen.findByText('K Pandu');
    expect(screen.queryByTestId('pin-modal')).toBeNull();
  });

  it('fails closed: shows PIN modal when settings request fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/pin/settings')) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ data: { data: REPORT } });
    });
    render(<SalesmanProfitLoss />);
    // plPinEnabled stays true (fail-closed default), modal should appear.
    expect(await screen.findByTestId('pin-modal')).toBeInTheDocument();
  });
});

describe('SalesmanProfitLoss — summary + range', () => {
  it('requests today for both ends of the range on first load', async () => {
    await renderPage();
    expect(api.get).toHaveBeenCalledWith('/reports/profit-loss?from=2026-08-09&to=2026-08-09');
  });

  it('shows the overall totals from the API', async () => {
    const { container } = await renderPage();
    // These labels are shared with the daily table's own column headers
    // (deliberately, so the two read as the same table family) — the
    // summary card is always the first match.
    expect(screen.getAllByText('Cost (Dairy Paid)')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Revenue (Dairy Earned)')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Profit/Loss')[0]).toBeInTheDocument();
    expect(within(container).getAllByText('21.67%')[0]).toBeInTheDocument();
  });

  it('colours the Profit/Loss card red when overall profit is negative', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { ...REPORT, totals: { revenue: 100, cost: 300, profit: -200, marginPct: -200 } } },
    });
    await renderPage();
    const label = screen.getAllByText('Profit/Loss')[0];
    expect(label).toBeInTheDocument();
    // The figure next to it carries the loss colour.
    const card = label.closest('div');
    expect(within(card).getByText(/-.*200/).className).toContain('text-red-600');
  });

  it('refetches when the date range widens', async () => {
    const { container } = await renderPage();
    const [fromInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(fromInput, { target: { value: '2026-08-01' } });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/reports/profit-loss?from=2026-08-01&to=2026-08-09')
    );
  });
});

describe('SalesmanProfitLoss — sidebar', () => {
  it('lists every salesman including one with no dispatches', async () => {
    await renderPage();
    expect(screen.getByText('K Pandu')).toBeInTheDocument();
    expect(screen.getByText('Mahesh')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
  });

  it('shows a loss-making salesman in red and a profitable one in green', async () => {
    await renderPage();
    const profitBadge = screen.getByText('K Pandu').closest('button');
    const lossBadge   = screen.getByText('Mahesh').closest('button');

    expect(within(profitBadge).getByText(/1,500/).className).toContain('text-emerald-600');
    expect(within(lossBadge).getByText(/200/).className).toContain('text-red-600');
  });

  it('filters the roster by name or route', async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Search name or route/i), {
      target: { value: 'Route 2' },
    });
    expect(screen.getByText('Mahesh')).toBeInTheDocument();
    expect(screen.queryByText('K Pandu')).toBeNull();
  });

  it('defaults to the All Salespeople roll-up showing the daily series', async () => {
    await renderPage();
    expect(screen.getByText('Daily Profit & Loss')).toBeInTheDocument();
  });

  it('labels the daily table columns the same as the summary cards, plus Margin, and centers them', async () => {
    await renderPage();

    const headerRow = screen.getByText('Date').closest('tr');
    const headers = within(headerRow).getAllByRole('columnheader');
    expect(headers.map(h => h.textContent)).toEqual([
      'Date', 'Cost (Dairy Paid)', 'Revenue (Dairy Earned)', 'Profit/Loss', 'Margin',
    ]);
    for (const th of headers) expect(th.className).toContain('text-center');

    const dataRow = screen.getByText('Sun, 09 Aug').closest('tr');
    for (const td of dataRow.querySelectorAll('td')) expect(td.className).toContain('text-center');
    expect(within(dataRow).getByText('21.67%')).toBeInTheDocument();
  });

  it('shows a TOTAL footer row with the overall cost/revenue/profit/margin', async () => {
    await renderPage();

    const footerRow = screen.getByText('TOTAL').closest('tr');
    const cells = within(footerRow).getAllByRole('cell').map(c => c.textContent);
    expect(cells).toEqual(['TOTAL', '₹4,700.00', '₹6,000.00', '₹1,300.00', '21.67%']);
  });

  it('omits the footer when there are no daily rows', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { ...REPORT, daily: [] } } });
    await renderPage();
    expect(screen.queryByText('TOTAL')).toBeNull();
  });
});

describe('SalesmanProfitLoss — detail panel', () => {
  it('swaps to a product breakdown when a salesman is selected', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));

    await waitFor(() => expect(screen.queryByText('Daily Profit & Loss')).toBeNull());
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
    expect(screen.getByText('Curd 200g')).toBeInTheDocument();
    expect(screen.getByText(/margin 37.5%/)).toBeInTheDocument();
  });

  it('shows only Product, Cost Price, Selling Price, Qty, Total and Profit/Loss columns, in that order', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));
    await screen.findByText('Toned Milk');

    const headerRow = screen.getByText('Product').closest('tr');
    expect(within(headerRow).getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Product', 'Cost Price', 'Selling Price', 'Qty', 'Total(Qty × Selling Price)', 'Profit/Loss',
    ]);
  });

  it('centers every column, header and body cells alike', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));
    await screen.findByText('Toned Milk');

    const headerRow = screen.getByText('Product').closest('tr');
    for (const th of within(headerRow).getAllByRole('columnheader')) {
      expect(th.className).toContain('text-center');
    }
    const dataRow = screen.getByText('Toned Milk').closest('tr');
    for (const td of dataRow.querySelectorAll('td')) {
      expect(td.className).toContain('text-center');
    }
  });

  it('computes Total as quantity × the exact billed revenue, not a re-derived average', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));
    await screen.findByText('Toned Milk');

    // Toned Milk: quantity 100, revenue 2500 (from REPORT fixture).
    const row = screen.getByText('Toned Milk').closest('tr');
    expect(within(row).getByText('₹2,500.00')).toBeInTheDocument();
  });

  it('tints a loss-making product row red', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Mahesh'));

    const row = (await screen.findByText('Toned Milk')).closest('tr');
    expect(row.className).toContain('bg-red-50/40');
  });

  it('tells you when a salesman had no dispatches in the period', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Ravi'));
    expect(await screen.findByText(/No stock was dispatched to Ravi/)).toBeInTheDocument();
  });

  it('can go back to the overall view', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));
    await waitFor(() => expect(screen.getByText('Toned Milk')).toBeInTheDocument());

    fireEvent.click(screen.getByText('All Salespeople'));
    await waitFor(() => expect(screen.getByText('Daily Profit & Loss')).toBeInTheDocument());
  });

  it('groups products under a brand header, in the order the server already sorted them', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: {
          ...REPORT,
          salespeople: [{
            salespersonId: 1, name: 'K Pandu', route: 'Route 1',
            revenue: 100, cost: 80, profit: 20, marginPct: 20,
            products: [
              { productId: 1, productName: 'Toned Milk', brandName: 'Nandini', category: 'Milk',
                quantity: 10, avgBilledPrice: 10, avgCostPrice: 8, revenue: 100, cost: 80, profit: 20 },
              { productId: 2, productName: 'HTM 210ml', brandName: 'Jersey', category: 'Milk',
                quantity: 10, avgBilledPrice: 10, avgCostPrice: 8, revenue: 100, cost: 80, profit: 20 },
            ],
          }],
        },
      },
    });
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));

    await screen.findByText('Toned Milk');
    // Two brand header rows, one per brand present in this salesman's list.
    expect(screen.getByText('Nandini')).toBeInTheDocument();
    expect(screen.getByText('Jersey')).toBeInTheDocument();

    // The header for a brand appears before that brand's own product rows —
    // Nandini's header, then Toned Milk, then Jersey's header, then HTM 210ml.
    const rows = screen.getAllByRole('row').map(r => r.textContent);
    const nandiniHeaderIdx = rows.findIndex(r => r.includes('Nandini'));
    const tonedMilkIdx     = rows.findIndex(r => r.includes('Toned Milk'));
    const jerseyHeaderIdx  = rows.findIndex(r => r.includes('Jersey'));
    const htmIdx           = rows.findIndex(r => r.includes('HTM 210ml'));
    expect(nandiniHeaderIdx).toBeLessThan(tonedMilkIdx);
    expect(tonedMilkIdx).toBeLessThan(jerseyHeaderIdx);
    expect(jerseyHeaderIdx).toBeLessThan(htmIdx);
  });

  it('shows a chip on the brand line with that brand\'s own total profit or loss', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: {
          ...REPORT,
          salespeople: [{
            salespersonId: 1, name: 'K Pandu', route: 'Route 1',
            revenue: 900, cost: 1000, profit: -100, marginPct: -11.11,
            products: [
              // Nandini: 500 + 300 = 800 profit
              { productId: 1, productName: 'Toned Milk', brandName: 'Nandini', category: 'Milk',
                quantity: 10, avgBilledPrice: 10, avgCostPrice: 8, revenue: 500, cost: 300, profit: 200 },
              { productId: 2, productName: 'Curd 200g', brandName: 'Nandini', category: 'Curd',
                quantity: 10, avgBilledPrice: 10, avgCostPrice: 4, revenue: 400, cost: 100, profit: 300 },
              // Jersey: a standalone loss, so the two brand chips must differ.
              { productId: 3, productName: 'HTM 210ml', brandName: 'Jersey', category: 'Milk',
                quantity: 10, avgBilledPrice: 10, avgCostPrice: 16, revenue: 0, cost: 600, profit: -600 },
            ],
          }],
        },
      },
    });
    await renderPage();
    fireEvent.click(screen.getByText('K Pandu'));
    await screen.findByText('Toned Milk');

    const nandiniHeader = screen.getByText('Nandini').closest('tr');
    const jerseyHeader  = screen.getByText('Jersey').closest('tr');

    // Nandini nets to +500 (200 + 300) — a profit chip.
    const nandiniChip = within(nandiniHeader).getByText(/500/);
    expect(nandiniChip.className).toContain('text-emerald-600');

    // Jersey has just the one loss-making line — a loss chip.
    const jerseyChip = within(jerseyHeader).getByText(/600/);
    expect(jerseyChip.className).toContain('text-red-600');
  });
});
