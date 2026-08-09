'use strict';

/**
 * Categories API Tests
 * Covers: GET, POST, PATCH /reorder, PUT /:id, DELETE /:id /api/v1/categories
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const CATEGORY = { id: 1, brandId: 1, name: 'Milk', displayOrder: 0 };

// ─── GET /api/v1/categories ───────────────────────────────────────────────────

test.describe('GET /api/v1/categories', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/categories');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with category list', async ({ request }) => {
    ctx.mockPrisma.category.findMany.mockResolvedValue([CATEGORY]);

    const res = await request.get('/api/v1/categories', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 with empty list when no categories', async ({ request }) => {
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/categories', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  test('returns 200 filtered by brandId', async ({ request }) => {
    ctx.mockPrisma.category.findMany.mockResolvedValue([CATEGORY]);

    const res = await request.get('/api/v1/categories?brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
  });
});

// ─── POST /api/v1/categories ──────────────────────────────────────────────────

test.describe('POST /api/v1/categories', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/categories', {
      data: { brandId: 1, name: 'Milk' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when category is created', async ({ request }) => {
    ctx.mockPrisma.category.create.mockResolvedValue(CATEGORY);

    const res = await request.post('/api/v1/categories', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, name: 'Milk' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('name', 'Milk');
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/categories', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Milk' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when name is missing', async ({ request }) => {
    const res = await request.post('/api/v1/categories', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1 },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PATCH /api/v1/categories/reorder ────────────────────────────────────────

test.describe('PATCH /api/v1/categories/reorder', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/categories/reorder', {
      data: [{ id: 1, displayOrder: 0 }],
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.patch('/api/v1/categories/reorder', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: [{ id: 1, displayOrder: 0 }],
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when categories are reordered', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([CATEGORY]);

    const res = await request.patch('/api/v1/categories/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [{ id: 1, displayOrder: 0 }, { id: 2, displayOrder: 1 }],
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/reordered/);
  });

  test('returns 400 when payload is not an array', async ({ request }) => {
    const res = await request.patch('/api/v1/categories/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { id: 1, displayOrder: 0 },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/categories/:id ───────────────────────────────────────────────

test.describe('PUT /api/v1/categories/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/categories/1', { data: { name: 'Updated' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when category is updated', async ({ request }) => {
    ctx.mockPrisma.category.findUnique.mockResolvedValue(CATEGORY);
    ctx.mockPrisma.$transaction.mockResolvedValue([{ ...CATEGORY, name: 'Updated' }]);

    const res = await request.put('/api/v1/categories/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when category does not exist', async ({ request }) => {
    ctx.mockPrisma.category.findUnique.mockResolvedValue(null);

    const res = await request.put('/api/v1/categories/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 when name is empty', async ({ request }) => {
    const res = await request.put('/api/v1/categories/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric category ID', async ({ request }) => {
    const res = await request.put('/api/v1/categories/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 when depositEnabled is updated without name', async ({ request }) => {
    ctx.mockPrisma.category.findUnique.mockResolvedValue(CATEGORY);
    ctx.mockPrisma.category.update.mockResolvedValue({ ...CATEGORY, depositEnabled: false });

    const res = await request.put('/api/v1/categories/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { depositEnabled: false },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('depositEnabled', false);
  });

  test('returns 400 when neither name nor depositEnabled is provided', async ({ request }) => {
    const res = await request.put('/api/v1/categories/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

// ─── DELETE /api/v1/categories/:id ───────────────────────────────────────────

test.describe('DELETE /api/v1/categories/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/categories/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when category is deleted', async ({ request }) => {
    ctx.mockPrisma.category.findUnique.mockResolvedValue(CATEGORY);
    ctx.mockPrisma.category.delete.mockResolvedValue(CATEGORY);

    const res = await request.delete('/api/v1/categories/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe('Category deleted');
  });

  test('returns 404 when category does not exist', async ({ request }) => {
    ctx.mockPrisma.category.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/categories/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric category ID', async ({ request }) => {
    const res = await request.delete('/api/v1/categories/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});

