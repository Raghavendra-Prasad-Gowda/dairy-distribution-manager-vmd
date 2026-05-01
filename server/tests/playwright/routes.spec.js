'use strict';

/**
 * Routes API Tests
 * Covers: GET, POST, PUT /:id, DELETE /:id /api/v1/routes
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const ROUTE = { id: 1, brandId: 1, routeNumber: '220', displayOrder: 0, isActive: true };

// ─── GET /api/v1/routes ───────────────────────────────────────────────────────

test.describe('GET /api/v1/routes', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/routes');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with route list', async ({ request }) => {
    ctx.mockPrisma.route.findMany.mockResolvedValue([ROUTE]);

    const res = await request.get('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 filtered by brandId', async ({ request }) => {
    ctx.mockPrisma.route.findMany.mockResolvedValue([ROUTE]);

    const res = await request.get('/api/v1/routes?brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 with empty list when no routes', async ({ request }) => {
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── POST /api/v1/routes ──────────────────────────────────────────────────────

test.describe('POST /api/v1/routes', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/routes', {
      data: { brandId: 1, routeNumber: '220' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when route is created', async ({ request }) => {
    ctx.mockPrisma.route.create.mockResolvedValue(ROUTE);

    const res = await request.post('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, routeNumber: '220' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('routeNumber', '220');
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '220' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when routeNumber is missing', async ({ request }) => {
    const res = await request.post('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1 },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/routes/:id ───────────────────────────────────────────────────

test.describe('PUT /api/v1/routes/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/routes/1', { data: { routeNumber: '999' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when route is updated', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockResolvedValue({ ...ROUTE, routeNumber: '999' });

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('routeNumber', '999');
  });

  test('returns 404 when route does not exist', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(null);

    const res = await request.put('/api/v1/routes/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric route ID', async ({ request }) => {
    const res = await request.put('/api/v1/routes/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── DELETE /api/v1/routes/:id ────────────────────────────────────────────────

test.describe('DELETE /api/v1/routes/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/routes/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when route is deleted', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.delete.mockResolvedValue(ROUTE);

    const res = await request.delete('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe('Route deleted');
  });

  test('returns 404 when route does not exist', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/routes/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric route ID', async ({ request }) => {
    const res = await request.delete('/api/v1/routes/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});
