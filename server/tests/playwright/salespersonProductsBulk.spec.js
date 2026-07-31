'use strict';

/**
 * Salesperson Products — Bulk Multi-Salesman Access API Tests
 * Covers: POST /api/v1/salespeople/products/bulk-update
 *
 * Admin-only endpoint: enable or disable multiple products for multiple salespeople
 * in a single request.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── POST /api/v1/salespeople/products/bulk-update ───────────────────────────

test.describe('POST /api/v1/salespeople/products/bulk-update', () => {
  const validPayload = () => ({
    salespersonIds: [1, 2],
    products: [
      { productId: 1, isEnabled: true },
      { productId: 2, isEnabled: false },
    ],
  });

  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when salespersonIds is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { products: [{ productId: 1, isEnabled: true }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when salespersonIds array is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [], products: [{ productId: 1, isEnabled: true }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when products array is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [1] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when products array is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [1], products: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when isEnabled is missing from a product item', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1],
        products: [{ productId: 1 }],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when productId is missing from a product item', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1],
        products: [{ isEnabled: true }],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 when enabling products for multiple salespeople', async ({ request }) => {
    ctx.mockPrisma.salespersonProduct.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1, 2],
        products: [{ productId: 1, isEnabled: true }],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/2 salesman/i);
    expect(body.data.message).toMatch(/1 products/i);
  });

  test('returns 200 when disabling products for multiple salespeople', async ({ request }) => {
    ctx.mockPrisma.salespersonProduct.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1, 2, 3],
        products: [
          { productId: 1, isEnabled: false },
          { productId: 2, isEnabled: false },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/3 salesman/i);
    expect(body.data.message).toMatch(/2 products/i);
  });

  test('creates upserts for every (salespersonId × productId) combination', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.salespersonProduct.upsert.mockImplementation(async (args) => {
      upsertCalls.push({ salespersonId: args.create.salespersonId, productId: args.create.productId, isEnabled: args.create.isEnabled });
      return {};
    });

    const res = await request.post('/api/v1/salespeople/products/bulk-update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        salespersonIds: [1, 2],
        products: [
          { productId: 10, isEnabled: true },
          { productId: 11, isEnabled: false },
        ],
      },
    });

    expect(res.status()).toBe(200);
    // 2 salespeople × 2 products = 4 upsert calls
    expect(upsertCalls).toHaveLength(4);

    const combinations = upsertCalls.map(c => `${c.salespersonId}:${c.productId}`).sort();
    expect(combinations).toEqual(['1:10', '1:11', '2:10', '2:11'].sort());
  });
});
