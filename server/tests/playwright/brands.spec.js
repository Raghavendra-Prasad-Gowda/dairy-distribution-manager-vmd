'use strict';

/**
 * Brands API Tests
 * Covers: GET /api/v1/brands, POST /api/v1/brands, PUT /api/v1/brands/:id
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken, makeSuperAdminToken } = setupSuite();

// ─── GET /api/v1/brands ───────────────────────────────────────────────────────

test.describe('GET /api/v1/brands', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/brands');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when token is invalid', async ({ request }) => {
    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: 'Bearer bad.token.here' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 200 with brand list for authenticated user', async ({ request }) => {
    const brands = [
      { id: 1, name: 'Nandini' },
      { id: 2, name: 'Jersey' },
    ];
    ctx.mockPrisma.brand.findMany.mockResolvedValue(brands);

    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(brands);
  });
});

// ─── POST /api/v1/brands ──────────────────────────────────────────────────────

test.describe('POST /api/v1/brands', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/brands', { data: { name: 'NewBrand' } });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when admin (non-superadmin) tries to create a brand', async ({ request }) => {
    const res = await request.post('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'NewBrand' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when superadmin creates a brand', async ({ request }) => {
    ctx.mockPrisma.brand.create.mockResolvedValue({ id: 3, name: 'NewBrand' });

    const res = await request.post('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { name: 'NewBrand' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('name', 'NewBrand');
  });

  test('returns 400 when name is missing', async ({ request }) => {
    const res = await request.post('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/brands/:id ───────────────────────────────────────────────────

test.describe('PUT /api/v1/brands/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/brands/1', { data: { name: 'Updated' } });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when admin tries to rename a brand', async ({ request }) => {
    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when superadmin renames a brand', async ({ request }) => {
    ctx.mockPrisma.brand.update.mockResolvedValue({ id: 1, name: 'Updated' });

    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('name', 'Updated');
  });

  test('returns 400 for non-numeric brand ID', async ({ request }) => {
    const res = await request.put('/api/v1/brands/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 when admin updates depositEnabled', async ({ request }) => {
    ctx.mockPrisma.brand.update.mockResolvedValue({ id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0 });

    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { depositEnabled: true },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('depositEnabled', true);
  });

  test('returns 200 when admin updates depositPerLitre', async ({ request }) => {
    ctx.mockPrisma.brand.update.mockResolvedValue({ id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0.2 });

    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { depositEnabled: true, depositPerLitre: 0.2 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('depositPerLitre', 0.2);
  });

  test('returns 400 when depositPerLitre is negative', async ({ request }) => {
    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { depositPerLitre: -1 },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── POST /api/v1/brands/:id/copy-products ───────────────────────────────────

test.describe('POST /api/v1/brands/:id/copy-products', () => {
  const SOURCE_BRAND = { id: 2, name: 'Jersey' };
  const TARGET_BRAND = { id: 1, name: 'Nandini' };

  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.post('/api/v1/brands/1/copy-products', {
      data: { sourceBrandId: 2 },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: { sourceBrandId: 2 },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { sourceBrandId: 2 },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 for non-numeric brand ID', async ({ request }) => {
    const res = await request.post('/api/v1/brands/abc/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 2 },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when sourceBrandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when source and target brands are the same', async ({ request }) => {
    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 1 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must be different/i);
  });

  test('returns 404 when source brand does not exist', async ({ request }) => {
    const brandQueue = [null, TARGET_BRAND];
    ctx.mockPrisma.brand.findUnique.mockImplementation(async () => brandQueue.shift());

    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 99 },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/source brand not found/i);
  });

  test('returns 404 when target brand does not exist', async ({ request }) => {
    const brandQueue = [SOURCE_BRAND, null];
    ctx.mockPrisma.brand.findUnique.mockImplementation(async () => brandQueue.shift());

    const res = await request.post('/api/v1/brands/99/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 2 },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/target brand not found/i);
  });

  test('returns 200 with zero counts when source brand has no products', async ({ request }) => {
    const brandQueue = [SOURCE_BRAND, TARGET_BRAND];
    ctx.mockPrisma.brand.findUnique.mockImplementation(async () => brandQueue.shift());
    const catQueue = [[], []];
    ctx.mockPrisma.category.findMany.mockImplementation(async () => catQueue.shift());
    const prodQueue = [[], []];
    ctx.mockPrisma.product.findMany.mockImplementation(async () => prodQueue.shift());
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 2 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.copiedProducts).toBe(0);
    expect(body.data.copiedCategories).toBe(0);
    expect(body.data.fromBrand).toBe('Jersey');
    expect(body.data.toBrand).toBe('Nandini');
  });

  test('returns 200 and copies products and categories from source to target', async ({ request }) => {
    const SOURCE_CATS = [{ id: 10, name: 'Toned', brandId: 2, displayOrder: 0, depositEnabled: false }];
    const SOURCE_PROD = {
      id: 100, name: 'Toned 500ml', brandId: 2, isActive: true, category: 'Toned',
      unitType: 'piece', unitSize: null, mlPerCrate: null, containerType: null,
      unitsPerContainer: null, costPrice: 40, sellingPrice: 45,
      showInStockReceipt: true, salespersonEnabled: true, depositEnabled: false, displayOrder: 0,
    };

    const brandQueue = [SOURCE_BRAND, TARGET_BRAND];
    ctx.mockPrisma.brand.findUnique.mockImplementation(async () => brandQueue.shift());
    const catQueue = [SOURCE_CATS, []];
    ctx.mockPrisma.category.findMany.mockImplementation(async () => catQueue.shift());
    const prodQueue = [[SOURCE_PROD], []];
    ctx.mockPrisma.product.findMany.mockImplementation(async () => prodQueue.shift());
    ctx.mockPrisma.category.create.mockResolvedValue({ id: 20, name: 'Toned', brandId: 1 });
    ctx.mockPrisma.product.create.mockResolvedValue({ id: 200, name: 'Toned 500ml', brandId: 1 });
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 2 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.copiedProducts).toBe(1);
    expect(body.data.copiedCategories).toBe(1);
    expect(body.data.fromBrand).toBe('Jersey');
    expect(body.data.toBrand).toBe('Nandini');
  });

  test('skips products and categories that already exist in target brand', async ({ request }) => {
    const SOURCE_CATS = [
      { id: 10, name: 'Toned', brandId: 2, displayOrder: 0, depositEnabled: false },
      { id: 11, name: 'Full Cream', brandId: 2, displayOrder: 1, depositEnabled: false },
    ];
    const SOURCE_PRODS = [
      { id: 100, name: 'Toned 500ml', brandId: 2, isActive: true, category: 'Toned', unitType: 'piece', unitSize: null, mlPerCrate: null, containerType: null, unitsPerContainer: null, costPrice: 40, sellingPrice: 45, showInStockReceipt: true, salespersonEnabled: true, depositEnabled: false, displayOrder: 0 },
      { id: 101, name: 'Full Cream 500ml', brandId: 2, isActive: true, category: 'Full Cream', unitType: 'piece', unitSize: null, mlPerCrate: null, containerType: null, unitsPerContainer: null, costPrice: 50, sellingPrice: 55, showInStockReceipt: true, salespersonEnabled: true, depositEnabled: false, displayOrder: 1 },
    ];

    const brandQueue = [SOURCE_BRAND, TARGET_BRAND];
    ctx.mockPrisma.brand.findUnique.mockImplementation(async () => brandQueue.shift());
    const catQueue = [SOURCE_CATS, [{ name: 'Toned' }]];
    ctx.mockPrisma.category.findMany.mockImplementation(async () => catQueue.shift());
    const prodQueue = [SOURCE_PRODS, [{ name: 'Toned 500ml' }]];
    ctx.mockPrisma.product.findMany.mockImplementation(async () => prodQueue.shift());
    ctx.mockPrisma.category.create.mockResolvedValue({ id: 21, name: 'Full Cream', brandId: 1 });
    ctx.mockPrisma.product.create.mockResolvedValue({ id: 201, name: 'Full Cream 500ml', brandId: 1 });
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/brands/1/copy-products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { sourceBrandId: 2 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.copiedProducts).toBe(1);
    expect(body.data.copiedCategories).toBe(1);
  });
});

// ─── PATCH /api/v1/brands/reorder ────────────────────────────────────────────

test.describe('PATCH /api/v1/brands/reorder', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/brands/reorder', { data: [] });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when payload is not an array', async ({ request }) => {
    const res = await request.patch('/api/v1/brands/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { foo: 'bar' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when an item is missing displayOrder', async ({ request }) => {
    const res = await request.patch('/api/v1/brands/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [{ id: 1 }],
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 and applies each update with correct displayOrder', async ({ request }) => {
    const updateCalls = [];
    ctx.mockPrisma.brand.update.mockImplementation(async (args) => {
      updateCalls.push(args);
      return {};
    });

    const res = await request.patch('/api/v1/brands/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [
        { id: 1, displayOrder: 2 },
        { id: 2, displayOrder: 0 },
        { id: 3, displayOrder: 1 },
      ],
    });

    expect(res.status()).toBe(200);
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0]).toEqual({ where: { id: 1 }, data: { displayOrder: 2 } });
    expect(updateCalls[1]).toEqual({ where: { id: 2 }, data: { displayOrder: 0 } });
    expect(updateCalls[2]).toEqual({ where: { id: 3 }, data: { displayOrder: 1 } });
  });
});

