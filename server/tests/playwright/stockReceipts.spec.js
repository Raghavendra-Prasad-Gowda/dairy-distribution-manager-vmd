'use strict';

/**
 * Stock Receipts API Tests
 * Covers: GET, GET /availability, POST /bulk /api/v1/stock-receipts
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const RECEIPT = {
  id: 1, brandId: 1, productId: 1, routeId: 0,
  receiptDate: new Date('2026-04-30'),
  quantity: 100, unitPrice: 22,
  product: { id: 1, name: 'Milk 500ml', costPrice: 22 },
  brand: { id: 1, name: 'Nandini' },
};

// ─── GET /api/v1/stock-receipts ───────────────────────────────────────────────

test.describe('GET /api/v1/stock-receipts', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/stock-receipts?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/stock-receipts', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with receipts for a given date', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([RECEIPT]);

    const res = await request.get('/api/v1/stock-receipts?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 filtered by brandId', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([RECEIPT]);

    const res = await request.get('/api/v1/stock-receipts?date=2026-04-30&brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 with empty list when no receipts for that date', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/stock-receipts?date=2026-01-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── GET /api/v1/stock-receipts/availability ──────────────────────────────────

test.describe('GET /api/v1/stock-receipts/availability', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/stock-receipts/availability?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/stock-receipts/availability', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with availability data', async ({ request }) => {
    const product = { id: 1, name: 'Milk 500ml', brandId: 1, costPrice: 22, brand: { id: 1, name: 'Nandini' } };
    ctx.mockPrisma.product.findMany.mockResolvedValue([product]);
    ctx.mockPrisma.stockReceipt.groupBy.mockResolvedValue([
      { productId: 1, _sum: { quantity: 100 } },
    ]);
    ctx.mockPrisma.stockDispatchItem.groupBy.mockResolvedValue([
      { productId: 1, _sum: { quantity: 30 } },
    ]);

    const res = await request.get('/api/v1/stock-receipts/availability?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0]).toHaveProperty('received', 100);
    expect(body.data[0]).toHaveProperty('dispatched', 30);
    expect(body.data[0]).toHaveProperty('available', 70);
  });

  test('returns 200 with zero availability when no receipts', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockReceipt.groupBy.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatchItem.groupBy.mockResolvedValue([]);

    const res = await request.get('/api/v1/stock-receipts/availability?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── POST /api/v1/stock-receipts/bulk ────────────────────────────────────────

test.describe('POST /api/v1/stock-receipts/bulk', () => {
  const validPayload = {
    brandId: 1,
    date: '2026-04-30',
    items: [{ productId: 1, quantity: 100, unitPrice: 22 }],
  };

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/stock-receipts/bulk', { data: validPayload });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when receipts are saved', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([RECEIPT]); // upserts
    ctx.mockPrisma.product.findMany.mockResolvedValue([{ id: 1, unitsPerContainer: 24 }]);
    // balance recalc uses another $transaction call

    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { date: '2026-04-30', items: [{ productId: 1, quantity: 100, unitPrice: 22 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when date is missing', async ({ request }) => {
    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, items: [{ productId: 1, quantity: 100, unitPrice: 22 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when date format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '30-04-2026', items: [{ productId: 1, quantity: 100, unitPrice: 22 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 when items is omitted — defaults to empty array (clears route)', async ({ request }) => {
    // items has .default([]) — omitting it is valid and means "clear this route"
    ctx.mockPrisma.$transaction.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '2026-04-30', routeId: 1 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 when items is an empty array (clears existing receipts for the route)', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '2026-04-30', routeId: 1, items: [] },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when an item has a negative quantity', async ({ request }) => {
    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '2026-04-30', items: [{ productId: 1, quantity: -5, unitPrice: 22 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when unitPrice is negative', async ({ request }) => {
    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '2026-04-30', items: [{ productId: 1, quantity: 100, unitPrice: -5 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('triggers retroactive balance cascade for subsequent dates after bulk create', async ({ request }) => {
    // Posting a receipt retroactively (2026-04-28) when balances for later dates already exist
    // Expected: balanceService recalculates 2026-04-28 then cascades to 2026-04-29 and 2026-04-30
    const recalcDates = [];

    // The $transaction for deleteMany+create returns []
    ctx.mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') return arg(ctx.mockPrisma);
      return [];
    });

    // Cascade: two subsequent balance records exist
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([
      { balanceDate: new Date('2026-04-29') },
      { balanceDate: new Date('2026-04-30') },
    ]);
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ depositEnabled: false, depositPerLitre: 0 });
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      { quantity: 100, unitPrice: 22, product: { unitType: 'ml', unitSize: 500, containerType: 'box', category: 'Milk', depositEnabled: false } },
    ]);
    ctx.mockPrisma.dairyPayment.aggregate.mockImplementation(async ({ where }) => {
      recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
      return { _sum: { amount: null } };
    });
    ctx.mockPrisma.dairyBalance.upsert.mockResolvedValue({});
    ctx.mockPrisma.stockReceipt.deleteMany.mockResolvedValue({ count: 0 });
    ctx.mockPrisma.stockReceipt.create.mockResolvedValue(RECEIPT);
    ctx.mockPrisma.product.findMany.mockResolvedValue([{ id: 1, unitsPerContainer: 24 }]);

    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, date: '2026-04-28', items: [{ productId: 1, quantity: 100, unitPrice: 22 }] },
    });

    expect(res.status()).toBe(200);
    // The retroactive date AND both subsequent dates should all be recalculated
    expect(recalcDates).toContain('2026-04-28');
    expect(recalcDates).toContain('2026-04-29');
    expect(recalcDates).toContain('2026-04-30');
  });

  test('items with zero quantity are filtered out and not inserted', async ({ request }) => {
    // Mixed: qty=0 (should be deleted/ignored) and qty>0 (should be inserted)
    let createCount = 0;
    ctx.mockPrisma.stockReceipt.deleteMany.mockResolvedValue({ count: 1 });
    ctx.mockPrisma.stockReceipt.create.mockImplementation(async () => {
      createCount++;
      return RECEIPT;
    });
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ depositEnabled: false, depositPerLitre: 0 });
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    ctx.mockPrisma.dairyBalance.upsert.mockResolvedValue({});
    ctx.mockPrisma.product.findMany.mockResolvedValue([{ id: 2, unitsPerContainer: 24 }]);

    const res = await request.post('/api/v1/stock-receipts/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        brandId: 1, date: '2026-04-30',
        items: [
          { productId: 1, quantity: 0, unitPrice: 22 },  // should be excluded
          { productId: 2, quantity: 50, unitPrice: 25 },  // should be inserted
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Only 1 non-zero item saved
    expect(body.data.saved).toBe(1);
  });
});
