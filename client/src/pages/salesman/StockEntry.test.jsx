/**
 * StockEntry (salesman) — layout order tests.
 *
 * The product hierarchy here is built entirely client-side from a flat
 * `/salespeople/:id/prices` response: brands are grouped, then categories
 * within each brand, then products within each category — each level sorted
 * by its own display-order field, exactly like the admin pricing tab and the
 * Profit & Loss report. None of that sorting was covered by a test before,
 * so a regression (e.g. accidentally sorting by name only, or dropping a
 * tiebreak) would have shipped silently. These tests feed the hierarchy a
 * deliberately scrambled API response and assert the rendered order.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StockEntry from './StockEntry';
import api from '../../api/axios';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { salespersonId: 1 } }),
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-08-09' };
});

function product(overrides) {
  return {
    productId: 0, productName: '', brandId: 0, brandName: '', brandDisplayOrder: 0,
    category: 'General', categoryDisplayOrder: 999, displayOrder: 0,
    unitType: 'piece', unitSize: null, containerType: null, unitsPerContainer: null,
    sellingPrice: 10, isEnabled: true, salespersonEnabled: true,
    ...overrides,
  };
}

function mockApiFor(products) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.includes('/prices'))            return Promise.resolve({ data: { data: products } });
    if (url.includes('/dispatches'))         return Promise.resolve({ data: { data: [] } });
    if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: null } });
    return Promise.resolve({ data: { data: [] } });
  });
}

/** Only brand/category header buttons carry this pair of classes. */
function headerButtons(bgClass, activeClass) {
  return screen.getAllByRole('button').filter(
    b => b.className.includes(bgClass) && b.className.includes(activeClass)
  );
}
const brandHeaders    = () => headerButtons('bg-emerald-800', 'active:bg-emerald-700');
const categoryHeaders = () => headerButtons('bg-slate-50', 'active:bg-slate-100');

/** True if `a` renders strictly before `b` in the document. */
function isBefore(a, b) {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

async function renderExpanded() {
  const utils = render(<StockEntry />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await screen.findByText('Expand All');
  fireEvent.click(screen.getByText('Expand All'));
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StockEntry — brand → category → product layout order', () => {
  // Deliberately out of every order the sort should produce: Jersey (the
  // higher brandDisplayOrder) listed first, Curd (the higher
  // categoryDisplayOrder) before Milk, and products within Milk in reverse
  // of their own displayOrder.
  //
  // Nandini's brandId (9) is deliberately numerically HIGHER than Jersey's
  // (1) — plain objects iterate canonical-integer keys in ascending numeric
  // order regardless of insertion order, so if brandId happened to already
  // match the intended brandDisplayOrder ranking, a missing/broken sort
  // could still "pass" by accident. This keeps the test honest.
  const PRODUCTS = [
    product({ productId: 3, productName: 'HTM 210ml',    brandId: 1, brandName: 'Jersey',  brandDisplayOrder: 1,
      category: 'Full Cream', categoryDisplayOrder: 0, displayOrder: 0 }),
    product({ productId: 2, productName: 'Curd 200g',    brandId: 9, brandName: 'Nandini', brandDisplayOrder: 0,
      category: 'Curd', categoryDisplayOrder: 1, displayOrder: 0 }),
    product({ productId: 1, productName: 'Toned Milk',   brandId: 9, brandName: 'Nandini', brandDisplayOrder: 0,
      category: 'Milk', categoryDisplayOrder: 0, displayOrder: 1 }),
    product({ productId: 4, productName: 'Special Milk', brandId: 9, brandName: 'Nandini', brandDisplayOrder: 0,
      category: 'Milk', categoryDisplayOrder: 0, displayOrder: 0 }),
  ];

  it('orders brands by brandDisplayOrder, not by the order the API returned them', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    const [first, second] = brandHeaders();
    expect(first.textContent.trim()).toBe('Nandini');   // brandDisplayOrder 0
    expect(second.textContent.trim()).toBe('Jersey');    // brandDisplayOrder 1
  });

  it('orders categories within a brand by categoryDisplayOrder', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    const nandiniCats = categoryHeaders().filter(b => ['Milk', 'Curd'].includes(b.textContent.trim()));
    expect(nandiniCats.map(b => b.textContent.trim())).toEqual(['Milk', 'Curd']); // Milk=0, Curd=1
  });

  it('orders products within a category by their own displayOrder, not the API order', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    const specialMilk = screen.getByText('Special Milk'); // displayOrder 0
    const tonedMilk    = screen.getByText('Toned Milk');   // displayOrder 1
    expect(isBefore(specialMilk, tonedMilk)).toBe(true);
  });

  it('renders the full hierarchy top to bottom exactly in layout order', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    const [nandini, jersey]   = brandHeaders();
    const milk    = categoryHeaders().find(b => b.textContent.trim() === 'Milk');
    const curd    = categoryHeaders().find(b => b.textContent.trim() === 'Curd');
    const cream   = categoryHeaders().find(b => b.textContent.trim() === 'Full Cream');
    const special = screen.getByText('Special Milk');
    const toned   = screen.getByText('Toned Milk');
    const curdRow = screen.getByText('Curd 200g');
    const htm     = screen.getByText('HTM 210ml');

    const order = [nandini, milk, special, toned, curd, curdRow, jersey, cream, htm];
    for (let i = 0; i < order.length - 1; i++) {
      expect(isBefore(order[i], order[i + 1])).toBe(true);
    }
  });

  it('falls back to alphabetical order when display orders tie', async () => {
    mockApiFor([
      product({ productId: 1, productName: 'Zed Milk',  brandId: 1, brandName: 'Nandini', category: 'Milk', displayOrder: 0 }),
      product({ productId: 2, productName: 'Amul Milk', brandId: 1, brandName: 'Nandini', category: 'Milk', displayOrder: 0 }),
    ]);
    await renderExpanded();

    const amul = screen.getByText('Amul Milk');
    const zed  = screen.getByText('Zed Milk');
    expect(isBefore(amul, zed)).toBe(true);
  });
});

describe('StockEntry — crate display precision', () => {
  // 35 units / 24 per crate = 1.4583... — the line, category, brand, and
  // grand-total crate figures must all agree at 2 decimal places (they
  // previously drifted: the line showed 2 decimals, the totals rounded to 1).
  const PARTIAL_CRATE_PRODUCT = product({
    productId: 1, productName: 'HTM 490ml', brandId: 1, brandName: 'Jersey',
    category: 'Milk', unitType: 'ml', unitSize: 490,
    containerType: 'crate', unitsPerContainer: 24,
  });

  function mockApiWithDispatch(products, quantity) {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/prices'))             return Promise.resolve({ data: { data: products } });
      if (url.includes('/dispatches'))         return Promise.resolve({ data: { data: [{ id: 1, items: [{ productId: 1, quantity, unitPrice: 0 }] }] } });
      if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: [] } });
    });
  }

  it('shows the same 2-decimal crate figure at the line, category, brand, and grand-total levels', async () => {
    mockApiWithDispatch([PARTIAL_CRATE_PRODUCT], 35);
    await renderExpanded();

    // With a single product, the line/category/brand/grand-total figures are
    // all numerically identical — every one of them must read "1.46 Crates".
    expect(screen.getAllByText('1.46 Crates').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/^1\.5 /)).toBeNull(); // the old 1-decimal rounding must not reappear
  });
});
