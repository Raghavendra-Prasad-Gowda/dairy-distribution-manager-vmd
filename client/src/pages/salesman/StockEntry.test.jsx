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

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
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

// ─── Empty / loading states ─────────────────────────────────────────────────

describe('StockEntry — empty and loading states', () => {
  it('shows a loader while the initial fetch is in flight', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    render(<StockEntry />);
    expect(screen.queryByText('Expand All')).not.toBeInTheDocument();
  });

  it('shows "No products enabled" when the salesman has no priced products at all', async () => {
    mockApiFor([]);
    render(<StockEntry />);
    await screen.findByText('No products enabled for your account');
  });

  it('search matches by product name, category, or brand name', async () => {
    mockApiFor([
      product({ productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk' }),
      product({ productId: 2, productName: 'Curd Pot',   brandId: 2, brandName: 'Jersey',  category: 'Curd' }),
    ]);
    await renderExpanded();

    fireEvent.change(screen.getByPlaceholderText(/Search product/), { target: { value: 'jersey' } });
    expect(screen.getByText('Curd Pot')).toBeInTheDocument();
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('clearing the search (X button) restores the full list', async () => {
    mockApiFor([product({ productId: 1, productName: 'Toned Milk' })]);
    await renderExpanded();

    const input = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(input, { target: { value: 'zzz' } });
    await screen.findByText('No products match your search.');

    fireEvent.click(input.parentElement.querySelector('button'));
    expect(input).toHaveValue('');
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();
  });
});

// ─── Expand / collapse ───────────────────────────────────────────────────────

describe('StockEntry — expand / collapse', () => {
  const PRODUCTS = [
    product({ productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk' }),
  ];

  it('starts fully collapsed', async () => {
    mockApiFor(PRODUCTS);
    render(<StockEntry />);
    // "Nandini" also appears in the always-visible "Today's Stock Cost" box —
    // only the brand header copy lives inside a <button>.
    await waitFor(() => {
      const matches = screen.getAllByText('Nandini');
      expect(matches.some(el => el.closest('button'))).toBe(true);
    });
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('clicking a brand header expands just that brand', async () => {
    mockApiFor(PRODUCTS);
    render(<StockEntry />);
    let brandHeader;
    await waitFor(() => {
      brandHeader = screen.getAllByText('Nandini').find(el => el.closest('button'));
      expect(brandHeader).toBeTruthy();
    });
    fireEvent.click(brandHeader.closest('button'));
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('Collapse All re-collapses everything after Expand All', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
  });

  it('clicking a category header collapses just that category, leaving the brand expanded', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();
    expect(screen.getByText('Toned Milk')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Milk').closest('button'));
    expect(screen.queryByText('Toned Milk')).not.toBeInTheDocument();
    // Brand header itself stays expanded — the category header is still shown.
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });
});

// ─── Quantity entry ──────────────────────────────────────────────────────────

describe('StockEntry — quantity entry', () => {
  const PRODUCTS = [
    product({ productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk', sellingPrice: 25 }),
  ];

  it('a product with no price shows "No price set" and disabled controls', async () => {
    mockApiFor([product({ productId: 1, productName: 'Mystery Item', brandId: 1, brandName: 'Nandini', sellingPrice: null })]);
    await renderExpanded();

    expect(screen.getByText('No price set')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });

  it('shows litres for an ml product once quantity is entered', async () => {
    mockApiFor([product({
      productId: 1, productName: 'Toned 500ml', brandId: 1, brandName: 'Nandini',
      unitType: 'ml', unitSize: 500, sellingPrice: 25,
    })]);
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
    expect(await screen.findByText('2 L')).toBeInTheDocument(); // 4 × 500ml = 2L
  });

  it('shows kg for a gram product once quantity is entered', async () => {
    mockApiFor([product({
      productId: 1, productName: 'Curd 400g', brandId: 1, brandName: 'Nandini',
      unitType: 'gram', unitSize: 400, sellingPrice: 25,
    })]);
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    expect(await screen.findByText('2 kg')).toBeInTheDocument(); // 5 × 400g = 2kg
  });

  it('shows the grand total footer once at least one product is filled', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    expect(screen.queryByText('Grand Total')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    expect(await screen.findByText('Grand Total')).toBeInTheDocument();
  });
});

// ─── Balance card ────────────────────────────────────────────────────────────

describe('StockEntry — balance card', () => {
  function mockApiWithBalance(products, balance) {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/prices'))              return Promise.resolve({ data: { data: products } });
      if (url.includes('/dispatches'))          return Promise.resolve({ data: { data: [] } });
      if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: balance } });
      return Promise.resolve({ data: { data: [] } });
    });
  }

  it('shows "Settled" with no outstanding balance', async () => {
    mockApiWithBalance([], { openingBalance: 0, stockGiven: 0, amountPaid: 0, closingBalance: 0 });
    render(<StockEntry />);
    await screen.findByText('Settled');
  });

  it('shows "Balance Due" when the salesman owes money', async () => {
    mockApiWithBalance([], { openingBalance: 500, stockGiven: 1000, amountPaid: 200, closingBalance: 1300 });
    render(<StockEntry />);
    await screen.findByText('Balance Due');
    expect(screen.getByText('₹1,300.00')).toBeInTheDocument();
  });

  it('defaults to a zeroed balance when the API returns no row for the date', async () => {
    mockApiWithBalance([], null);
    render(<StockEntry />);
    await screen.findByText('Settled');
  });
});

// ─── Save flow ───────────────────────────────────────────────────────────────

describe('StockEntry — save (draft)', () => {
  const PRODUCTS = [
    product({ productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk', sellingPrice: 25 }),
  ];

  // Note: handleSave's "nothing filled and no dispatch" warning branch is
  // unreachable through the UI — the Save button is disabled by the exact
  // same condition (`filledCount === 0 && !dispatch`), so a click never
  // reaches the handler in that state. Confirmed dead/defensive code, not
  // covered here for the same reason BrandsSetup's analogous guard isn't.
  it('disables the Save button when nothing is filled and there is no existing dispatch', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  it('saves a draft with the entered quantities', async () => {
    mockApiFor(PRODUCTS);
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 1 } } });
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dispatches', {
      dispatchDate: '2026-08-09',
      items: [{ productId: 1, quantity: 3, unitPrice: 25 }],
    }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Stock entry saved as draft.', 'success'));
  });

  it('shows an error notification when saving fails', async () => {
    mockApiFor(PRODUCTS);
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Stock guard failed' } } });
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Stock guard failed', 'error'));
  });

  it('falls back to a generic error message when save fails with no server error', async () => {
    mockApiFor(PRODUCTS);
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Save failed.', 'error'));
  });

  it('clears an existing draft when quantities are emptied and saved ("Clear" button)', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/prices'))     return Promise.resolve({ data: { data: PRODUCTS } });
      if (url.includes('/dispatches')) return Promise.resolve({ data: { data: [{ id: 9, isSubmitted: false, items: [{ productId: 1, quantity: 3, unitPrice: 25 }] }] } });
      if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: [] } });
    });
    vi.mocked(api.post).mockResolvedValue({ data: { data: null } });
    await renderExpanded();

    // Existing dispatch pre-fills 3; clear it back to empty.
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(3);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dispatches', { dispatchDate: '2026-08-09', items: [] }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Stock entry cleared.', 'success'));
  });
});

