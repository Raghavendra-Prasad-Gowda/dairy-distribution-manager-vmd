'use strict';

/**
 * Products API Tests
 * Covers: GET, POST, PATCH /reorder, PUT /:id, DELETE /:id /api/v1/products
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const PRODUCT = {
  id: 1, brandId: 1, name: 'Milk 500ml', category: 'Milk',
  unitType: 'ml', unitSize: 500, costPrice: 22, sellingPrice: 25,
  isActive: true, displayOrder: 0,
  brand: { id: 1, name: 'Nandini' },
};

// ─── GET /api/v1/products ─────────────────────────────────────────────────────

test.describe('GET /api/v1/products', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/products');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with active product list', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);

    const res = await request.get('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 including inactive products when all=true', async ({ request }) => {
    const inactive = { ...PRODUCT, id: 2, isActive: false };
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT, inactive]);

    const res = await request.get('/api/v1/products?all=true', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  test('returns 200 filtered by brandId', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);

    const res = await request.get('/api/v1/products?brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 with date-resolved costPrice when ?date= provided', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.productCostPrice.findMany.mockResolvedValue([
      { productId: 1, costPrice: 20, effectiveFrom: new Date('2026-04-01') },
    ]);

    const res = await request.get('/api/v1/products?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Number(body.data[0].costPrice)).toBe(20);
  });
});

// ─── POST /api/v1/products ────────────────────────────────────────────────────

test.describe('POST /api/v1/products', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/products', {
      data: { brandId: 1, name: 'Milk 500ml' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when product is created', async ({ request }) => {
    ctx.mockPrisma.product.create.mockResolvedValue(PRODUCT);

    const res = await request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, name: 'Milk 500ml' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('name', 'Milk 500ml');
  });

  test('returns 201 and seeds cost price history when costPrice > 0', async ({ request }) => {
    ctx.mockPrisma.product.create.mockResolvedValue(PRODUCT);
    ctx.mockPrisma.productCostPrice.create.mockResolvedValue({});

    const res = await request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, name: 'Milk 500ml', costPrice: 22 },
    });

    expect(res.status()).toBe(201);
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Milk 500ml' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when name is missing', async ({ request }) => {
    const res = await request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1 },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when unitType is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, name: 'Milk 500ml', unitType: 'pounds' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PATCH /api/v1/products/reorder ──────────────────────────────────────────

test.describe('PATCH /api/v1/products/reorder', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/products/reorder', {
      data: [{ id: 1, displayOrder: 0 }],
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when products are reordered', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([PRODUCT]);

    const res = await request.patch('/api/v1/products/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [{ id: 1, displayOrder: 0 }, { id: 2, displayOrder: 1 }],
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/reordered/);
  });

  test('returns 400 when payload is not an array', async ({ request }) => {
    const res = await request.patch('/api/v1/products/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { id: 1, displayOrder: 0 },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/products/:id ─────────────────────────────────────────────────

test.describe('PUT /api/v1/products/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/products/1', { data: { name: 'Updated' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when product is updated', async ({ request }) => {
    ctx.mockPrisma.product.update.mockResolvedValue({ ...PRODUCT, name: 'Updated' });

    const res = await request.put('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('name', 'Updated');
  });

  test('returns 200 and records cost price history when costPrice changes', async ({ request }) => {
    ctx.mockPrisma.product.update.mockResolvedValue({ ...PRODUCT, costPrice: 20 });
    ctx.mockPrisma.productCostPrice.upsert.mockResolvedValue({});
    ctx.mockPrisma.productCostPrice.findFirst.mockResolvedValue({ costPrice: 20 });

    // Effective date must be today or later (past dates rejected by validation)
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const res = await request.put('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { costPrice: 20, effectiveFrom: todayIST },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when product does not exist', async ({ request }) => {
    const notFound = Object.assign(new Error('Not found'), { code: 'P2025' });
    ctx.mockPrisma.product.update.mockRejectedValue(notFound);

    const res = await request.put('/api/v1/products/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric product ID', async ({ request }) => {
    const res = await request.put('/api/v1/products/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when name is empty string', async ({ request }) => {
    const res = await request.put('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── DELETE /api/v1/products/:id (soft delete) ───────────────────────────────

test.describe('DELETE /api/v1/products/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/products/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when product is deactivated', async ({ request }) => {
    ctx.mockPrisma.product.update.mockResolvedValue({ ...PRODUCT, isActive: false });

    const res = await request.delete('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe('Product deactivated');
  });

  test('returns 404 when product does not exist', async ({ request }) => {
    const notFound = Object.assign(new Error('Not found'), { code: 'P2025' });
    ctx.mockPrisma.product.update.mockRejectedValue(notFound);

    const res = await request.delete('/api/v1/products/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric product ID', async ({ request }) => {
    const res = await request.delete('/api/v1/products/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Future-scheduled prices ─────────────────────────────────────────────────

test.describe('Future-scheduled prices', () => {
  const todayStr  = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const futureStr = (days = 30) => {
    const d = new Date(todayStr());
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA');
  };

  test('POST rejects past effectiveFrom (today-or-later validation)', async ({ request }) => {
    const res = await request.post('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, name: 'X', costPrice: 10, effectiveFrom: '2020-01-01' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT rejects past effectiveFrom', async ({ request }) => {
    const res = await request.put('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { costPrice: 20, effectiveFrom: '2020-01-01' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT with FUTURE effectiveFrom does NOT promote into Product.costPrice', async ({ request }) => {
    let productUpdates = [];
    ctx.mockPrisma.product.update.mockImplementation(async (args) => {
      productUpdates.push(args);
      return { ...PRODUCT, ...args.data };
    });
    ctx.mockPrisma.productCostPrice.upsert.mockResolvedValue({});
    // Only past/today rows exist — no row matches the lte:today filter for
    // promotion to denorm, so denorm should NOT be updated with the future value.
    ctx.mockPrisma.productCostPrice.findFirst.mockResolvedValue(null);

    const res = await request.put('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { costPrice: 999, effectiveFrom: futureStr(30) },
    });

    expect(res.status()).toBe(200);
    // No update should have set costPrice on Product (only the initial update without it)
    const costUpdates = productUpdates.filter(u => u.data.costPrice !== undefined);
    expect(costUpdates).toHaveLength(0);
  });

  test('PUT with TODAY effectiveFrom DOES update Product.costPrice (the latest <= today)', async ({ request }) => {
    let productUpdates = [];
    ctx.mockPrisma.product.update.mockImplementation(async (args) => {
      productUpdates.push(args);
      return { ...PRODUCT, ...args.data };
    });
    ctx.mockPrisma.productCostPrice.upsert.mockResolvedValue({});
    ctx.mockPrisma.productCostPrice.findFirst.mockResolvedValue({ costPrice: 30 });

    const res = await request.put('/api/v1/products/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { costPrice: 30, effectiveFrom: todayStr() },
    });

    expect(res.status()).toBe(200);
    const costUpdates = productUpdates.filter(u => u.data.costPrice !== undefined);
    expect(costUpdates).toHaveLength(1);
    expect(costUpdates[0].data.costPrice).toBe(30);
  });

  test('GET returns upcomingCostPrice / upcomingCostPriceFrom when a future row exists', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    const future = new Date(futureStr(14));
    ctx.mockPrisma.productCostPrice.findMany.mockResolvedValue([
      { productId: 1, costPrice: 99, effectiveFrom: future },
    ]);
    ctx.mockPrisma.productSellingPrice.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row.upcomingCostPrice).toBe(99);
    expect(row.upcomingCostPriceFrom).toBeTruthy();
    expect(row.upcomingSellingPrice).toBeNull();
    expect(row.upcomingSellingPriceFrom).toBeNull();
  });
});
