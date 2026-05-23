'use strict';

/**
 * Salesperson Products API Tests
 * Covers: GET, POST /api/v1/salespeople/:id/products(/bulk)
 *
 * These endpoints toggle which products each salesperson is allowed to
 * dispatch — admin-only configuration.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const PRODUCTS = [
  { id: 1, name: 'Toned Milk 500ml', brandId: 1, brand: { id: 1, name: 'Nandini' }, category: 'Milk',  salespersonDisplayOrder: 1, unitType: 'ml',    unitSize: 500,  containerType: 'crate', unitsPerContainer: 20 },
  { id: 2, name: 'Curd 200g',        brandId: 1, brand: { id: 1, name: 'Nandini' }, category: 'Curd',  salespersonDisplayOrder: 2, unitType: 'gram',  unitSize: 200,  containerType: null,    unitsPerContainer: null },
  { id: 3, name: 'Ghee 1L',          brandId: 2, brand: { id: 2, name: 'Jersey'  }, category: 'Ghee',  salespersonDisplayOrder: 1, unitType: 'ml',    unitSize: 1000, containerType: null,    unitsPerContainer: null },
];

// ─── GET /api/v1/salespeople/:id/products ─────────────────────────────────────

test.describe('GET /api/v1/salespeople/:id/products', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/1/products');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when token is invalid', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/1/products', {
      headers: { Authorization: 'Bearer bad.token.here' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/abc/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with isEnabled=false for products with no override row', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue(PRODUCTS);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
    expect(body.data.every(p => p.isEnabled === false)).toBe(true);
    expect(body.data[0]).toMatchObject({
      productId: 1, productName: 'Toned Milk 500ml', brandName: 'Nandini', isEnabled: false,
    });
  });

  test('returns 200 with isEnabled reflecting override rows', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue(PRODUCTS);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: 1, isEnabled: true  },
      { productId: 2, isEnabled: false },
      // productId 3 has no row → defaults to false
    ]);

    const res = await request.get('/api/v1/salespeople/1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const byId = Object.fromEntries(body.data.map(p => [p.productId, p.isEnabled]));
    expect(byId[1]).toBe(true);
    expect(byId[2]).toBe(false);
    expect(byId[3]).toBe(false);
  });

  test('includes container fields in response shape', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCTS[0]]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data[0]).toMatchObject({
      containerType:     'crate',
      unitsPerContainer: 20,
      unitType:          'ml',
      unitSize:          500,
    });
  });

  test('returns 200 with empty list when no products exist', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/products', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ─── POST /api/v1/salespeople/:id/products/bulk ──────────────────────────────

test.describe('POST /api/v1/salespeople/:id/products/bulk', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/products/bulk', {
      data: { products: [{ productId: 1, isEnabled: true }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when products array is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when products array is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when an item is missing productId', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [{ isEnabled: true }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when isEnabled is not a boolean', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [{ productId: 1, isEnabled: 'yes' }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/abc/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [{ productId: 1, isEnabled: true }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 when products are toggled', async ({ request }) => {
    ctx.mockPrisma.salespersonProduct.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/salespeople/1/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [
          { productId: 1, isEnabled: true  },
          { productId: 2, isEnabled: false },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/2 products updated/);
  });

  test('issues an upsert per product within a transaction', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.salespersonProduct.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/salespeople/5/products/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [
          { productId: 10, isEnabled: true  },
          { productId: 11, isEnabled: false },
          { productId: 12, isEnabled: true  },
        ],
      },
    });

    expect(res.status()).toBe(200);
    expect(upsertCalls).toHaveLength(3);
    expect(upsertCalls[0].where.salespersonId_productId).toEqual({ salespersonId: 5, productId: 10 });
    expect(upsertCalls[0].create.isEnabled).toBe(true);
    expect(upsertCalls[1].update.isEnabled).toBe(false);
  });
});
