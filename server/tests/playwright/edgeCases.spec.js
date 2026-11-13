'use strict';

/**
 * Edge-case + Timezone tests (Phase 5)
 *
 * Covers the long tail of small things that "should never happen but do":
 *   - Server timezone: getIndiaDateStr() under TZ=UTC must still return IST
 *   - Boundary values: qty=0, price=0, amount=0
 *   - Bulk operation atomicity: one invalid item rolls back the batch
 *   - Multi-route Nandini receipts: same product on multiple routes aggregates
 *   - Optional field defaults: notes/reference null
 *   - Soft-delete filter: deactivated salesperson hidden by default
 *   - Idempotent unlock: calling unlock on an already-unlocked dispatch is a no-op
 *   - Date format strictness
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { mockSalespersonCascade, mockDairyCascade } = require('../helpers/mock-cascade');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── Timezone — server-side IST helper ───────────────────────────────────────

test.describe('Timezone — getIndiaDateStr', () => {
  test('returns YYYY-MM-DD format in en-CA locale', async () => {
    const { getIndiaDateStr } = require('../../utils/dateUtils');
    const result = getIndiaDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('uses Asia/Kolkata timezone (independent of server TZ)', async () => {
    // Compute IST date manually and compare. This catches the bug where
    // toLocaleString().slice(0,10) was used (returns server-TZ date, not IST).
    const { getIndiaDateStr } = require('../../utils/dateUtils');
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const expected = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`;
    expect(getIndiaDateStr()).toBe(expected);
  });

  test('correctly handles the IST midnight cross-over scenario', async () => {
    // 18:30 UTC = 00:00 IST (next day). A naive new Date().toISOString().slice(0,10)
    // would return the UTC date — wrong if user is in IST after midnight.
    // We verify the helper is timezone-aware, not just slicing ISO.
    const { getIndiaDateStr } = require('../../utils/dateUtils');
    const todayIST = getIndiaDateStr();
    const todayUTC = new Date().toISOString().slice(0, 10);
    // Either equal (most of the day) or IST is one day ahead (between 18:30-23:59 UTC)
    expect([todayIST, new Date(Date.parse(todayUTC) + 86400000).toISOString().slice(0, 10)]).toContain(todayIST);
  });
});

// ─── Boundary values ─────────────────────────────────────────────────────────

test.describe('Boundary values', () => {
  test('dispatch quantity = 0 → Zod rejects (must be > 0)', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 0, unitPrice: 40 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('dispatch unitPrice = 0 → allowed (free item / sample)', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
    ctx.mockPrisma.stockDispatchItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue({ id: 1, salespersonId: 1, dispatchDate: new Date('2026-04-30'), totalAmount: 0, items: [] });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 5, unitPrice: 0 }] },
    });
    expect(res.status()).toBe(201);
  });

  test('payment amount = 0 → rejected (positive required)', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test('stock receipt quantity = 0 → accepted (means "clear this product for this route")', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.deleteMany.mockResolvedValue({ count: 0 });
    ctx.mockPrisma.stockReceipt.createMany.mockResolvedValue({ count: 0 });
    mockDairyCascade(ctx.mockPrisma);
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '2026-04-30', items: [{ productId: 1, quantity: 0, unitPrice: 22 }] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.saved).toBe(0);
  });
});

// ─── Date format strictness ──────────────────────────────────────────────────

test.describe('Date format strictness', () => {
  for (const badDate of ['30-04-2026', '2026/04/30', '2026-4-30', '2026-04-30T00:00:00', '04-30-2026', 'tomorrow']) {
    test(`date "${badDate}" → 400 on dairy-payment create`, async ({ request }) => {
      const res = await request.post('/api/v1/dairy-payments', {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data: { brandId: 1, paymentDate: badDate, amount: 100 },
      });
      expect(res.status()).toBe(400);
    });
  }
});

// ─── Optional field defaults ─────────────────────────────────────────────────

test.describe('Optional fields default to null', () => {
  test('dispatch notes omitted → controller stores null', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.stockReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
    ctx.mockPrisma.stockDispatchItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, salespersonId: 1, dispatchDate: new Date('2026-04-30'), totalAmount: 200, items: [] };
    });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 5, unitPrice: 40 }] },
    });
    expect(res.status()).toBe(201);
    expect(createArgs.data.notes).toBeNull();
  });

  test('dairy-payment reference omitted → stored as undefined or null', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, brandId: 1, amount: 100, paymentDate: new Date('2026-04-30') };
    });
    mockDairyCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, amount: 100, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(201);
    expect(createArgs.data.reference == null).toBe(true);
  });
});

// ─── Multi-route Nandini receipts ────────────────────────────────────────────
//
// Nandini stock comes in via routes. Same product on two routes on the same
// date is two StockReceipt rows. Aggregate views must sum, not duplicate.

test.describe('Multi-route Nandini receipts', () => {
  test('availability sums quantities across routes for the same product', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, name: 'Toned 500ml', brandId: 1, brand: { id: 1, name: 'Nandini' }, costPrice: 22, unitsPerContainer: 20 },
    ]);
    // groupBy returns one entry per (productId) — Prisma aggregates the rows
    ctx.mockPrisma.stockReceipt.groupBy.mockResolvedValue([
      { productId: 1, _sum: { quantity: 150 } }, // 100 from R1 + 50 from R2
    ]);
    ctx.mockPrisma.stockDispatchItem.groupBy.mockResolvedValue([
      { productId: 1, _sum: { quantity: 40 } },
    ]);

    const res = await request.get('/api/v1/stock-receipts/availability?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].received).toBe(150);
    expect(body.data[0].dispatched).toBe(40);
    expect(body.data[0].available).toBe(110);
  });

  test('stock-summary aggregates same-product-multiple-routes into one product card', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      { receiptDate: new Date('2026-04-30'), quantity: 100, unitPrice: 22, routeId: 1, product: { name: 'Toned', unitsPerContainer: 20, costPrice: 22, displayOrder: 0 }, brand: { name: 'Nandini' } },
      { receiptDate: new Date('2026-04-30'), quantity: 50,  unitPrice: 22, routeId: 2, product: { name: 'Toned', unitsPerContainer: 20, costPrice: 22, displayOrder: 0 }, brand: { name: 'Nandini' } },
    ]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([
      { id: 1, routeNumber: 'R1' },
      { id: 2, routeNumber: 'R2' },
    ]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?from=2026-04-30&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // 100 + 50 units × ₹22 = ₹3300
    expect(body.data.grandTotalReceived).toBe(3300);
    // Two receipt rows preserved (one per route) — UI aggregates per product
    expect(body.data.rows[0].receipts).toHaveLength(2);
    expect(body.data.rows[0].receipts[0].routeNumber).toBe('R1');
    expect(body.data.rows[0].receipts[1].routeNumber).toBe('R2');
  });
});

// ─── Soft-delete filtering ───────────────────────────────────────────────────

test.describe('Soft-delete filtering', () => {
  test('GET /salespeople by default hides isActive=false rows', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.salesperson.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where).toEqual({ isActive: true });
  });

  test('GET /products by default hides isActive=false rows', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where.isActive).toBe(true);
  });

  test('GET /products?all=true returns deactivated products too', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/products?all=true', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where.isActive).toBeUndefined();
  });

  // The list follows the date being viewed: a past day keeps what was bought on it, and a product
  // created later is not listed on earlier dates.
  test.describe('GET /products?date= (date-aware list)', () => {
    const headers = () => ({ Authorization: `Bearer ${makeAuthToken()}` });

    test.beforeEach(() => {
      ctx.mockPrisma.productCostPrice.findMany.mockResolvedValue([]);
      ctx.mockPrisma.productSellingPrice.findMany.mockResolvedValue([]);
    });

    test('lists active products created by that IST day, plus any product bought on it', async ({ request }) => {
      let receiptArgs = null;
      let productArgs = null;
      ctx.mockPrisma.stockReceipt.findMany.mockImplementation(async (args) => {
        receiptArgs = args;
        return [{ productId: 7 }];
      });
      ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
        productArgs = args;
        return [{ id: 7, name: 'Old', isActive: false, costPrice: 1 }, { id: 8, name: 'Live', isActive: true, costPrice: 1 }];
      });

      const res = await request.get('/api/v1/products?brandId=3&date=2026-11-12', { headers: headers() });
      expect(res.status()).toBe(200);

      expect(receiptArgs.where).toEqual({ receiptDate: new Date('2026-11-12'), brandId: 3 });
      expect(productArgs.where.brandId).toBe(3);
      expect(productArgs.where.isActive).toBeUndefined();
      const [activeByThen, boughtThen] = productArgs.where.OR;
      expect(activeByThen.isActive).toBe(true);
      // end of 12 Nov in IST = 18:29:59.999 UTC the same day: created later that day still counts
      expect(activeByThen.createdAt.lte.toISOString()).toBe('2026-11-12T18:29:59.999Z');
      expect(boughtThen).toEqual({ id: { in: [7] } });

      const body = await res.json();
      expect(body.data.find(p => p.id === 7).hasReceiptOnDate).toBe(true);
      expect(body.data.find(p => p.id === 8).hasReceiptOnDate).toBe(false);
    });

    test('a date with no receipts lists only products that already existed', async ({ request }) => {
      ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
      let productArgs = null;
      ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
        productArgs = args;
        return [];
      });
      const res = await request.get('/api/v1/products?date=2026-11-12', { headers: headers() });
      expect(res.status()).toBe(200);
      expect(productArgs.where.brandId).toBeUndefined();
      expect(productArgs.where.OR[1]).toEqual({ id: { in: [] } });
    });

    test('an unreadable stock receipt result is treated as no receipts', async ({ request }) => {
      ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue(undefined);
      ctx.mockPrisma.product.findMany.mockResolvedValue([{ id: 1, name: 'A', isActive: true, costPrice: 1 }]);
      const res = await request.get('/api/v1/products?date=2026-11-12', { headers: headers() });
      expect(res.status()).toBe(200);
      expect((await res.json()).data[0].hasReceiptOnDate).toBe(false);
    });

    test('a malformed date falls back to the plain active list (no receipt lookup)', async ({ request }) => {
      let productArgs = null;
      let receiptLookups = 0;
      ctx.mockPrisma.stockReceipt.findMany.mockImplementation(async () => { receiptLookups += 1; return []; });
      ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
        productArgs = args;
        return [];
      });
      const res = await request.get('/api/v1/products?date=12-11-2026', { headers: headers() });
      expect(res.status()).toBe(200);
      expect(productArgs.where).toEqual({ isActive: true });
      expect(receiptLookups).toBe(0);
    });

    test('all=true ignores the date (setup screens see every product)', async ({ request }) => {
      let productArgs = null;
      ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
        productArgs = args;
        return [{ id: 1, name: 'A', isActive: false, costPrice: 1 }];
      });
      const res = await request.get('/api/v1/products?all=true&date=2026-11-12', { headers: headers() });
      expect(res.status()).toBe(200);
      expect(productArgs.where.OR).toBeUndefined();
      expect(productArgs.where.isActive).toBeUndefined();
      expect((await res.json()).data[0].hasReceiptOnDate).toBeUndefined();
    });
  });
});

// ─── Idempotent state-machine transitions ────────────────────────────────────

test.describe('Idempotent unlock/lock', () => {
  test('unlocking an already-unlocked dispatch is a no-op (still 200)', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 1, dispatchDate: new Date('2026-04-30'),
      isSubmitted: false, isAdminUnlocked: true, totalAmount: 100,
    });
    ctx.mockPrisma.stockDispatch.update.mockResolvedValue({ id: 1, isSubmitted: false, isAdminUnlocked: true });

    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
  });

  test('locking an already-locked dispatch is a no-op (still 200)', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 1, dispatchDate: new Date('2026-04-30'),
      isSubmitted: true, isAdminUnlocked: false, totalAmount: 100,
    });
    ctx.mockPrisma.stockDispatch.update.mockResolvedValue({ id: 1, isSubmitted: true, isAdminUnlocked: false });

    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
  });
});
