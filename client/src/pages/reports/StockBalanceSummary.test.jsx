/**
 * StockBalanceSummary tests.
 *
 * Covers the label renames (Received → Supply, Remaining → Shortage) and the
 * footer row order (Dispatched → Shortage → Supply).
 */

import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StockBalanceSummary from './StockBalanceSummary';
import api from '../../api/axios';

const notify = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ notify }),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../utils/dateUtils');
  return { ...actual, getIndiaDate: () => '2026-07-09' };
});

vi.mock('../../components/DateSelector', () => ({
  default: ({ date }) => <span data-testid="date-selector">{date}</span>,
}));

vi.mock('../../components/BrandTabs', () => ({
  default: () => <div data-testid="brand-tabs" />,
}));

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
  TumblerSpinner: () => <span data-testid="tumbler" />,
}));

function mockApi({ availability = [], dispatch = null } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
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

  it('renders footer rows in Dispatched → Shortage → Supply → Crates order', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50, unitsPerContainer: 20 }],
      dispatch: DISPATCH_DATA,
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const footerLabels = [...container.querySelectorAll('tfoot tr td:first-child')]
      .map(td => td.textContent.trim());
    expect(footerLabels).toEqual(['Dispatched', 'Shortage', 'Supply', 'Crates Received', 'Crates Dispatched']);
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

describe('StockBalanceSummary — crate display precision', () => {
  // 24 per crate, not a divisor of either quantity, so every crate figure on
  // this page must agree at 2 decimals rather than flooring or 1-decimal
  // rounding: 35 received -> 1.46, 15 dispatched -> 0.63, shortage -> 0.83.
  const FRACTIONAL_DISPATCH = {
    date: '2026-07-09',
    brands: [{
      brandId: 1,
      brandName: 'Nandini',
      products: [{ productId: 10, productName: 'Milk 500ml', category: 'Milk', unitsPerContainer: 24 }],
    }],
    rows: [{
      salespersonId: 1,
      salespersonName: 'Ramesh',
      items: { 10: { qty: 15 } },
      totalAmount: 330,
    }],
    totals: { 10: 15 },
  };

  it('shows the same 2-decimal crate figures at the row, column, and grand-total levels', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 35, unitsPerContainer: 24 }],
      dispatch: FRACTIONAL_DISPATCH,
    });
    const { container } = render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');

    // Per-salesperson row: 15 / 24 = 0.625 -> "0.63"
    const ramesRow = screen.getByText('Ramesh').closest('tr');
    expect(within(ramesRow).getByText('0.63')).toBeInTheDocument();

    // Chips + footer: cratesReceived 35/24=1.46, cratesDispatched 15/24=0.63, shortage 0.83
    expect(screen.getAllByText('1.46').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.63').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.83').length).toBeGreaterThan(0);

    // No stray 1-decimal or floored artifacts anywhere on the page.
    expect(container.textContent).not.toMatch(/\b1\.5\b/);
    expect(screen.queryByText('0.6')).not.toBeInTheDocument();
  });
});

describe('StockBalanceSummary — dispatcher access', () => {
  // This page never reads role — it's purely a consumer of whatever the API
  // returns, so a dispatcher (who can reach it, per the route/API gating)
  // sees the exact same read-only page an admin does. Pinning that here
  // guards against someone later adding role-gating logic into this
  // component itself instead of at the route/API layer.
  it('renders identically for a dispatcher — no role-specific branching in this component', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    expect(screen.getAllByText('Supply').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shortage').length).toBeGreaterThan(0);
  });

  // GET /brands is admin-only (routes/brands.js), while this page is reached
  // by dispatchers too. It must derive its brand tabs from the daily-dispatch
  // response instead of calling /brands directly — otherwise a dispatcher's
  // 403 on that call broke the whole page ("Failed to load brands").
  it('never calls the admin-only /brands endpoint', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 50 }],
      dispatch: DISPATCH_DATA,
    });
    render(<StockBalanceSummary />);

    await screen.findByText('Ramesh');
    const calledUrls = vi.mocked(api.get).mock.calls.map(([url]) => url);
    expect(calledUrls.some(url => url.includes('/brands'))).toBe(false);
  });
});

