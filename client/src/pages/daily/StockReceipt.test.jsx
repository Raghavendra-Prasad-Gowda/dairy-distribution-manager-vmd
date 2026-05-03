/**
 * StockReceipt component smoke tests.
 *
 * Regression: StockReceipt previously crashed on every render because
 * `filteredGrouped()` referenced `today` which was never defined in the
 * component scope (ReferenceError → ErrorBoundary "Something went wrong").
 * Fix: added `const today = getIndiaDate()` inside the component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StockReceipt from './StockReceipt';
import api from '../../api/axios';

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useParams: () => ({ brandName: 'Nandini' }),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock('../../utils/dateUtils', () => ({
  getIndiaDate:   () => '2026-05-03',
  formatCurrency: (v) => `₹${Number(v).toFixed(2)}`,
}));

vi.mock('../../components/DateSelector', () => ({
  default: ({ date }) => <span data-testid="date-selector">{date}</span>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BRAND = { id: 1, name: 'Nandini', depositEnabled: false, depositPerLitre: '0' };

function makeApiResponses({ brands = [BRAND], products = [], receipts = [], routes = [], balance = null } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/brands'))         return Promise.resolve({ data: { data: brands } });
    if (url.includes('/routes'))         return Promise.resolve({ data: { data: routes } });
    if (url.includes('/dairy-balance'))  return Promise.resolve({ data: { data: { brands: balance ? [balance] : [] } } });
    if (url.includes('/categories'))     return Promise.resolve({ data: { data: [] } });
    if (url.includes('/products'))       return Promise.resolve({ data: { data: products } });
    if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: receipts } });
    return Promise.resolve({ data: { data: [] } });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StockReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeApiResponses();
  });

  it('renders without crashing — regression: today must be defined before filteredGrouped runs', () => {
    // Previously threw "ReferenceError: today is not defined" on every render,
    // caught by ErrorBoundary as "Something went wrong".
    expect(() => render(<StockReceipt />)).not.toThrow();
  });

  it('shows the page header', () => {
    render(<StockReceipt />);
    expect(screen.getByText('Stock Receipt')).toBeInTheDocument();
  });

  it('displays brand name in header once brand loads', async () => {
    render(<StockReceipt />);
    const heading = await screen.findByText('Nandini Stock Receipt');
    expect(heading).toBeInTheDocument();
  });

  it('shows "No routes configured" warning when brand has no routes', async () => {
    makeApiResponses({ brands: [BRAND], routes: [] });
    render(<StockReceipt />);
    const warning = await screen.findByText(/No routes configured for Nandini/i);
    expect(warning).toBeInTheDocument();
  });

  it('shows Account Balance card when brand is loaded', async () => {
    render(<StockReceipt />);
    const label = await screen.findByText('Account Balance');
    expect(label).toBeInTheDocument();
  });
});
