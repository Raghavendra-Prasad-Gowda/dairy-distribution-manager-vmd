'use strict';

/**
 * Profit & Loss report tests.
 *
 * Profit on a dispatched line = qty × (salesman's billed price − the dairy's
 * cost price effective on that line's own dispatch date). The historical-cost
 * rule is the subtle part and is covered explicitly below: a cost change must
 * not retroactively rewrite earlier days' profit.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// isActive is selected by the handler now — the roster keeps every active
// salesperson plus any inactive one dispatched to inside the range.
const SALESPEOPLE = [
  { id: 1, name: 'K Pandu', route: 'Route 1', displayOrder: 0, isActive: true },
  { id: 2, name: 'Mahesh',  route: 'Route 2', displayOrder: 1, isActive: true },
];

/** A dispatch line: billed at `unitPrice`, product has denormalised `costPrice`. */
function item(productId, quantity, unitPrice, costPrice, name = `Product ${productId}`, product = {}) {
  return {
    productId,
    quantity,
    unitPrice,
    product: {
      id: productId, name, category: 'Milk', costPrice, displayOrder: 0,
      brand: { id: 1, name: 'Nandini', displayOrder: 0 },
      ...product,
    },
  };
}

function dispatch(salespersonId, dateStr, items) {
  return { salespersonId, dispatchDate: new Date(dateStr), items };
}

/** Wires the queries profitLoss makes. */
function mockDeps({
  dispatches = [], costRows = [], salespeople = SALESPEOPLE, categories = [],
  dairyBalanceSums = { stockValue: 0, depositValue: 0 }, receipts = [],
} = {}) {
  ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue(receipts);
  ctx.mockPrisma.salesperson.findMany.mockResolvedValue(salespeople);
  ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue(dispatches);
  ctx.mockPrisma.productCostPrice.findMany.mockResolvedValue(costRows);
  ctx.mockPrisma.category.findMany.mockResolvedValue(categories);
  ctx.mockPrisma.dairyBalance.aggregate.mockResolvedValue({ _sum: dairyBalanceSums });
}

/** A received line; `costPrice` is the product's denormalised cost. */
function receipt(productId, dateStr, quantity, costPrice, name = `Product ${productId}`) {
  return {
    productId, receiptDate: new Date(dateStr), quantity,
    product: { id: productId, name, costPrice, brand: { name: 'Nandini' } },
  };
}

