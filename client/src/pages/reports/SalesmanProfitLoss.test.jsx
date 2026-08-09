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
  default: { get: vi.fn() },
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

const REPORT = {
  from: '2026-08-09', to: '2026-08-09',
  totals: { revenue: 6000, cost: 4700, profit: 1300, marginPct: 21.67 },
  daily: [
    { date: '2026-08-09T00:00:00.000Z', revenue: 6000, cost: 4700, profit: 1300 },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: REPORT } });
});

async function renderPage() {
  const utils = render(<SalesmanProfitLoss />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await screen.findByText('K Pandu');
  return utils;
}

describe('SalesmanProfitLoss — summary + range', () => {
  it('requests today for both ends of the range on first load', async () => {
    await renderPage();
    expect(api.get).toHaveBeenCalledWith('/reports/profit-loss?from=2026-08-09&to=2026-08-09');
  });

  it('shows the overall totals from the API', async () => {
    const { container } = await renderPage();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(within(container).getByText('21.67%')).toBeInTheDocument();
  });

  it('labels the card "Net Loss" and colours it red when overall profit is negative', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { ...REPORT, totals: { revenue: 100, cost: 300, profit: -200, marginPct: -200 } } },
    });
    await renderPage();
    const label = screen.getByText('Net Loss');
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
