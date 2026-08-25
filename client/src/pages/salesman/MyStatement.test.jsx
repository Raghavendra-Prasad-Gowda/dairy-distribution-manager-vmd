/**
 * MyStatement tests.
 *
 * Covers the salesman statement additions: per-item crates/litres derivation,
 * brand grouping with crates/litres/amount badges, the day-level totals line
 * above Payments Made, the period Total Crates / Total Litres cards, and the
 * admin top-up section being kept out of "Payments Made".
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyStatement from './MyStatement';
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
  return {
    ...actual,
    getIndiaDate: () => '2026-08-08',
    getFirstDayOfMonth: () => '2026-08-01',
  };
});

vi.mock('../../components/ui/BrandedLoader', () => ({
  default: () => <div data-testid="loader" />,
  TumblerSpinner: () => <span data-testid="tumbler" />,
}));

/**
 * One statement day: 120 × HTM 1000ml (12/crate) and 24 × DTM Curd 1000g
 * (12/crate) from Jersey, plus 240 × Curd 200g (24/crate) from Nandini.
 */
const ROW = {
  date: '2026-08-06',
  openingBalance: 1000,
  stockGiven: 7000,
  amountPaid: 2000,
  closingBalance: 6000,
  items: [
    {
      brandName: 'Jersey', productName: 'HTM 1000ml',
      quantity: 120, unitPrice: 44.5, totalAmount: 5340,
      unitType: 'ml', unitSize: 1000, unitsPerContainer: 12,
    },
    {
      brandName: 'Jersey', productName: 'DTM Curd 1000g',
      quantity: 24, unitPrice: 48, totalAmount: 1152,
      unitType: 'gram', unitSize: 1000, unitsPerContainer: 12,
    },
    {
      brandName: 'Nandini', productName: 'Curd 200g',
      quantity: 240, unitPrice: 12.4, totalAmount: 2976,
      unitType: 'gram', unitSize: 200, unitsPerContainer: 24,
    },
  ],
  payments: [{ amount: 2000, mode: 'Cash', ref: null }],
  topUps: [],
};

function mockStatement(rows) {
  api.get.mockResolvedValue({ data: { data: rows } });
}

/**
 * Renders, expands the day row, and returns a scope limited to the mobile card
 * list. The page renders mobile (md:hidden) and desktop (hidden md:block)
 * variants of the same data, and jsdom applies no media queries — so both are
 * in the DOM and every query would otherwise match twice.
 */