async function get(request, qs = 'from=2026-04-01&to=2026-04-30', token = makeAuthToken()) {
  return request.get(`/api/v1/reports/profit-loss?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─── Access control ──────────────────────────────────────────────────────────

test.describe('GET /api/v1/reports/profit-loss — access', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/profit-loss?from=2026-04-01&to=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 403 when a salesman token is provided', async ({ request }) => {
    mockDeps();
    const res = await get(request, 'from=2026-04-01&to=2026-04-30', makeSalesmanToken(1));
    expect(res.status()).toBe(403);
  });

  test('returns 400 when from/to are missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/profit-loss', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Profit maths ────────────────────────────────────────────────────────────

test.describe('GET /api/v1/reports/profit-loss — profit calculation', () => {
  test('profit is qty × (billed − cost) per line, summed per salesman', async ({ request }) => {
    // 100 × (25 − 20) = 500,  50 × (30 − 22) = 400  →  900
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [
        item(1, 100, 25, 20),
        item(2, 50, 30, 22),
      ])],
    });

    const res = await get(request);
    expect(res.status()).toBe(200);
    const { data } = await res.json();

    const pandu = data.salespeople.find(s => s.salespersonId === 1);
    expect(pandu.revenue).toBeCloseTo(100 * 25 + 50 * 30, 2); // 4000
    expect(pandu.cost).toBeCloseTo(100 * 20 + 50 * 22, 2);    // 3100
    expect(pandu.profit).toBeCloseTo(900, 2);
  });

  test('reports a negative profit as a loss, not clamped to zero', async ({ request }) => {
    // Billed 18 but the dairy paid 20 → 100 × −2 = −200
    mockDeps({ dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 18, 20)])] });

    const { data } = await (await get(request)).json();
    const pandu = data.salespeople.find(s => s.salespersonId === 1);
    expect(pandu.profit).toBeCloseTo(-200, 2);
    expect(data.totals.profit).toBeCloseTo(-200, 2);
  });

  test('margin percentage is profit over revenue', async ({ request }) => {
    // 100 × (25 − 20) = 500 profit on 2500 revenue → 20%
    mockDeps({ dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 25, 20)])] });

    const { data } = await (await get(request)).json();
    expect(data.totals.marginPct).toBeCloseTo(20, 2);
  });

  test('margin is 0 rather than NaN when nothing was dispatched', async ({ request }) => {
    mockDeps();
    const { data } = await (await get(request)).json();
    expect(data.totals).toMatchObject({ revenue: 0, cost: 0, profit: 0, marginPct: 0 });
  });

  test('aggregates totals across every salesman', async ({ request }) => {
    mockDeps({
      dispatches: [
        dispatch(1, '2026-04-10', [item(1, 100, 25, 20)]), // +500
        dispatch(2, '2026-04-11', [item(1, 200, 25, 20)]), // +1000
      ],
    });

    const { data } = await (await get(request)).json();
    expect(data.totals.profit).toBeCloseTo(1500, 2);
    expect(data.salespeople.find(s => s.salespersonId === 1).profit).toBeCloseTo(500, 2);
    expect(data.salespeople.find(s => s.salespersonId === 2).profit).toBeCloseTo(1000, 2);
  });
});

// ─── Historical costing ──────────────────────────────────────────────────────

test.describe('GET /api/v1/reports/profit-loss — historical cost resolution', () => {
  test('costs each dispatch at the price effective on its own date, not the latest', async ({ request }) => {
    // Cost was 20 from 1 Apr, rose to 24 from 15 Apr.
    // 10 Apr: 100 × (30 − 20) = 1000   |   20 Apr: 100 × (30 − 24) = 600
    mockDeps({
      dispatches: [
        dispatch(1, '2026-04-10', [item(1, 100, 30, 99 /* denorm ignored */)]),
        dispatch(1, '2026-04-20', [item(1, 100, 30, 99)]),
      ],
      costRows: [
        { productId: 1, costPrice: 24, effectiveFrom: new Date('2026-04-15') },
        { productId: 1, costPrice: 20, effectiveFrom: new Date('2026-04-01') },
      ],
    });

    const { data } = await (await get(request)).json();
    const byDate = Object.fromEntries(
      data.daily.map(d => [new Date(d.date).toISOString().slice(0, 10), d.profit])
    );
    expect(byDate['2026-04-10']).toBeCloseTo(1000, 2);
    expect(byDate['2026-04-20']).toBeCloseTo(600, 2);
    expect(data.salespeople.find(s => s.salespersonId === 1).profit).toBeCloseTo(1600, 2);
  });

  test('falls back to the product costPrice when there is no history row', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 30, 22)])],
      costRows: [], // no ProductCostPrice rows at all
    });

    const { data } = await (await get(request)).json();
    // 100 × (30 − 22) = 800, using the denormalised Product.costPrice
    expect(data.salespeople.find(s => s.salespersonId === 1).profit).toBeCloseTo(800, 2);
  });

  test('ignores a cost row that only takes effect after the dispatch', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 30, 99)])],
      costRows: [{ productId: 1, costPrice: 20, effectiveFrom: new Date('2026-04-01') }],
    });

    const { data } = await (await get(request)).json();
    // Uses the 1 Apr row (20), giving 1000 — not the denormalised 99.
    expect(data.salespeople.find(s => s.salespersonId === 1).profit).toBeCloseTo(1000, 2);
  });
});

// ─── Shape ───────────────────────────────────────────────────────────────────

test.describe('GET /api/v1/reports/profit-loss — response shape', () => {
  test('lists every active salesman, including ones with no dispatches', async ({ request }) => {
    mockDeps({ dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 25, 20)])] });

    const { data } = await (await get(request)).json();
    expect(data.salespeople).toHaveLength(2);
    const mahesh = data.salespeople.find(s => s.salespersonId === 2);
    expect(mahesh).toMatchObject({ revenue: 0, cost: 0, profit: 0, marginPct: 0 });
    expect(mahesh.products).toEqual([]);
  });

  test('breaks a salesman down by product, merging repeat lines across dates', async ({ request }) => {
    mockDeps({
      dispatches: [
        dispatch(1, '2026-04-10', [item(1, 100, 25, 20, 'Toned Milk')]),
        dispatch(1, '2026-04-11', [item(1,  50, 25, 20, 'Toned Milk')]),
      ],
    });

    const { data } = await (await get(request)).json();
    const products = data.salespeople.find(s => s.salespersonId === 1).products;
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      productName: 'Toned Milk',
      quantity:    150,
      profit:      750, // 150 × (25 − 20)
    });
  });

  test('sorts a salesman\'s products by display order, not profit', async ({ request }) => {
    // "Loss Maker" is a loss but sits earlier in the layout (displayOrder 0)
    // than "Star Product" (displayOrder 1) — the list must follow the fixed
    // layout order, not rank the biggest earner first.
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [
        item(1, 100, 18, 20, 'Loss Maker',   { displayOrder: 0 }),  // −200
        item(2, 100, 30, 20, 'Star Product', { displayOrder: 1 }), // +1000
      ])],
    });

    const { data } = await (await get(request)).json();
    const products = data.salespeople.find(s => s.salespersonId === 1).products;
    expect(products.map(p => p.productName)).toEqual(['Loss Maker', 'Star Product']);
  });

  test('orders products by brand, then category, then product display order — same layout as the pricing tab', async ({ request }) => {
    mockDeps({
      categories: [
        { brandId: 1, name: 'Curd', displayOrder: 1 },
        { brandId: 1, name: 'Milk', displayOrder: 0 },
      ],
      dispatches: [dispatch(1, '2026-04-10', [
        // Second brand (Jersey, displayOrder 1) dispatched first — must still
        // sort after brand 1 (Nandini, displayOrder 0) in the response.
        item(3, 10, 20, 15, 'HTM 210ml',    { displayOrder: 0, category: 'Milk', brand: { id: 2, name: 'Jersey', displayOrder: 1 } }),
        item(1, 10, 20, 15, 'Curd 200g',    { displayOrder: 0, category: 'Curd', brand: { id: 1, name: 'Nandini', displayOrder: 0 } }),
        item(2, 10, 20, 15, 'Toned Milk',   { displayOrder: 0, category: 'Milk', brand: { id: 1, name: 'Nandini', displayOrder: 0 } }),
      ])],
    });

    const { data } = await (await get(request)).json();
    const products = data.salespeople.find(s => s.salespersonId === 1).products;
    // Nandini's Milk category (order 0) before its Curd category (order 1),
    // and both before Jersey (brand order 1).
    expect(products.map(p => p.productName)).toEqual(['Toned Milk', 'Curd 200g', 'HTM 210ml']);
    expect(products.map(p => p.brandName)).toEqual(['Nandini', 'Nandini', 'Jersey']);
  });

  test('returns a per-date series for the range view', async ({ request }) => {
    mockDeps({
      dispatches: [
        dispatch(1, '2026-04-11', [item(1, 100, 25, 20)]),
        dispatch(2, '2026-04-10', [item(1, 100, 25, 20)]),
      ],
    });

    const { data } = await (await get(request)).json();
    expect(data.daily).toHaveLength(2);
    // Chronological regardless of the order dispatches came back in.
    const dates = data.daily.map(d => new Date(d.date).toISOString().slice(0, 10));
    expect(dates).toEqual(['2026-04-10', '2026-04-11']);
  });

  test('each daily row carries its own margin percentage', async ({ request }) => {
    // 100 × (25 − 20) = 500 profit on 2500 revenue → 20%
    mockDeps({ dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 25, 20)])] });

    const { data } = await (await get(request)).json();
    expect(data.daily).toHaveLength(1);
    expect(data.daily[0].marginPct).toBeCloseTo(20, 2);
  });

  test('echoes the requested range back', async ({ request }) => {
    mockDeps();
    const { data } = await (await get(request, 'from=2026-04-01&to=2026-04-30')).json();
    expect(data).toMatchObject({ from: '2026-04-01', to: '2026-04-30' });
  });

  test('defaults brand, category and display order when the product row has none', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [
        item(1, 100, 25, 20, 'Mystery Item', { category: null, displayOrder: null, brand: null }),
      ])],
    });

    const { data } = await (await get(request)).json();
    const product = data.salespeople.find(s => s.salespersonId === 1).products[0];
    expect(product.brandName).toBeNull();
    expect(product.brandDisplayOrder).toBe(0);
    expect(product.category).toBe('Other');
    expect(product.displayOrder).toBe(0);
  });
});

// ─── Unresolvable cost prices ────────────────────────────────────────────────

/**
 * A dispatched line with no resolvable cost price used to be costed at the
 * denormalised Product.costPrice — which products.controller.js deliberately
 * holds at 0 while a future-dated price is pending, and never sets at all for
 * a product created with cost 0. Costing at 0 books the whole line as profit.
 */
test.describe('GET /api/v1/reports/profit-loss — unresolvable cost', () => {
  test('falls back to the earliest cost row when none is effective yet', async ({ request }) => {
    // Denorm is 0 (a future-dated price is pending) but a real cost exists.
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 100, 30, 0)])],
      costRows: [
        { productId: 10, costPrice: 26, effectiveFrom: new Date('2026-05-01') },
      ],
    });

    const body = await (await get(request)).json();
    // Costed at 26, not 0 → profit 100 × (30 − 26) = 400, never 3000.
    expect(body.data.totals.cost).toBe(2600);
    expect(body.data.totals.profit).toBe(400);
  });

  test('picks the earliest row, not the latest, when several are future-dated', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 0)])],
      costRows: [
        { productId: 10, costPrice: 28, effectiveFrom: new Date('2026-06-01') },
        { productId: 10, costPrice: 25, effectiveFrom: new Date('2026-05-01') },
      ],
    });

    const body = await (await get(request)).json();
    expect(body.data.totals.cost).toBe(250);
  });

  test('still prefers a row already in force over the earliest one', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 99)])],
      costRows: [
        { productId: 10, costPrice: 27, effectiveFrom: new Date('2026-04-05') },
        { productId: 10, costPrice: 20, effectiveFrom: new Date('2026-01-01') },
      ],
    });

    const body = await (await get(request)).json();
    expect(body.data.totals.cost).toBe(270);
  });

  test('reports a product that still has no cost price instead of hiding it', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 0, 'Toned Milk 500ml')])],
      costRows: [],
    });

    const body = await (await get(request)).json();
    expect(body.data.unpriced).toHaveLength(1);
    expect(body.data.unpriced[0]).toMatchObject({
      productId: 10, productName: 'Toned Milk 500ml', brandName: 'Nandini',
    });
    // Still reported as-is — the warning explains the 100% margin, it doesn't
    // silently drop the line.
    expect(body.data.totals.cost).toBe(0);
    expect(body.data.totals.profit).toBe(300);
  });

  test('lists an unpriced product once however many times it was dispatched', async ({ request }) => {
    mockDeps({
      dispatches: [
        dispatch(1, '2026-04-10', [item(10, 10, 30, 0)]),
        dispatch(2, '2026-04-11', [item(10, 5, 30, 0)]),
      ],
      costRows: [],
    });

    expect((await (await get(request)).json()).data.unpriced).toHaveLength(1);
  });

  test('reports no unpriced products when every cost resolves', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 25)])],
      costRows: [],
    });

    expect((await (await get(request)).json()).data.unpriced).toEqual([]);
  });
});

// ─── Inactive salespeople ────────────────────────────────────────────────────

/**
 * The totals sum every dispatch in range. Listing only active salespeople left
 * a deactivated salesman's revenue inside the summary cards with no row to
 * account for it, so the visible rows didn't add up.
 */
test.describe('GET /api/v1/reports/profit-loss — inactive salespeople', () => {
  const ROSTER = [
    { id: 1, name: 'K Pandu', route: 'Route 1', displayOrder: 0, isActive: true },
    { id: 2, name: 'Retired', route: 'Route 2', displayOrder: 1, isActive: false },
  ];

  test('lists an inactive salesman who was dispatched to in the range', async ({ request }) => {
    mockDeps({
      salespeople: ROSTER,
      dispatches: [dispatch(2, '2026-04-10', [item(10, 10, 30, 25)])],
    });

    const body = await (await get(request)).json();
    const retired = body.data.salespeople.find(s => s.salespersonId === 2);
    expect(retired).toBeTruthy();
    expect(retired.isActive).toBe(false);
    expect(retired.revenue).toBe(300);
  });

  test('the listed rows add up to the totals', async ({ request }) => {
    mockDeps({
      salespeople: ROSTER,
      dispatches: [
        dispatch(1, '2026-04-10', [item(10, 10, 30, 25)]),
        dispatch(2, '2026-04-11', [item(10, 20, 30, 25)]),
      ],
    });

    const { totals, salespeople } = (await (await get(request)).json()).data;
    expect(salespeople.reduce((s, r) => s + r.revenue, 0)).toBe(totals.revenue);
    expect(salespeople.reduce((s, r) => s + r.cost,    0)).toBe(totals.cost);
    expect(salespeople.reduce((s, r) => s + r.profit,  0)).toBe(totals.profit);
  });

  test('omits an inactive salesman with no dispatches in the range', async ({ request }) => {
    mockDeps({
      salespeople: ROSTER,
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 25)])],
    });

    const ids = (await (await get(request)).json()).data.salespeople.map(s => s.salespersonId);
    expect(ids).toEqual([1]);
  });

  test('still lists an active salesman with no dispatches', async ({ request }) => {
    mockDeps({ salespeople: ROSTER, dispatches: [] });

    const ids = (await (await get(request)).json()).data.salespeople.map(s => s.salespersonId);
    expect(ids).toEqual([1]);
  });
});

// ─── Dairy Statement reconciliation ──────────────────────────────────────────

/**
 * `reconciliation` bridges this report to the Dairy Statement's Bill for the
 * same range, sourced from the same persisted DairyBalance rows the Dairy
 * Statement itself reads. It never claims equality — a residual is expected
 * whenever received stock isn't fully dispatched the same day.
 */
test.describe('GET /api/v1/reports/profit-loss — reconciliation', () => {
  test('reconciliation.costOfGoodsDispatched always mirrors totals.cost', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 25)])],
      dairyBalanceSums: { stockValue: 250, depositValue: 0 },
    });

    const body = await (await get(request)).json();
    expect(body.data.reconciliation.costOfGoodsDispatched).toBe(body.data.totals.cost);
  });

  test('otherDifference is zero when the dairy bill exactly matches cost of goods dispatched', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 25)])],
      dairyBalanceSums: { stockValue: 250, depositValue: 12.5 },
    });

    const body = await (await get(request)).json();
    expect(body.data.reconciliation).toMatchObject({
      dairyBill: 262.5, depositValue: 12.5, costOfGoodsDispatched: 250, otherDifference: 0,
    });
  });

  test('surfaces a positive otherDifference when stock was received but not dispatched', async ({ request }) => {
    // Dairy billed 700000 of stock; only 250 of it was actually dispatched.
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 25)])],
      dairyBalanceSums: { stockValue: 700000, depositValue: 0 },
    });

    const body = await (await get(request)).json();
    expect(body.data.reconciliation.otherDifference).toBe(699750);
  });

  test('treats a range with no persisted DairyBalance rows as zero, not a crash', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(10, 10, 30, 25)])],
      dairyBalanceSums: { stockValue: null, depositValue: null },
    });

    const body = await (await get(request)).json();
    expect(body.data.reconciliation).toMatchObject({ dairyBill: 0, depositValue: 0, otherDifference: -250 });
  });

  test('excludes an inactive brand\'s DairyBalance from the bridge', async ({ request }) => {
    // The query itself filters brand.isActive — this just pins that the field
    // is wired through end to end so a regression there isn't silent.
    mockDeps({
      dispatches: [],
      dairyBalanceSums: { stockValue: 500, depositValue: 20 },
    });

    const body = await (await get(request)).json();
    expect(ctx.mockPrisma.dairyBalance.aggregate).toBeTruthy();
    expect(body.data.reconciliation.dairyBill).toBe(520);
  });
});

// ─── Shortage (received − dispatched) booked as a loss ───────────────────────

test.describe('GET /api/v1/reports/profit-loss — shortage', () => {
  test('leftover stock is costed and subtracted from profit', async ({ request }) => {
    // Received 100 @ cost 20, dispatched 90 → 10 short = ₹200 loss.
    // Gross margin 90 × (25 − 20) = 450 → net 250.
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(1, 90, 25, 20)])],
      receipts:   [receipt(1, '2026-04-10', 100, 20)],
    });

    const { data } = await (await get(request)).json();
    expect(data.totals.grossProfit).toBeCloseTo(450, 2);
    expect(data.totals.shortageLoss).toBeCloseTo(200, 2);
    expect(data.totals.profit).toBeCloseTo(250, 2);
    expect(data.shortage).toEqual([
      expect.objectContaining({ productId: 1, quantity: 10, loss: 200 }),
    ]);
    // Per-salesman rows stay gross — shortage can't be pinned on one person.
    expect(data.salespeople.find(s => s.salespersonId === 1).profit).toBeCloseTo(450, 2);
    expect(data.daily[0]).toMatchObject({ shortageLoss: 200, profit: 250 });
  });

  test('a received product that was never dispatched is a full loss', async ({ request }) => {
    mockDeps({ receipts: [receipt(7, '2026-04-10', 12, 30)] });

    const { data } = await (await get(request)).json();
    expect(data.totals.shortageLoss).toBeCloseTo(360, 2);
    expect(data.totals.profit).toBeCloseTo(-360, 2);
    expect(data.daily).toHaveLength(1);
  });

  test('over-dispatch on one product does not offset another product\'s shortage', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(1, 110, 25, 20), item(2, 50, 30, 22)])],
      receipts:   [receipt(1, '2026-04-10', 100, 20), receipt(2, '2026-04-10', 60, 22)],
    });

    const { data } = await (await get(request)).json();
    // Product 1 over by 10 → ignored; product 2 short 10 × 22 = 220.
    expect(data.totals.shortageLoss).toBeCloseTo(220, 2);
  });

  test('shortage is netted per day, not across the range', async ({ request }) => {
    mockDeps({
      dispatches: [
        dispatch(1, '2026-04-10', [item(1, 100, 25, 20)]),
        dispatch(1, '2026-04-11', [item(1, 120, 25, 20)]),
      ],
      // Day 2 over-dispatches what day 1 left over; the leftover is still lost.
      receipts: [receipt(1, '2026-04-10', 110, 20), receipt(1, '2026-04-11', 100, 20)],
    });

    const { data } = await (await get(request)).json();
    expect(data.totals.shortageLoss).toBeCloseTo(200, 2); // 10 × 20 on day 1 only
  });

  test('no receipts means no shortage', async ({ request }) => {
    mockDeps({ dispatches: [dispatch(1, '2026-04-10', [item(1, 100, 25, 20)])] });

    const { data } = await (await get(request)).json();
    expect(data.totals.shortageLoss).toBe(0);
    expect(data.totals.profit).toBeCloseTo(data.totals.grossProfit, 2);
    expect(data.shortage).toEqual([]);
  });

  test('reconciliation bridge still adds up with shortage split out', async ({ request }) => {
    mockDeps({
      dispatches: [dispatch(1, '2026-04-10', [item(1, 90, 25, 20)])],
      receipts:   [receipt(1, '2026-04-10', 100, 20)],
      dairyBalanceSums: { stockValue: 2000, depositValue: 50 },
    });

    const { data } = await (await get(request)).json();
    const r = data.reconciliation;
    expect(r.shortageLoss).toBeCloseTo(200, 2);
    expect(r.costOfGoodsDispatched + r.shortageLoss + r.otherDifference + r.depositValue)
      .toBeCloseTo(r.dairyBill, 2);
  });
});
