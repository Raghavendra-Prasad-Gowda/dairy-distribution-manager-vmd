'use strict';

/**
 * Salesperson Prices API Tests
 * Covers: GET /:id/prices, POST /:id/prices/bulk /api/v1/salespeople
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const PRODUCT = {
  id: 1, brandId: 1, name: 'Milk 500ml', isActive: true,
  brand: { id: 1, name: 'Nandini' },
};

const PRICE_ROW = {
  id: 1, salespersonId: 1, productId: 1,
  sellingPrice: 25, effectiveFrom: new Date('2026-04-01'),
};

// ─── GET /api/v1/salespeople/:id/prices ──────────────────────────────────────

test.describe('GET /api/v1/salespeople/:id/prices', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/1/prices');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with price list for a salesperson', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([PRICE_ROW]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('sellingPrice', 25);
  });

  test('returns 200 with null sellingPrice when no price set', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]); // no prices
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('sellingPrice', null);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/abc/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('filters effective_from in IST date space, not UTC instant (regression)', async ({ request }) => {
    // The bug: a price saved with effectiveFrom = today (IST) is stored as
    // today's UTC midnight. Between 00:00–05:30 IST the UTC clock is still
    // on yesterday, so a naive `lte: new Date()` filter would exclude the
    // freshly-saved price and the admin would see "no change" after saving.
    // The fix uses `lte: new Date(getIndiaDateStr())` — an IST-date upper bound.
    let findManyArgs = null;
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);

    const upperBound = findManyArgs.where.effectiveFrom.lte;
    // Upper bound must be midnight UTC of today's IST date (not "now" UTC).
    expect(upperBound).toBeInstanceOf(Date);
    expect(upperBound.getUTCHours()).toBe(0);
    expect(upperBound.getUTCMinutes()).toBe(0);
    expect(upperBound.getUTCSeconds()).toBe(0);
  });
});

// ─── POST /api/v1/salespeople/:id/prices/bulk ────────────────────────────────

test.describe('POST /api/v1/salespeople/:id/prices/bulk', () => {
  const validPayload = {
    effectiveFrom: '2026-04-01',
    prices: [{ productId: 1, sellingPrice: 25 }],
  };

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      data: validPayload,
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when prices are saved', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([PRICE_ROW]);

    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/prices saved/);
  });

  test('returns 400 when effectiveFrom is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { prices: [{ productId: 1, sellingPrice: 25 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when effectiveFrom format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { effectiveFrom: '01-04-2026', prices: [{ productId: 1, sellingPrice: 25 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when prices array is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { effectiveFrom: '2026-04-01' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/abc/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
    });
    expect(res.status()).toBe(400);
  });
});
