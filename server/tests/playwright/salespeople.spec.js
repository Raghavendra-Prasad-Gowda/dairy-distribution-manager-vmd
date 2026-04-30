'use strict';

/**
 * Salespeople API Tests
 * Covers: GET, GET /:id, POST, PUT /:id /api/v1/salespeople
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SALESPERSON = { id: 1, name: 'Raju', phone: '9999999999', route: 'North', isActive: true };

// ─── GET /api/v1/salespeople ──────────────────────────────────────────────────

test.describe('GET /api/v1/salespeople', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with active salesperson list', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([SALESPERSON]);

    const res = await request.get('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 including inactive when all=true', async ({ request }) => {
    const inactive = { ...SALESPERSON, id: 2, isActive: false };
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([SALESPERSON, inactive]);

    const res = await request.get('/api/v1/salespeople?all=true', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });
});

// ─── GET /api/v1/salespeople/:id ─────────────────────────────────────────────

test.describe('GET /api/v1/salespeople/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when salesperson exists', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);

    const res = await request.get('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('name', 'Raju');
  });

  test('returns 404 when salesperson does not exist', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);

    const res = await request.get('/api/v1/salespeople/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── POST /api/v1/salespeople ─────────────────────────────────────────────────

test.describe('POST /api/v1/salespeople', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople', {
      data: { name: 'Raju' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when salesperson is created', async ({ request }) => {
    ctx.mockPrisma.salesperson.create.mockResolvedValue(SALESPERSON);

    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Raju' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveProperty('name', 'Raju');
  });

  test('returns 400 when name is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 201 with optional phone and route fields', async ({ request }) => {
    ctx.mockPrisma.salesperson.create.mockResolvedValue(SALESPERSON);

    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Raju', phone: '9999999999', route: 'North' },
    });

    expect(res.status()).toBe(201);
  });
});

// ─── PUT /api/v1/salespeople/:id ─────────────────────────────────────────────

test.describe('PUT /api/v1/salespeople/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/1', { data: { name: 'Updated' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when salesperson is updated', async ({ request }) => {
    ctx.mockPrisma.salesperson.update.mockResolvedValue({ ...SALESPERSON, name: 'Updated' });

    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('name', 'Updated');
  });

  test('returns 404 when salesperson does not exist', async ({ request }) => {
    const notFound = Object.assign(new Error('Not found'), { code: 'P2025' });
    ctx.mockPrisma.salesperson.update.mockRejectedValue(notFound);

    const res = await request.put('/api/v1/salespeople/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 200 when deactivating a salesperson', async ({ request }) => {
    ctx.mockPrisma.salesperson.update.mockResolvedValue({ ...SALESPERSON, isActive: false });

    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { isActive: false },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Updated' },
    });
    expect(res.status()).toBe(400);
  });
});