async function renderExpanded(rows = [ROW]) {
  mockStatement(rows);
  const { container } = render(<MyStatement />);
  const expandAll = (await screen.findAllByText(/Expand All/i))[0];
  fireEvent.click(expandAll);
  return within(container.querySelector('.md\\:hidden'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MyStatement — crates and litres', () => {
  it('shows period Total Crates and Total Litres cards', async () => {
    mockStatement([ROW]);
    render(<MyStatement />);

    // Crates: floor(120/12)=10 + floor(24/12)=2 + floor(240/24)=10 → 22
    const crates = await screen.findByText('Total Crates');
    expect(within(crates.closest('div')).getByText('22')).toBeInTheDocument();
  });

  it('counts litres from ml products only, ignoring gram-measured items', async () => {
    mockStatement([ROW]);
    render(<MyStatement />);

    // Only HTM 1000ml counts: 120 × 1000ml = 120 L. The two curds are grams.
    const litres = await screen.findByText('Total Litres');
    expect(within(litres.closest('div')).getByText('120 L')).toBeInTheDocument();
  });

  it('hides the crates/litres cards entirely when nothing qualifies', async () => {
    mockStatement([{
      ...ROW,
      items: [{
        brandName: 'Nandini', productName: 'Loose item',
        quantity: 3, unitPrice: 10, totalAmount: 30,
        unitType: 'piece', unitSize: null, unitsPerContainer: null,
      }],
    }]);
    render(<MyStatement />);

    await screen.findByText(/tap a row to expand/i);
    expect(screen.queryByText('Total Crates')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Litres')).not.toBeInTheDocument();
  });

  it('treats unitsPerContainer of 0 as "no crates" rather than dividing by zero', async () => {
    // The API sends 0 (not null) for products with no container — dividing
    // would yield Infinity, which previously rendered as a blank/NaN cell.
    mockStatement([{
      ...ROW,
      items: [{
        brandName: 'Nandini', productName: 'Odd item',
        quantity: 10, unitPrice: 5, totalAmount: 50,
        unitType: 'ml', unitSize: 500, unitsPerContainer: 0,
      }],
    }]);
    render(<MyStatement />);

    // 10 × 500ml still gives 5 L, so the card pair renders; crates must read a
    // plain 0 rather than Infinity from a divide-by-zero.
    const crates = await screen.findByText('Total Crates');
    expect(within(crates.closest('div')).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
  });
});

describe('MyStatement — brand grouping', () => {
  it('groups stock-received items under a header per brand', async () => {
    const panel = await renderExpanded();

    expect(panel.getByText('Jersey')).toBeInTheDocument();
    expect(panel.getByText('Nandini')).toBeInTheDocument();
  });

  it('shows each brand its own crates, litres and amount badges', async () => {
    const panel = await renderExpanded();

    // Jersey: floor(120/12) + floor(24/12) = 12 crates, 120 L (curd is grams),
    // ₹5,340 + ₹1,152 = ₹6,492 — a brand total distinct from any single line.
    expect(panel.getByText('12 crates')).toBeInTheDocument();
    expect(panel.getByText('₹6,492.00')).toBeInTheDocument();
    // Nandini: floor(240/24) = 10 crates, no litres badge (grams only).
    // Now that per-product chips are also shown, '10 crates' appears both in
    // the brand header and in the Curd 200g product row — getAllByText is fine.
    expect(panel.getAllByText('10 crates').length).toBeGreaterThanOrEqual(1);
    // Its ₹2,976 total matches its one product line, so it appears twice —
    // once as the header badge, once as the line amount.
    expect(panel.getAllByText('₹2,976.00')).toHaveLength(2);
  });

  it('shows a day-level Total line with combined crates and litres', async () => {
    const panel = await renderExpanded();

    const totalRow = panel.getByText('Total').closest('div');
    expect(within(totalRow).getByText('22 crates')).toBeInTheDocument();
    expect(within(totalRow).getByText('120 L')).toBeInTheDocument();
  });

  it('no longer repeats the brand name on every product line', async () => {
    const panel = await renderExpanded();

    // Jersey has two products but appears once, as a group header.
    expect(panel.getByText('HTM 1000ml')).toBeInTheDocument();
    expect(panel.getByText('DTM Curd 1000g')).toBeInTheDocument();
    expect(panel.getAllByText('Jersey')).toHaveLength(1);
  });

  it('shows a partial crate to 2 decimal places rather than flooring to a whole number', async () => {
    // 35 units / 24 per crate = 1.4583... — matches Stock Entry's own
    // 2-decimal display for the identical figure, not the old floor(1) behaviour.
    const panel = await renderExpanded([{
      ...ROW,
      items: [{
        brandName: 'Jersey', productName: 'HTM 490ml',
        quantity: 35, unitPrice: 0, totalAmount: 0,
        unitType: 'ml', unitSize: 490, unitsPerContainer: 24,
      }],
      payments: [],
    }]);
    // Appears twice: once as the brand group's own badge, once as the
    // day-level Total (the single item makes both figures identical).
    expect(panel.getAllByText('1.46 crates').length).toBeGreaterThan(0);
    expect(panel.queryByText('1 crates')).toBeNull();
  });
});

describe('MyStatement — admin top-ups', () => {
  const WITH_TOPUP = {
    ...ROW,
    topUps: [{ amount: 50000, createdBy: 'raghav', notes: 'Opening dues' }],
  };

  it('shows top-ups in their own section, not under Payments Made', async () => {
    const panel = await renderExpanded([WITH_TOPUP]);

    const topUpHeader = panel.getByText('Old Balance Added');
    const paymentsHeader = panel.getByText('Payments Made');
    expect(topUpHeader).toBeInTheDocument();
    // The ₹50,000 must sit under the top-up header, not the payments one.
    expect(within(topUpHeader.closest('div').parentElement).getByText('₹50,000.00')).toBeInTheDocument();
    expect(within(paymentsHeader.closest('div').parentElement).queryByText('₹50,000.00')).toBeNull();
  });

  it('names the admin who added the old balance', async () => {
    const panel = await renderExpanded([WITH_TOPUP]);

    expect(panel.getByText(/Added by raghav/i)).toBeInTheDocument();
    expect(panel.getByText('Opening dues')).toBeInTheDocument();
  });

  it('omits the section when there are no top-ups', async () => {
    const panel = await renderExpanded();

    expect(panel.getByText('Stock Received')).toBeInTheDocument();
    expect(panel.queryByText('Old Balance Added')).toBeNull();
  });

  it('makes a day expandable when it has only a top-up and nothing else', async () => {
    const panel = await renderExpanded([{
      ...ROW,
      items: [],
      payments: [],
      topUps: [{ amount: 50000, createdBy: 'raghav', notes: null }],
    }]);

    expect(panel.getByText('Old Balance Added')).toBeInTheDocument();
  });
});

// ─── Per-product crates and litres chips ──────────────────────────────────────

describe('MyStatement — per-product crates and litres chips', () => {
  it('shows crates chip for an ml product (HTM 1000ml: 120 qty ÷ 12 per crate = 10 crates)', async () => {
    const panel = await renderExpanded();
    // Jersey brand header = 12 crates (10 + 2). Expanding Jersey reveals product
    // chips: HTM 1000ml = 10 crates. Nandini brand header also = 10 crates.
    // So '10 crates' appears twice — brand header (Nandini) + product chip (HTM).
    // Confirm the product-level chip exists by verifying at least 2 occurrences.
    fireEvent.click(panel.getByText('Jersey'));
    expect(panel.getAllByText('10 crates').length).toBeGreaterThanOrEqual(2);
  });

  it('shows litres chip for an ml product (HTM 1000ml: 120 × 1000ml ÷ 1000 = 120 L)', async () => {
    const panel = await renderExpanded();
    // Jersey brand header = 120 L; HTM 1000ml item chip = 120 L → 2 occurrences.
    fireEvent.click(panel.getByText('Jersey'));
    expect(panel.getAllByText('120 L').length).toBeGreaterThanOrEqual(2);
  });

  it('shows crates chip but no litres chip for a gram product (DTM Curd 1000g: crates > 0, litres = 0)', async () => {
    const panel = await renderExpanded();
    fireEvent.click(panel.getByText('Jersey'));

    // DTM Curd 1000g: 24 ÷ 12 = 2 crates — unique across the whole page.
    expect(panel.getByText('2 crates')).toBeInTheDocument();
    // litres = 0 for gram products — '0 L' chip must never appear.
    expect(panel.queryByText('0 L')).not.toBeInTheDocument();
  });

  it('crates chip is absent when unitsPerContainer is 0 (guard against division by zero)', async () => {
    const rowWithZeroCrates = {
      ...ROW,
      items: [{
        brandName: 'Jersey', productName: 'Loose Milk',
        quantity: 10, unitPrice: 30, totalAmount: 300,
        unitType: 'ml', unitSize: 1000, unitsPerContainer: 0,
      }],
      payments: [],
      topUps: [],
    };
    const panel = await renderExpanded([rowWithZeroCrates]);
    fireEvent.click(panel.getByText('Jersey'));

    // crates = 0 when unitsPerContainer is 0 — chip must not render.
    expect(panel.queryByText(/0 crates/i)).not.toBeInTheDocument();
    // litres chip: 10 × 1000ml ÷ 1000 = 10 L. Appears in both brand header
    // and product chip, so use getAllByText.
    expect(panel.getAllByText('10 L').length).toBeGreaterThanOrEqual(1);
  });
});

describe('MyStatement — Products Purchased view', () => {
  it('stays on the Account Statement view by default', async () => {
    mockStatement([ROW]);
    render(<MyStatement />);
    await screen.findByText('Opening');
    expect(screen.queryByText('Products Purchased')).toBeInTheDocument(); // the tab button itself
    expect(screen.queryByText('Total Quantity')).not.toBeInTheDocument(); // products summary card, not shown yet
  });

  it('switches to a flat per-date, per-brand table with summed quantity and amount', async () => {
    // Page renders both a mobile card list and a desktop table for the same
    // data (jsdom applies no media queries), so scope to the desktop table —
    // same reasoning as the "row order" test below.
    mockStatement([ROW]);
    const { container } = render(<MyStatement />);
    await screen.findByText('Opening');

    fireEvent.click(screen.getByRole('button', { name: /Products Purchased/i }));

    const desktopTable = within(container.querySelector('.hidden.md\\:block'));
    // Jersey: 120 + 24 = 144 qty, ₹5,340 + ₹1,152 = ₹6,492
    const jerseyRow = desktopTable.getByText('Jersey').closest('tr');
    expect(jerseyRow.textContent).toContain('144');
    expect(jerseyRow.textContent).toContain('₹6,492.00');

    // Nandini: single product, 240 qty, ₹2,976
    const nandiniRow = desktopTable.getByText('Nandini').closest('tr');
    expect(nandiniRow.textContent).toContain('240');
    expect(nandiniRow.textContent).toContain('₹2,976.00');

    // Balance-view-only content is gone
    expect(screen.queryByText('Opening')).not.toBeInTheDocument();
  });

  it('shows the period totals in the summary cards', async () => {
    mockStatement([ROW]);
    render(<MyStatement />);
    await screen.findByText('Opening');
    fireEvent.click(screen.getByRole('button', { name: /Products Purchased/i }));

    // Total qty: 120 + 24 + 240 = 384. Total amount: 5340 + 1152 + 2976 = 9468.
    // "Total Quantity"/"Total Amount" also label the desktop table's tfoot
    // and the mobile footer, so scope to the summary-card grid specifically.
    const summaryCards = screen.getByText('Total Quantity').closest('.grid');
    expect(within(summaryCards).getByText('384')).toBeInTheDocument();
    expect(within(summaryCards).getByText('₹9,468.00')).toBeInTheDocument();
  });

  it('shows an empty-state message when nothing was purchased in the period', async () => {
    mockStatement([{ ...ROW, items: [] }]);
    render(<MyStatement />);
    await screen.findByText(/tap a row to expand/i);
    fireEvent.click(screen.getByRole('button', { name: /Products Purchased/i }));

    expect(await screen.findByText('No products purchased in this period')).toBeInTheDocument();
  });

  it("includes the current view in the print link", async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    mockStatement([ROW]);
    render(<MyStatement />);
    await screen.findByText('Opening');

    fireEvent.click(screen.getByRole('button', { name: /Products Purchased/i }));
    fireEvent.click(screen.getByRole('button', { name: /Print/i }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('type=products'),
      '_blank'
    );
    openSpy.mockRestore();
  });
});

describe('MyStatement — row order', () => {
  it('renders rows in ascending date order, exactly as the API returns them', async () => {
    // /salesperson-statement/me is ordered balanceDate asc server-side; this
    // pins that the page renders that order as-is rather than reversing it —
    // the same requirement My Balance's history table now also follows.
    mockStatement([
      { ...ROW, date: '2026-08-05', items: [], payments: [], topUps: [] },
      { ...ROW, date: '2026-08-06', items: [], payments: [], topUps: [] },
      { ...ROW, date: '2026-08-07', items: [], payments: [], topUps: [] },
    ]);
    const { container } = render(<MyStatement />);
    await screen.findByText('Account Statement');

    const desktopTable = container.querySelector('.hidden.md\\:block');
    const dateCells = within(desktopTable).getAllByText(/^\d{2} Aug$/);
    expect(dateCells.map(c => c.textContent)).toEqual(['05 Aug', '06 Aug', '07 Aug']);
  });
});
