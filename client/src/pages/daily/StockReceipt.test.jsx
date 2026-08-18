/**
 * StockReceipt component smoke tests.
 *
 * Regression: StockReceipt previously crashed on every render because
 * `filteredGrouped()` referenced `today` which was never defined in the
 * component scope (ReferenceError → ErrorBoundary "Something went wrong").
 * Fix: added `const today = getIndiaDate()` inside the component.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
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

// ─── Crate display precision ──────────────────────────────────────────────
// Regression: several crate figures on this page (line, category badge,
// route summary card, footer total) previously rounded to 1 decimal place
// via .toFixed(1), while the line-level calcContainerDisplay() helper was
// already .toFixed(2) — producing "1.5" next to "1.46" for the same data.
// All of them must now agree at 2 decimals.

describe('StockReceipt — crate display precision', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };

  it('shows the same 2-decimal crate figure at the line, category, route-card, and footer levels', async () => {
    // 35 units / 24 per crate = 1.4583... -> must render as "1.46" everywhere,
    // not "1.5" (old 1-decimal rounding) and not "1" (old flooring).
    const product = makeProduct({ id: 1, name: 'Milk 500ml', category: 'Milk', unitsPerContainer: 24 });
    const receipts = [{ routeId: 1, productId: 1, quantity: 35 }];

    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts });
    render(<StockReceipt />);

    await screen.findByText('Milk 500ml');

    const matches = await screen.findAllByText((content) => content.includes('1.46') && content.includes('Crate'));
    expect(matches.length).toBeGreaterThanOrEqual(4); // line + category badge + route card + footer

    // None of the old rounding artifacts should be present.
    expect(screen.queryByText((content) => content.includes('1.5 Crate'))).not.toBeInTheDocument();
    expect(screen.queryByText((content) => /^1 Crate/.test(content))).not.toBeInTheDocument();
  });
});

// ─── Loading / error states ───────────────────────────────────────────────

describe('StockReceipt — loading and error states', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };

  it('shows a loader in the table while products/receipts are in flight', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))  return Promise.resolve({ data: { data: [BRAND] } });
      if (url.includes('/routes')) return Promise.resolve({ data: { data: [route] } });
      // products/stock-receipts never resolve — keeps `loading` true.
      if (url.includes('/products') || url.includes('/stock-receipts')) return new Promise(() => {});
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockReceipt />);
    await screen.findByText('Nandini Stock Receipt');
    // The table only renders once routes exist; loader occupies the body.
    expect(screen.queryByText('No active products for Nandini')).not.toBeInTheDocument();
  });

  it('notifies an error when the brands request fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands')) return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockReceipt />);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to load brands', 'error'));
  });

  it('falls back to an empty route list (and shows the "no routes" notice) when the routes request fails', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [BRAND] } });
      if (url.includes('/routes'))     return Promise.reject(new Error('routes down'));
      if (url.includes('/categories')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockReceipt />);
    expect(await screen.findByText(/No routes configured for Nandini/i)).toBeInTheDocument();
  });
});

// ─── Route selection ─────────────────────────────────────────────────────

describe('StockReceipt — route selection', () => {
  const routes = [
    { id: 1, routeNumber: 'R1', displayOrder: 0 },
    { id: 2, routeNumber: 'R2', displayOrder: 1 },
  ];
  const product = makeProduct({ id: 1, name: 'Milk 500ml', category: 'Milk' });

  it('defaults to the first route and switches the table when another route pill is clicked', async () => {
    const receipts = [
      { routeId: 1, productId: 1, quantity: 10 },
      { routeId: 2, productId: 1, quantity: 6 },
    ];
    makeApiResponses({ brands: [BRAND], routes, products: [product], receipts });
    render(<StockReceipt />);

    await screen.findByText('Milk 500ml');
    // Footer shows the active route's own total (Route R1 = 10 units).
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);

    const r2Card = screen.getAllByText('Route R2').find(el => el.closest('button')).closest('button');
    fireEvent.click(r2Card);
    // Footer now labels R2 and the input reflects R2's saved quantity (6).
    expect(await screen.findByRole('spinbutton')).toHaveValue(6);
  });

  it('shows a dash placeholder on a route summary card with no saved data', async () => {
    makeApiResponses({ brands: [BRAND], routes, products: [product], receipts: [{ routeId: 1, productId: 1, quantity: 10 }] });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    // R2's summary card has no data at all — its Total Units cell is a dash.
    const r2Card = screen.getAllByText('Route R2').find(el => el.closest('button')).closest('button');
    expect(r2Card.textContent).toContain('—');
  });
});

// ─── Search ──────────────────────────────────────────────────────────────

describe('StockReceipt — search', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
  const products = [
    makeProduct({ id: 1, name: 'Toned Milk', category: 'Milk' }),
    makeProduct({ id: 2, name: 'Curd Pot', category: 'Curd' }),
  ];
  // Explicit ordering so Milk (containing "Toned Milk") is the first,
  // already-expanded category group — otherwise the default alphabetical
  // fallback would expand Curd first and hide Toned Milk from the start.
  const categories = [
    { name: 'Milk', displayOrder: 0 },
    { name: 'Curd', displayOrder: 1 },
  ];

  function mockSearchData() {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [BRAND] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
      if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/dairy-balance')) return Promise.resolve({ data: { data: { brands: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
  }

  it('filters products by name or category and the X button clears it', async () => {
    mockSearchData();
    render(<StockReceipt />);
    await screen.findByText('Toned Milk');

    const input = screen.getByPlaceholderText('Search product or category…');
    fireEvent.change(input, { target: { value: 'curd' } });
    expect(screen.getByText('Curd Pot')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(await screen.findByText('Toned Milk')).toBeInTheDocument();
  });

  it('shows "No products match your search" when nothing matches', async () => {
    mockSearchData();
    render(<StockReceipt />);
    await screen.findByText('Toned Milk');

    fireEvent.change(screen.getByPlaceholderText('Search product or category…'), { target: { value: 'zzz-none' } });
    expect(await screen.findByText('No products match your search.')).toBeInTheDocument();
  });
});

// ─── Expand / collapse categories ─────────────────────────────────────────

describe('StockReceipt — expand / collapse categories', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
  const products = [
    makeProduct({ id: 1, name: 'Toned Milk', category: 'Milk' }),
    makeProduct({ id: 2, name: 'Curd Pot', category: 'Curd' }),
  ];
  const categories = [
    { name: 'Milk', displayOrder: 0 },
    { name: 'Curd', displayOrder: 1 },
  ];

  function mockTwoCategoryData() {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [BRAND] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
      if (url.includes('/products'))   return Promise.resolve({ data: { data: products } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/dairy-balance')) return Promise.resolve({ data: { data: { brands: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
  }

  it('starts with only the first category expanded', async () => {
    mockTwoCategoryData();
    render(<StockReceipt />);
    await screen.findByText('Toned Milk');
    expect(screen.queryByText('Curd Pot')).not.toBeInTheDocument();
  });

  it('clicking a collapsed category header expands it', async () => {
    mockTwoCategoryData();
    render(<StockReceipt />);
    await screen.findByText('Toned Milk');

    fireEvent.click(screen.getByText('Curd').closest('tr'));
    expect(screen.getByText('Curd Pot')).toBeInTheDocument();
  });

  it('Expand All reveals every category, Collapse All hides them again', async () => {
    mockTwoCategoryData();
    render(<StockReceipt />);
    await screen.findByText('Toned Milk');
    expect(screen.queryByText('Curd Pot')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Expand'));
    expect(screen.getByText('Curd Pot')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Collapse'));
    expect(screen.queryByText('Curd Pot')).not.toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });
});

// ─── Quantity entry ────────────────────────────────────────────────────────

describe('StockReceipt — quantity entry', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };

  it('typing a quantity updates the line amount and keyboard-Enter moves focus to the next input', async () => {
    const products = [
      makeProduct({ id: 1, name: 'A Milk', category: 'Milk', displayOrder: 0, costPrice: '10' }),
      makeProduct({ id: 2, name: 'B Milk', category: 'Milk', displayOrder: 1, costPrice: '10' }),
    ];
    makeApiResponses({ brands: [BRAND], routes: [route], products, receipts: [] });
    render(<StockReceipt />);
    await screen.findByText('A Milk');

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '5' } });
    // ₹50.00 (5 × 10) shows up at the line, category badge, and footer levels
    // simultaneously — assert it appears rather than pin a single node.
    await waitFor(() => expect(screen.getAllByText('₹50.00').length).toBeGreaterThan(0));

    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: 'Enter' });
    expect(inputs[1]).toHaveFocus();
  });
});

// ─── Deposit display ────────────────────────────────────────────────────────

describe('StockReceipt — deposit display', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
  const depositBrand = { id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: '2', depositCalcMethod: 'unit' };
  const categories = [{ name: 'Milk', displayOrder: 0, depositEnabled: true }];

  it('adds a live deposit line once a deposit-eligible product has quantity entered', async () => {
    const product = makeProduct({
      id: 1, name: 'Milk 500ml', category: 'Milk', costPrice: '20',
      depositEnabled: true, unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [depositBrand] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
      if (url.includes('/products'))   return Promise.resolve({ data: { data: [product] } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/dairy-balance')) return Promise.resolve({ data: { data: { brands: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    expect(screen.queryByText('Deposit')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
    // 20 units × 0.5L × ₹2/L = ₹20.00 deposit
    expect(await screen.findByText('Deposit')).toBeInTheDocument();
  });

  it('computes deposit per whole crate when depositCalcMethod is "crate"', async () => {
    const crateBrand = { ...depositBrand, depositCalcMethod: 'crate' };
    const product = makeProduct({
      id: 1, name: 'Milk 500ml', category: 'Milk', costPrice: '20',
      depositEnabled: true, unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [crateBrand] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } });
      if (url.includes('/products'))   return Promise.resolve({ data: { data: [product] } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/dairy-balance')) return Promise.resolve({ data: { data: { brands: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    // 25 units → floor(25/20)=1 whole crate × (20 × 0.5L) × ₹2/L = ₹20.00,
    // NOT the per-unit rate (25 × 0.5 × 2 = ₹25.00) — proves the crate-floor
    // branch, not the default per-unit branch, is what ran.
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } });
    expect(await screen.findByText('₹20.00')).toBeInTheDocument();
    expect(screen.queryByText('₹25.00')).not.toBeInTheDocument();
  });

  it('excludes a product from the deposit total when its category has deposit disabled', async () => {
    const product = makeProduct({
      id: 1, name: 'Milk 500ml', category: 'Curd', costPrice: '20', // category not in `categories` (deposit-enabled list)
      depositEnabled: true, unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/brands'))     return Promise.resolve({ data: { data: [depositBrand] } });
      if (url.includes('/routes'))     return Promise.resolve({ data: { data: [route] } });
      if (url.includes('/categories')) return Promise.resolve({ data: { data: categories } }); // only "Milk" is deposit-enabled
      if (url.includes('/products'))   return Promise.resolve({ data: { data: [product] } });
      if (url.includes('/stock-receipts')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/dairy-balance')) return Promise.resolve({ data: { data: { brands: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
    await waitFor(() => expect(screen.getAllByText('₹400.00').length).toBeGreaterThan(0)); // stock only, 20 × 20
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument();
  });
});

// ─── Save flow ──────────────────────────────────────────────────────────────

describe('StockReceipt — save', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
  const product = makeProduct({ id: 1, name: 'Milk 500ml', category: 'Milk', costPrice: '20' });

  it('the Save button is disabled until a quantity is entered', async () => {
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts: [] });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');
    expect(screen.getByRole('button', { name: /Save Route R1/ })).toBeDisabled();
  });

  it('saves the entered quantities and refreshes the balance', async () => {
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts: [] });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Route R1/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stock-receipts/bulk', {
      brandId: 1,
      date: '2026-05-03',
      items: [{ productId: 1, quantity: 3, unitPrice: 20 }],
      routeId: 1,
    }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Route R1 receipt saved!', 'success'));
  });

  it('shows the server error message when saving fails', async () => {
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts: [] });
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Duplicate receipt' } } });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Route R1/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Duplicate receipt', 'error'));
  });

  it('falls back to a generic error message when saving fails with no server error', async () => {
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts: [] });
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Route R1/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Save failed.', 'error'));
  });

  it('allows saving an emptied-out route that already had saved data (clearing it)', async () => {
    const receipts = [{ routeId: 1, productId: 1, quantity: 3 }];
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    render(<StockReceipt />);
    await screen.findByText('Milk 500ml');

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(3);
    fireEvent.change(input, { target: { value: '' } });
    // Not disabled — this route already has savedRouteIds data, so the
    // "nothing filled" guard doesn't block re-saving an emptied route.
    expect(screen.getByRole('button', { name: /Save Route R1/ })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Save Route R1/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stock-receipts/bulk', {
      brandId: 1,
      date: '2026-05-03',
      items: [],
      routeId: 1,
    }));
  });
});

// ─── Balance card ────────────────────────────────────────────────────────

describe('StockReceipt — balance card', () => {
  const route = { id: 1, routeNumber: 'R1', displayOrder: 0 };
  const product = makeProduct({ id: 1, name: 'Milk 500ml', category: 'Milk' });

  it('shows "You Owe" with the outstanding amount when closingBalance is positive', async () => {
    const balance = { brandId: 1, openingBalance: 100, stockValue: 200, depositValue: 0, amountPaid: 50, closingBalance: 250 };
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts: [], balance });
    render(<StockReceipt />);
    expect(await screen.findByText('You Owe')).toBeInTheDocument();
    expect(screen.getByText('₹250.00')).toBeInTheDocument();
  });

  it('shows "Settled" when there is no outstanding balance', async () => {
    makeApiResponses({ brands: [BRAND], routes: [route], products: [product], receipts: [], balance: null });
    render(<StockReceipt />);
    expect(await screen.findByText('Settled')).toBeInTheDocument();
  });
});
