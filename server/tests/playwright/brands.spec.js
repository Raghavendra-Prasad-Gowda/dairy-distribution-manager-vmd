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
});
