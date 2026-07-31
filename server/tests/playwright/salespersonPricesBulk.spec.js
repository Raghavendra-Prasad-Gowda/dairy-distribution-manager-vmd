'use strict';

/**
 * Salesperson Prices — Bulk Operations API Tests
 *
 * Covers two untested endpoints:
 *   POST /api/v1/salespeople/:id/prices/copy-from/:sourceId
 *   POST /api/v1/salespeople/bulk-update
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const PRODUCT = { id: 1, brandId: 1, isActive: true, showInStockReceipt: true };

const SOURCE_PRICE = {
  id: 10,
  salespersonId: 2,
  productId: 1,
  sellingPrice: 52,
  effectiveFrom: new Date('2026-05-01'),
};

// ─── POST /api/v1/salespeople/:id/prices/copy-from/:sourceId ─────────────────

test.describe('POST /api/v1/salespeople/:id/prices/copy-from/:sourceId', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=1'
    );
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=1',
      { headers: { Authorization: `Bearer ${makeExpiredToken()}` } }
    );
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=1',
      { headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` } }
    );
    expect(res.status()).toBe(403);
  });

  test('returns 400 for non-numeric target salesperson ID', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/abc/prices/copy-from/2?brandId=1',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric source salesperson ID', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/xyz?brandId=1',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );
    expect(res.status()).toBe(400);
  });

  test('returns 400 when source and target are the same salesperson', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/1?brandId=1',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must be different/i);
  });

  test('returns 400 for non-numeric brandId', async ({ request }) => {
    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=abc',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );
    expect(res.status()).toBe(400);
  });

  test('returns 200 when no products found for brand (nothing to copy)', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);

    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=99',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/No products/i);
  });

  test('returns 200 when source salesperson has no prices (nothing to copy)', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=1',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/No prices to copy/i);
  });

  test('returns 200 and copies prices from source to target salesperson', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([SOURCE_PRICE]);

    let upsertArgs = null;
    ctx.mockPrisma.salespersonPrice.upsert.mockImplementation(async (args) => {
      upsertArgs = args;
      return { id: 99, ...args.create };
    });

    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=1',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/1 prices copied/i);

    // Verify the upsert targets the correct salesperson
    expect(upsertArgs.create.salespersonId).toBe(1);
    expect(upsertArgs.create.productId).toBe(SOURCE_PRICE.productId);
    expect(Number(upsertArgs.create.sellingPrice)).toBe(52);
  });

  test('copies multiple price rows when source has several products', async ({ request }) => {
    const products = [{ id: 1, brandId: 1, isActive: true, showInStockReceipt: true }, { id: 2, brandId: 1, isActive: true, showInStockReceipt: true }];
    const sourcePrices = [
      { ...SOURCE_PRICE, productId: 1 },
      { ...SOURCE_PRICE, id: 11, productId: 2, sellingPrice: 60 },
    ];
    ctx.mockPrisma.product.findMany.mockResolvedValue(products);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue(sourcePrices);
    ctx.mockPrisma.salespersonPrice.upsert.mockResolvedValue({});

    const res = await request.post(
      '/api/v1/salespeople/1/prices/copy-from/2?brandId=1',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/2 prices copied/i);
  });
});

// ─── POST /api/v1/salespeople/bulk-update ────────────────────────────────────

test.describe('POST /api/v1/salespeople/bulk-update', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const validPayload = () => ({
    salespersonIds: [1, 2],
    productPrices: [{ productId: 1, sellingPrice: 55 }],
    effectiveFrom: today,
  });

  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when salespersonIds array is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { productPrices: [{ productId: 1, sellingPrice: 55 }], effectiveFrom: today },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when salespersonIds array is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [], productPrices: [{ productId: 1, sellingPrice: 55 }], effectiveFrom: today },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when productPrices array is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [1], effectiveFrom: today },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when productPrices array is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [1], productPrices: [], effectiveFrom: today },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when effectiveFrom is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [1], productPrices: [{ productId: 1, sellingPrice: 55 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when sellingPrice is negative', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1],
        productPrices: [{ productId: 1, sellingPrice: -5 }],
        effectiveFrom: today,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 and updates prices for all specified salespeople', async ({ request }) => {
    ctx.mockPrisma.salespersonPrice.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1, 2],
        productPrices: [{ productId: 1, sellingPrice: 55 }],
        effectiveFrom: today,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/2 salesmen/i);
    expect(body.data.message).toMatch(/1 products/i);
  });

  test('response message includes total record count (salesmen × products)', async ({ request }) => {
    ctx.mockPrisma.salespersonPrice.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1, 2, 3],
        productPrices: [
          { productId: 1, sellingPrice: 55 },
          { productId: 2, sellingPrice: 40 },
        ],
        effectiveFrom: today,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/6 records/i);
  });

  test('returns 200 with zero price (price set to 0 is valid)', async ({ request }) => {
    ctx.mockPrisma.salespersonPrice.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/salespeople/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1],
        productPrices: [{ productId: 1, sellingPrice: 0 }],
        effectiveFrom: today,
      },
    });

    expect(res.status()).toBe(200);
  });
});
