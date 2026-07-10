/**
 * StockBalanceSummary tests.
 *
 * Covers the label renames (Received → Supply, Remaining → Shortage) and the
 * footer row order (Dispatched → Shortage → Supply).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StockBalanceSummary from './StockBalanceSummary';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate: () => '2026-07-09',
}));

vi.mock('../../components/DateSelector', () => ({
  default: ({ date }) => <span data-testid="date-selector">{date}</span>,
}));

vi.mock('../../components/BrandTabs', () => ({
  default: () => <div data-testid="brand-tabs" />,
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
}));

const BRAND = { id: 1, name: 'Nandini' };

function mockApi({ availability = [], dispatch = null } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))                     return Promise.resolve({ data: { data: [BRAND] } });
    if (url.includes('/stock-receipts/availability')) return Promise.resolve({ data: { data: availability } });
    if (url.includes('/reports/daily-dispatch'))     return Promise.resolve({ data: { data: dispatch } });
    return Promise.resolve({ data: { data: [] } });
  });
}

const DISPATCH_DATA = {
  date: '2026-07-09',
  brands: [{
    brandId: 1,
    brandName: 'Nandini',
    products: [{ productId: 10, productName: 'Milk 500ml', category: 'Milk', unitsPerContainer: 20 }],
  }],
  rows: [{
    salespersonId: 1,
    salespersonName: 'Ramesh',
    items: { 10: { qty: 40 } },
    totalAmount: 880,
  }],
  totals: { 10: 40 },
};

describe('StockBalanceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Supply and Shortage chips instead of Received and Remaining', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    // Chips + footer rows both use these labels
    expect(screen.getAllByText('Supply').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shortage').length).toBeGreaterThan(0);
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
    expect(screen.queryByText('Remaining')).not.toBeInTheDocument();
  });

  it('renders footer rows in Dispatched → Shortage → Supply order', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const footerLabels = [...container.querySelectorAll('tfoot tr td:first-child')]
      .map(td => td.textContent.trim());
    expect(footerLabels).toEqual(['Dispatched', 'Shortage', 'Supply']);
  });

  it('computes shortage as supply minus dispatched', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA, // 40 dispatched
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const shortageRow = [...container.querySelectorAll('tfoot tr')]
      .find(tr => tr.textContent.includes('Shortage'));
    // 50 received − 40 dispatched = 10 (per-product cell and grand total)
    expect(shortageRow.textContent).toContain('10');
  });

  it('shows empty state when there is no dispatch data', async () => {
    mockApi({ availability: [], dispatch: { date: '2026-07-09', brands: [], rows: [], totals: {} } });
    render(<StockBalanceSummary />);
    expect(await screen.findByText(/No dispatch data for this date/i)).toBeInTheDocument();
  });
});
