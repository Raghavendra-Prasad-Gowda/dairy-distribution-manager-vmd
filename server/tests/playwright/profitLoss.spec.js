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

const SALESPEOPLE = [
  { id: 1, name: 'K Pandu', route: 'Route 1', displayOrder: 0 },
  { id: 2, name: 'Mahesh',  route: 'Route 2', displayOrder: 1 },
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

/** Wires the four queries profitLoss makes. */
function mockDeps({ dispatches = [], costRows = [], salespeople = SALESPEOPLE, categories = [] } = {}) {
  ctx.mockPrisma.salesperson.findMany.mockResolvedValue(salespeople);
  ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue(dispatches);
  ctx.mockPrisma.productCostPrice.findMany.mockResolvedValue(costRows);
  ctx.mockPrisma.category.findMany.mockResolvedValue(categories);
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