// ─── Submit flow ─────────────────────────────────────────────────────────────

describe('StockEntry — submit (finalize)', () => {
  const PRODUCTS = [
    product({ productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk', sellingPrice: 25 }),
  ];

  it('the Finalize & Submit button is disabled until something is filled', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();
    expect(screen.getByRole('button', { name: /Finalize/ })).toBeDisabled();
  });

  it('opens a confirmation modal before submitting', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));

    expect(screen.getByText('Finalize stock entry?')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('cancel on the confirmation modal does not submit', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Finalize stock entry?')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('closing the confirmation modal via the X button does not submit', async () => {
    mockApiFor(PRODUCTS);
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.queryByText('Finalize stock entry?')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('confirming submits, locks, and shows success', async () => {
    mockApiFor(PRODUCTS);
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 5 } } });
    vi.mocked(api.patch).mockResolvedValue({ data: { data: {} } });
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    fireEvent.click(screen.getAllByText(/Finalize.*Submit/).at(-1));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dispatches', {
      dispatchDate: '2026-08-09',
      items: [{ productId: 1, quantity: 2, unitPrice: 25 }],
      submitting: true,
    }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/dispatches/5/submit'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Stock entry submitted and locked.', 'success'));
  });

  it('falls back to the existing dispatch id when the save response has none', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/prices'))     return Promise.resolve({ data: { data: PRODUCTS } });
      if (url.includes('/dispatches')) return Promise.resolve({ data: { data: [{ id: 7, isSubmitted: false, items: [] }] } });
      if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: [] } });
    });
    vi.mocked(api.post).mockResolvedValue({ data: { data: null } });
    vi.mocked(api.patch).mockResolvedValue({ data: { data: {} } });
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    fireEvent.click(screen.getAllByText(/Finalize.*Submit/).at(-1));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/dispatches/7/submit'));
  });

  it('shows an error notification when submitting fails', async () => {
    mockApiFor(PRODUCTS);
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Submit blocked' } } });
    await renderExpanded();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    fireEvent.click(screen.getAllByText(/Finalize.*Submit/).at(-1));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Submit blocked', 'error'));
  });
});

// ─── Locked states ───────────────────────────────────────────────────────────

describe('StockEntry — locked entries', () => {
  const PRODUCTS = [
    product({ productId: 1, productName: 'Toned Milk', brandId: 1, brandName: 'Nandini', category: 'Milk', sellingPrice: 25 }),
  ];

  function mockLockedDispatch(dispatchOverrides) {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/prices'))     return Promise.resolve({ data: { data: PRODUCTS } });
      if (url.includes('/dispatches')) return Promise.resolve({ data: { data: [{ id: 1, items: [{ productId: 1, quantity: 2, unitPrice: 25 }], ...dispatchOverrides }] } });
      if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: [] } });
    });
  }

  it('shows "Submitted & locked" and disables the quantity input when submitted and not admin-unlocked', async () => {
    mockLockedDispatch({ isLocked: true, isSubmitted: true, isAdminUnlocked: false });
    await renderExpanded();

    expect(screen.getByText('Submitted & locked')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
  });

  it('an admin-unlocked entry stays editable even though isSubmitted is true', async () => {
    mockLockedDispatch({ isLocked: false, isSubmitted: true, isAdminUnlocked: true });
    await renderExpanded();

    expect(screen.getByRole('spinbutton')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
  });

  it('shows "Past date — locked" for an implicitly-locked past date with no dispatch row', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url.includes('/prices'))     return Promise.resolve({ data: { data: PRODUCTS } });
      if (url.includes('/dispatches')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/salesperson-balance')) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<StockEntry />);
    fireEvent.change(await screen.findByDisplayValue('2026-08-09'), { target: { value: '2020-01-01' } });
    await screen.findByText('Past date — locked');
  });
});
