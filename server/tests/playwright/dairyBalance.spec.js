'use strict';

/**
 * Dairy Balance API Tests
 * Covers: GET /api/v1/dairy-balance, GET /api/v1/dairy-balance/:brandId
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const BRAND = { id: 1, name: 'Nandini' };

const BALANCE = {
  id: 1, brandId: 1,
  balanceDate: new Date('2026-04-30'),
  openingBalance: 1000, stockValue: 5000,
  amountPaid: 2000, closingBalance: 4000,
};

// ─── GET /api/v1/dairy-balance ────────────────────────────────────────────────

test.describe('GET /api/v1/dairy-balance', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balance for all brands', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([BRAND]);
    // getOrBuildBalance: existing balance found — returns early
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(BALANCE);

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('date', '2026-04-30');
    expect(body.data.brands).toHaveLength(1);
  });

  test('returns 200 with computed balance when no existing record', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([BRAND]);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null); // no existing
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);  // no prev
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.brands[0]).toHaveProperty('closingBalance', 0);
  });

  test('returns 200 with empty brands array when no brands', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.brands).toHaveLength(0);
  });
});

// ─── GET /api/v1/dairy-balance/:brandId ──────────────────────────────────────

test.describe('GET /api/v1/dairy-balance/:brandId', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balance for a specific brand', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(BRAND);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(BALANCE);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('brandName', 'Nandini');
    expect(body.data).toHaveProperty('closingBalance', 4000);
  });

  test('returns 404 when brand does not exist', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(null);

    const res = await request.get('/api/v1/dairy-balance/999?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric brand ID', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/abc?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});
