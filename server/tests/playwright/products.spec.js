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