// ─── "Not fully dispatched" detail dialog ───────────────────────────────────

/**
 * The quick answer to "which products were received but not dispatched for
 * this date": a chip (built from the FULL column set, independent of the
 * Entered-only/All-products toggle) that opens a dialog naming each leftover
 * product with its supply → dispatched → left figures, grouped under category
 * headers in dairy layout order. The chip used to filter the table's columns
 * instead, which left the reader decoding a wide grid; the table is now left
 * untouched when the dialog opens.
 */
describe('StockBalanceSummary — not fully dispatched dialog', () => {
  const PRODUCTS_WITH_LEFTOVER = [
    { productId: 10, productName: 'Milk 500ml', category: 'Milk', unitsPerContainer: 20 },
    { productId: 20, productName: 'Curd 200g',  category: 'Curd', unitsPerContainer: 24 },
  ];
  const DISPATCH_WITH_LEFTOVER = {
    ...DISPATCH_DATA,
    brands: [{ brandId: 1, brandName: 'Nandini', products: PRODUCTS_WITH_LEFTOVER }],
    // Product 20 (Curd 200g) was never dispatched at all — the case the
    // default "Entered only" view hides entirely.
    totals: { 10: 40 },
  };
  const AVAILABILITY_WITH_LEFTOVER = [
    { brandId: 1, productId: 10, received: 50,  costPrice: 5 },  // left 10 → ₹50
    { brandId: 1, productId: 20, received: 100, costPrice: 10 }, // left 100 → ₹1000
  ];

  const openDialog = () => fireEvent.click(screen.getByText(/not fully dispatched/));
  const getDialog  = () => screen.getByRole('dialog');

  beforeEach(() => vi.clearAllMocks());

  it('shows a chip with the leftover count and rupee value, built from every column not just the visible ones', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    // 10 × ₹5 + 100 × ₹10 = ₹1,050 — counted even though Curd 200g's column
    // is hidden by the default Entered-only filter.
    expect(screen.getByText(/2 not fully dispatched · ₹1,050\.00/)).toBeInTheDocument();
    expect(screen.queryByText('Curd 200g')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists each leftover product with its supply, dispatched and left figures', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    openDialog();

    const dialog = getDialog();
    // The zero-dispatch product the default table view hides entirely.
    expect(within(dialog).getByText('Curd 200g')).toBeInTheDocument();
    expect(within(dialog).getByText('Milk 500ml')).toBeInTheDocument();
    expect(within(dialog).getByText('Left 10')).toBeInTheDocument();
    expect(within(dialog).getByText('Left 100')).toBeInTheDocument();
    // 100 units left ÷ 24 per crate = 4.17
    expect(within(dialog).getByText('4.17 crates')).toBeInTheDocument();
    // Per-product cost value, plus the ₹1,050 section/footer totals.
    expect(within(dialog).getByText('₹50.00')).toBeInTheDocument();
    expect(within(dialog).getByText('₹1,000.00')).toBeInTheDocument();
    expect(within(dialog).getAllByText('₹1,050.00').length).toBeGreaterThan(0);
  });

  it('groups the products under category headers in layout order', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    openDialog();

    // The API sends products already in dairy layout order (brand →
    // categoryDisplayOrder → displayOrder → name); the dialog must preserve it
    // rather than re-sorting alphabetically, which would put Curd first.
    const dialog = getDialog();
    const headers = [...dialog.querySelectorAll('.sticky')].map(el => el.textContent);
    expect(headers[0]).toContain('Milk');
    expect(headers[1]).toContain('Curd');
    expect(within(dialog).getByText('Milk')).toBeInTheDocument();
    expect(within(dialog).getByText('Curd')).toBeInTheDocument();
  });

  it('leaves the table alone — opening the dialog is not a column filter', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    const { container } = render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    openDialog();

    // Curd 200g appears in the dialog but is still absent from the table's
    // columns, and the Entered-only toggle stays available.
    const table = container.querySelector('table');
    expect(within(table).queryByText('Curd 200g')).not.toBeInTheDocument();
    expect(screen.getByText('Entered only')).toBeInTheDocument();
  });

  it('closes on the Close button', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    openDialog();
    fireEvent.click(within(getDialog()).getByText('Close'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('splits over-dispatch into its own section so it never nets against the leftover value', async () => {
    mockApi({
      availability: [
        { brandId: 1, productId: 10, received: 50, costPrice: 5 },  // left 10 → ₹50
        { brandId: 1, productId: 20, received: 0,  costPrice: 10 }, // 30 dispatched from earlier stock → ₹300
      ],
      dispatch: {
        ...DISPATCH_WITH_LEFTOVER,
        rows: [{ salespersonId: 1, salespersonName: 'Ramesh', items: { 10: { qty: 40 }, 20: { qty: 30 } }, totalAmount: 880 }],
        totals: { 10: 40, 20: 30 },
      },
    });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    // Chip counts and prices only the genuine leftover: 1 product, ₹50 — the
    // −30 over-dispatch must not cancel ₹300 off it.
    expect(screen.getByText(/1 not fully dispatched · ₹50\.00/)).toBeInTheDocument();

    openDialog();
    const dialog = getDialog();
    expect(within(dialog).getByText('Left in stock')).toBeInTheDocument();
    expect(within(dialog).getByText('Dispatched beyond supply')).toBeInTheDocument();
    expect(within(dialog).getByText('Extra 30')).toBeInTheDocument();
    // Once on the product row, once as that section's own total.
    expect(within(dialog).getAllByText('₹300.00')).toHaveLength(2);
  });

  /**
   * On a phone the product list used to be its own scroll box inside the
   * dialog body, so its overlay scrollbar sat hard against the list card's
   * right edge — painted over the section band and the product rows — with a
   * second scrollbar beside it. The dialog body is now the only scroller.
   */
  it('scrolls in one place — the dialog body, with no nested scroll box over the list', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    openDialog();

    const dialog = getDialog();
    const scrollers = dialog.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    expect(scrollers).toHaveLength(1);

    // That one scroller is the body wrapping the content, not the list card.
    const scroller = scrollers[0];
    expect(scroller).toContainElement(within(dialog).getByText('Milk 500ml'));
    expect(scroller.className).toContain('min-h-0');

    // The list card must stay unclipped — overflow-hidden on it would make it
    // a scroll container and stop the category headers from sticking.
    const listCard = within(dialog).getByText('Left in stock').closest('.rounded-xl.border');
    expect(listCard.className).not.toMatch(/overflow-/);
  });

  it('rounds the top of the first section band to match the list card corner', async () => {
    mockApi({ availability: AVAILABILITY_WITH_LEFTOVER, dispatch: DISPATCH_WITH_LEFTOVER });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    openDialog();

    const dialog = getDialog();
    // "Left in stock" is first here; the over-dispatch band below it is not.
    expect(within(dialog).getByText('Left in stock').closest('div').parentElement.className)
      .toContain('rounded-t-xl');
  });

  it('shows no chip when every received product was fully dispatched', async () => {
    mockApi({
      availability: [{ brandId: 1, productId: 10, received: 40, costPrice: 5 }],
      dispatch: DISPATCH_DATA, // dispatched 40, received 40 → remaining 0
    });
    render(<StockBalanceSummary />);
    await screen.findByText('Ramesh');

    expect(screen.queryByText(/not fully dispatched/)).not.toBeInTheDocument();
  });
});
