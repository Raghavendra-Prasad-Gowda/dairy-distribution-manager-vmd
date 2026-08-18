'use strict';

/**
 * Salespeople API Tests
 * Covers: GET, GET /:id, POST, PUT /:id /api/v1/salespeople
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');

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

  // ── Case-insensitive username uniqueness ─────────────────────────────────
  // Login matches usernames case-insensitively, so "Raju" and "RAJU" must not
  // both be allowed to exist. See salespeople.controller.js create().

  test('returns 409 when username collides case-insensitively with an existing salesperson', async ({ request }) => {
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue({ id: 2, username: 'Raju' });

    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'New Guy', username: 'RAJU', password: 'password123' },
    });

    expect(res.status()).toBe(409);
  });

  test('uniqueness check queries the username case-insensitively', async ({ request }) => {
    let findFirstArgs = null;
    ctx.mockPrisma.salesperson.findFirst.mockImplementation(async (args) => {
      findFirstArgs = args;
      return null;
    });
    ctx.mockPrisma.salesperson.create.mockResolvedValue(SALESPERSON);

    await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'New Guy', username: 'newguy', password: 'password123' },
    });

    expect(findFirstArgs.where.username).toEqual({ equals: 'newguy', mode: 'insensitive' });
  });

  test('returns 201 when username has no case-insensitive collision', async ({ request }) => {
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.create.mockResolvedValue(SALESPERSON);

    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'New Guy', username: 'newguy', password: 'password123' },
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

  test('returns 400 when the update payload fails validation (username too short)', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { username: 'ab' },
    });
    expect(res.status()).toBe(400);
  });

  // ── Case-insensitive username uniqueness ─────────────────────────────────

  test('returns 409 when updated username collides case-insensitively with another salesperson', async ({ request }) => {
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue({ id: 2, username: 'Raju' });

    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { username: 'RAJU' },
    });

    expect(res.status()).toBe(409);
  });

  test('uniqueness check excludes the record being updated (id: { not: id })', async ({ request }) => {
    let findFirstArgs = null;
    ctx.mockPrisma.salesperson.findFirst.mockImplementation(async (args) => {
      findFirstArgs = args;
      return null;
    });
    ctx.mockPrisma.salesperson.update.mockResolvedValue(SALESPERSON);

    await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { username: 'raju' },
    });

    expect(findFirstArgs.where).toMatchObject({
      username: { equals: 'raju', mode: 'insensitive' },
      id: { not: 1 },
    });
  });

  test('returns 200 when updated username has no case-insensitive collision', async ({ request }) => {
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.update.mockResolvedValue({ ...SALESPERSON, username: 'newname' });

    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { username: 'newname' },
    });

    expect(res.status()).toBe(200);
  });

  test('GET excludes inactive salespeople by default', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.salesperson.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [SALESPERSON];
    });

    const res = await request.get('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where).toEqual({ isActive: true });
  });

  test('GET ?all=true includes inactive salespeople', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.salesperson.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [SALESPERSON, { ...SALESPERSON, id: 2, isActive: false }];
    });

    const res = await request.get('/api/v1/salespeople?all=true', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where).toEqual({});
  });
});

// ─── DELETE /api/v1/salespeople/:id ──────────────────────────────────────────

test.describe('DELETE /api/v1/salespeople/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/salespeople/1');
    expect(res.status()).toBe(403);
  });

  test('returns 400 for non-numeric ID', async ({ request }) => {
    const res = await request.delete('/api/v1/salespeople/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 and hard-deletes when no transactions exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.count.mockResolvedValue(0);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(0);
    ctx.mockPrisma.salespersonPayment.count.mockResolvedValue(0);
    ctx.mockPrisma.salesperson.delete.mockResolvedValue(SALESPERSON);

    const res = await request.delete('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/deleted/i);
  });

  test('returns 400 and refuses delete when transactions exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.count.mockResolvedValue(3);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(0);
    ctx.mockPrisma.salespersonPayment.count.mockResolvedValue(0);

    const res = await request.delete('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Deactivate them instead/i);
  });
});

// ─── PUT /api/v1/salespeople/reorder ─────────────────────────────────────────

test.describe('PUT /api/v1/salespeople/reorder', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/reorder', {
      data: [{ id: 1, displayOrder: 0 }],
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/reorder', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: [{ id: 1, displayOrder: 0 }],
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 and reorders salespeople', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([]);

    const res = await request.put('/api/v1/salespeople/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [{ id: 1, displayOrder: 0 }, { id: 2, displayOrder: 1 }],
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when body is not an array', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { id: 1, displayOrder: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when displayOrder is negative', async ({ request }) => {
    const res = await request.put('/api/v1/salespeople/reorder', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: [{ id: 1, displayOrder: -1 }],
    });
    expect(res.status()).toBe(400);
  });
});
