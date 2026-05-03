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
});
