'use strict';

/**
 * Brands API Tests
 * Covers: GET /api/v1/brands, POST /api/v1/brands, PUT /api/v1/brands/:id
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

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

  test('returns 201 when brand is created', async ({ request }) => {
    ctx.mockPrisma.brand.create.mockResolvedValue({ id: 3, name: 'NewBrand' });

    const res = await request.post('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'NewBrand' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('name', 'NewBrand');
  });

  test('returns 400 when name is missing', async ({ request }) => {
    const res = await request.post('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
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

  test('returns 200 when brand is updated', async ({ request }) => {
    ctx.mockPrisma.brand.update.mockResolvedValue({ id: 1, name: 'Updated' });

    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
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

  test('returns 200 when depositEnabled is updated', async ({ request }) => {
    ctx.mockPrisma.brand.update.mockResolvedValue({ id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0 });

    const res = await request.put('/api/v1/brands/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { depositEnabled: true },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('depositEnabled', true);
  });

  test('returns 200 when depositPerLitre is updated', async ({ request }) => {
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

// ─── PATCH /api/v1/brands/salesperson-reorder ────────────────────────────────

test.describe('PATCH /api/v1/brands/salesperson-reorder', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/brands/salesperson-reorder', { data: [] });
    expect(res.status()).toBe(403);
  });

  test('returns 200 and writes to salespersonDisplayOrder (not displayOrder)', async ({ request }) => {
    const updateCalls = [];
    ctx.mockPrisma.brand.update.mockImplementation(async (args) => {
      updateCalls.push(args);
      return {};
    });

    const res = await request.patch('/api/v1/brands/salesperson-reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [{ id: 1, displayOrder: 5 }],
    });

    expect(res.status()).toBe(200);
    expect(updateCalls[0]).toEqual({ where: { id: 1 }, data: { salespersonDisplayOrder: 5 } });
  });
});
