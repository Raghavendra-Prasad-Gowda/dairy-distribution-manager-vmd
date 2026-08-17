'use strict';

/**
 * Salesman User Global Settings Access Tests
 *
 * Tests for `/products/salesperson-global` endpoint:
 * - Admin-only access control
 * - Salesman cannot modify global settings
 * - Global settings validation (price requirements, enablement)
 * - Invalid token handling
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const GLOBAL_PRODUCT = {
  id: 1,
  name: 'Nandini Toned Milk 500ml',
  brandId: 1,
  brand: { id: 1, name: 'Nandini', displayOrder: 1 },
  category: 'Milk',
  categoryDisplayOrder: 1,
  salespersonEnabled: true,
  salespersonDefaultPrice: '50.00',
  dairyCostPrice: '30.00',
  dairySellingPrice: '45.00',
};

const DISABLED_PRODUCT = {
  id: 2,
  name: 'Jersey Milk 1L',
  brandId: 2,
  brand: { id: 2, name: 'Jersey', displayOrder: 2 },
  category: 'Milk',
  categoryDisplayOrder: 1,
  salespersonEnabled: false,
  salespersonDefaultPrice: '0.00',
  dairyCostPrice: '35.00',
  dairySellingPrice: '48.00',
};

// ─── GET /api/v1/products/salesperson-global (admin-only) ─────────────────────

test.describe('GET /api/v1/products/salesperson-global', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.get('/api/v1/products/salesperson-global');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 with product list when admin authenticated', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([GLOBAL_PRODUCT, DISABLED_PRODUCT]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toHaveProperty('salespersonEnabled', true);
    expect(body.data[0]).toHaveProperty('salespersonDefaultPrice', 50);
    expect(body.data[1]).toHaveProperty('salespersonEnabled', false);
  });

  test('response shape includes all required fields for global settings UI', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([GLOBAL_PRODUCT]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const product = (await res.json()).data[0];
    expect(product).toHaveProperty('productId', 1);
    expect(product).toHaveProperty('productName', 'Nandini Toned Milk 500ml');
    expect(product).toHaveProperty('brandId', 1);
    expect(product).toHaveProperty('brandName', 'Nandini');
    expect(product).toHaveProperty('category', 'Milk');
    expect(product).toHaveProperty('salespersonEnabled', true);
    expect(product).toHaveProperty('salespersonDefaultPrice', 50);
  });
});

// ─── Display order fields — used by the salesman pricing UI for sorted layout ──

test.describe('GET /api/v1/products/salesperson-global — display order fields', () => {
  const PRODUCT_WITH_ORDER = {
    id: 10,
    name: 'Nandini Toned Milk 500ml',
    brandId: 1,
    brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    category: 'Milk',
    displayOrder: 3,
    salespersonEnabled: true,
    salespersonDefaultPrice: '50.00',
    costPrice: '30.00',
    sellingPrice: '45.00',
  };

  test('response includes displayOrder field from product', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_WITH_ORDER]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const product = (await res.json()).data[0];
    expect(product).toHaveProperty('displayOrder', 3);
  });

  test('categoryDisplayOrder is computed from category.findMany lookup', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_WITH_ORDER]);
    // Category row for brandId=1, name='Milk' has displayOrder=5
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 1, name: 'Milk', displayOrder: 5 },
      { brandId: 1, name: 'Curd', displayOrder: 8 },
    ]);

    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const product = (await res.json()).data[0];
    // categoryDisplayOrder must reflect the category table value, not 999
    expect(product).toHaveProperty('categoryDisplayOrder', 5);
  });

  test('categoryDisplayOrder defaults to 999 when no matching category exists', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_WITH_ORDER]);
    // No category row for brandId=1 + 'Milk'
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 2, name: 'Milk', displayOrder: 1 }, // wrong brandId
    ]);

    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const product = (await res.json()).data[0];
    expect(product).toHaveProperty('categoryDisplayOrder', 999);
  });

  test('categoryDisplayOrder is keyed by brandId+category so products in same-named category of different brands get their own order', async ({ request }) => {
    const BRAND1_MILK = { ...PRODUCT_WITH_ORDER, id: 11, brandId: 1, category: 'Milk' };
    const BRAND2_MILK = {
      id: 12, name: 'Jersey Full Cream 1L', brandId: 2,
      brand: { id: 2, name: 'Jersey', displayOrder: 2 },
      category: 'Milk', displayOrder: 1,
      salespersonEnabled: true, salespersonDefaultPrice: '60.00',
      costPrice: '40.00', sellingPrice: '55.00',
    };

    ctx.mockPrisma.product.findMany.mockResolvedValue([BRAND1_MILK, BRAND2_MILK]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 1, name: 'Milk', displayOrder: 2 },
      { brandId: 2, name: 'Milk', displayOrder: 7 },
    ]);

    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    const brand1 = data.find(p => p.brandId === 1);
    const brand2 = data.find(p => p.brandId === 2);
    expect(brand1.categoryDisplayOrder).toBe(2);
    expect(brand2.categoryDisplayOrder).toBe(7);
  });
});

// ─── PATCH /api/v1/products/salesperson-global (admin-only) ────────────────────

test.describe('PATCH /api/v1/products/salesperson-global', () => {
  const validPayload = () => ({
    products: [
      { productId: 1, isEnabled: true, defaultPrice: 50 },
    ],
  });

  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when products array is missing', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when products array is empty', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when enabling without default price', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [{ productId: 1, isEnabled: true, defaultPrice: 0 }],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error || JSON.stringify(body)).toMatch(/price must be set/i);
  });

  test('returns 400 when enabling with negative price', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [{ productId: 1, isEnabled: true, defaultPrice: -10 }],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error || JSON.stringify(body)).toMatch(/price must be set/i);
  });

  test('returns 200 when admin updates salespersonEnabled flag', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    ctx.mockPrisma.$transaction.mockResolvedValue([
      { id: 1, salespersonEnabled: true, salespersonDefaultPrice: '50.00' },
    ]);

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [{ productId: 1, isEnabled: true, defaultPrice: 50 }],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/products updated/i);
  });

  test('returns 200 when admin updates default price only', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    ctx.mockPrisma.$transaction.mockResolvedValue([
      { id: 1, salespersonDefaultPrice: '55.00' },
    ]);

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [{ productId: 1, defaultPrice: 55 }],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 when admin disables product (does not require price)', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    ctx.mockPrisma.$transaction.mockResolvedValue([
      { id: 2, salespersonEnabled: false },
    ]);

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [{ productId: 2, isEnabled: false }],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 when admin updates multiple products', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    ctx.mockPrisma.$transaction.mockResolvedValue([
      { id: 1, salespersonEnabled: true, salespersonDefaultPrice: '50.00' },
      { id: 2, salespersonEnabled: false },
    ]);

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [
          { productId: 1, isEnabled: true, defaultPrice: 50 },
          { productId: 2, isEnabled: false },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/2 products updated/i);
  });

  test('can update both isEnabled and defaultPrice together', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const updateCalls = [];
    ctx.mockPrisma.product.update.mockImplementation(async (args) => {
      updateCalls.push(args.data);
      return { id: args.where.id };
    });
    ctx.mockPrisma.$transaction.mockImplementation(async (ops) => {
      return ops.map(op => op); // return updated product
    });

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [
          { productId: 1, isEnabled: true, defaultPrice: 60 },
        ],
      },
    });

    expect(res.status()).toBe(200);
  });

  test('response message shows count of updated products', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    ctx.mockPrisma.$transaction.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        products: [
          { productId: 1, defaultPrice: 50 },
          { productId: 2, isEnabled: true, defaultPrice: 55 },
          { productId: 3, isEnabled: false },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/3 products updated/i);
  });

  test('Slack enrichment uses the looked-up product name/brand/price when available', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.$transaction.mockResolvedValue([{ id: 1, salespersonDefaultPrice: '50.00' }]);
    // Populates `info` in the post-update Slack-enrichment lookup so both the
    // truthy `info?.name`/`info?.brand?.name` branches and the
    // "defaultPrice omitted, fall back to info.salespersonDefaultPrice"
    // branch are exercised.
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, name: 'Toned Milk 500ml', salespersonDefaultPrice: '42.00', brand: { name: 'Nandini' } },
    ]);

    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [{ productId: 1, defaultPrice: undefined }] },
    });

    expect(res.status()).toBe(200);
  });
});

// ─── Endpoint isolation: salesman cannot make any global settings changes ──────

test.describe('Global settings isolation from salesman access', () => {
  test('salesman GET returns 403 (not null data)', async ({ request }) => {
    const res = await request.get('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
    });

    expect(res.status()).toBe(403);
    // Verify body is an error, not empty data
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });

  test('salesman PATCH returns 403 (request blocked entirely)', async ({ request }) => {
    const res = await request.patch('/api/v1/products/salesperson-global', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
      data: { products: [{ productId: 1, defaultPrice: 999 }] },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });
});
