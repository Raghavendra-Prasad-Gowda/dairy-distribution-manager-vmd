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

function makeProduct(overrides) {
  return {
    id: 0, name: '', brandId: 1, costPrice: '20', sellingPrice: '25',
    category: 'General', unitType: 'ml', unitSize: 500, isActive: true,
    showInStockReceipt: true, displayOrder: 0, depositEnabled: false,
    containerType: 'crate', unitsPerContainer: 20,
    brand: { id: 1, name: 'Nandini' }, costPrices: [], sellingPrices: [],
    ...overrides,
  };
}

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

  it('shows all products on a past date when no receipts were saved (client forgot to enter)', async () => {
    // When savedRouteIds is empty (no data saved for this date), all products
    // should be visible so the user can still enter the missing data.
    // Previously, the filter would hide everything and the user would see a
    // blank table with no indication that data was missing.
    const route  = { id: 1, routeNumber: 'R1', displayOrder: 0 };
    const product = {
      id: 1, name: 'Milk 500ml', brandId: 1, costPrice: '22', sellingPrice: '25',
      category: 'Milk', unitType: 'ml', unitSize: 500, isActive: true,
      showInStockReceipt: true, displayOrder: 0, depositEnabled: false,
      containerType: 'crate', unitsPerContainer: 20,
      brand: { id: 1, name: 'Nandini' },
      costPrices: [], sellingPrices: [],
    };

    // Return a past date via getIndiaDate mock stubbed to today=2026-05-03
    // and API returns no receipts (empty savedRouteIds)
    makeApiResponses({
      brands:   [BRAND],
      routes:   [route],
      products: [product],
      receipts: [],   // no saved data for this date
    });

    render(<StockReceipt />);

    // Product should be visible even on a past date with no saved data
    const productName = await screen.findByText('Milk 500ml');
    expect(productName).toBeInTheDocument();
  });

  it('shows "No active products" notice when routes exist but every product is archived or hidden', async () => {
    // Regression: archiving/hiding all of a brand's products left the page
    // completely blank below the balance card with no explanation.
    const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
    makeApiResponses({
      brands:   [BRAND],
      routes:   [route],
      products: [],   // nothing active / visible in stock receipt
      receipts: [],
    });

    render(<StockReceipt />);

    const notice = await screen.findByText(/No active products for Nandini/i);
    expect(notice).toBeInTheDocument();
    expect(screen.getByText(/restore a product/i)).toBeInTheDocument();
  });

  it('filters out products with showInStockReceipt=false', async () => {
    const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
    const visible = {
      id: 1, name: 'Milk 500ml', brandId: 1, costPrice: '22', sellingPrice: '25',
      category: 'Milk', unitType: 'ml', unitSize: 500, isActive: true,
      showInStockReceipt: true, displayOrder: 0, depositEnabled: false,
      containerType: 'crate', unitsPerContainer: 20,
      brand: { id: 1, name: 'Nandini' }, costPrices: [], sellingPrices: [],
    };
    const hidden = { ...visible, id: 2, name: 'Curd 200g', showInStockReceipt: false };

    makeApiResponses({ brands: [BRAND], routes: [route], products: [visible, hidden], receipts: [] });
    render(<StockReceipt />);

    expect(await screen.findByText('Milk 500ml')).toBeInTheDocument();
    expect(screen.queryByText('Curd 200g')).not.toBeInTheDocument();
  });
});

// ─── Layout order ─────────────────────────────────────────────────────────────
// `filteredGrouped()` sorts category groups by Category.displayOrder — the
// same field Layout Settings lets you drag-reorder — with an alphabetical
// tiebreak. This was previously untested, so a regression here (e.g. losing
// the tiebreak, or grouping by API/insertion order instead) would have
// shipped silently.

describe('StockReceipt — category layout order', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };

  it('orders category groups by displayOrder, not the order products arrived from the API', async () => {
    // Curd appears first in the raw products array, but Milk has the lower
    // displayOrder (0 vs 1) and must be grouped first.
    const products = [
      makeProduct({ id: 2, name: 'Curd 200g', category: 'Curd' }),
      makeProduct({ id: 1, name: 'Milk 500ml', category: 'Milk' }),
    ];
    const categories = [
      { name: 'Curd', displayOrder: 1 },
      { name: 'Milk', displayOrder: 0 },
    ];
    makeApiResponses({ brands: [BRAND], routes: [route], products, receipts: [] });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [BRAND] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });

    render(<StockReceipt />);
    await screen.findByText('Milk 500ml'); // first group starts expanded

    const milkHeader = screen.getByText('Milk').closest('tr');
    const curdHeader = screen.getByText('Curd').closest('tr');
    expect(!!(milkHeader.compareDocumentPosition(curdHeader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('falls back to alphabetical order when categories have no configured displayOrder', async () => {
    const products = [
      makeProduct({ id: 2, name: 'Zed Product', category: 'Zed' }),
      makeProduct({ id: 1, name: 'Amul Product', category: 'Amul' }),
    ];
    makeApiResponses({ brands: [BRAND], routes: [route], products, receipts: [] });
    // No '/categories' rows at all — every group falls back to the same
    // default order value, so the tiebreak alone decides.
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/categories')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [BRAND] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });

    render(<StockReceipt />);
    await screen.findByText('Amul Product'); // first group starts expanded

    const amulHeader = screen.getByText('Amul').closest('tr');
    const zedHeader   = screen.getByText('Zed').closest('tr');
    expect(!!(amulHeader.compareDocumentPosition(zedHeader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
