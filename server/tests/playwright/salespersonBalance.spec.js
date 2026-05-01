'use strict';

/**
 * Salesperson Balance API Tests
 * Covers: GET /api/v1/salesperson-balance, GET /api/v1/salesperson-balance/:id
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SALESPERSON = { id: 1, name: 'Raju', route: 'North', isActive: true };

const BALANCE = {
  id: 1, salespersonId: 1,
  balanceDate: new Date('2026-04-30'),
  openingBalance: 500, stockGiven: 3000,
  amountPaid: 1500, closingBalance: 2000,
};

// ─── GET /api/v1/salesperson-balance ─────────────────────────────────────────

test.describe('GET /api/v1/salesperson-balance', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balances for all active salespeople', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([SALESPERSON]);
    // buildSalespersonBalance: existing record found — returns early
    ctx.mockPrisma.salespersonBalance.findUnique.mockResolvedValue(BALANCE);

    const res = await request.get('/api/v1/salesperson-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('salespersonName', 'Raju');
  });

  test('returns 200 with computed balance when no existing record', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([SALESPERSON]);
    ctx.mockPrisma.salespersonBalance.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.salespersonBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    ctx.mockPrisma.salespersonPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/salesperson-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('closingBalance', 0);
  });

  test('returns 200 with empty list when no active salespeople', async ({ request }) => {
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salesperson-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── GET /api/v1/salesperson-balance/:id ─────────────────────────────────────

test.describe('GET /api/v1/salesperson-balance/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance/1?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balance for a specific salesperson', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findUnique.mockResolvedValue(BALANCE);

    const res = await request.get('/api/v1/salesperson-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('salespersonName', 'Raju');
    expect(body.data).toHaveProperty('closingBalance', 2000);
  });

  test('returns 404 when salesperson does not exist', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);

    const res = await request.get('/api/v1/salesperson-balance/999?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance/abc?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});
