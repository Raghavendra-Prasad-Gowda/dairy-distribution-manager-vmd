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
    let updateCalls = [];
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
