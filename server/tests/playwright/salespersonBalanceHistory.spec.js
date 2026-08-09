'use strict';

/**
 * Salesperson Balance History API Tests
 * Covers: GET /api/v1/salesperson-balance/:id/history
 *
 * Paginated balance history for a salesperson with optional date-range filtering.
 * Salesman can only access their own history; admin can access any.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SALESPERSON = { id: 1, name: 'Raju', route: 'North', isActive: true };

const BALANCE_ROWS = [
  {
    id: 1,
    salespersonId: 1,
    balanceDate: new Date('2026-05-10'),
    openingBalance: 500,
    stockGiven: 3000,
    amountPaid: 2000,
    closingBalance: 1500,
  },
  {
    id: 2,
    salespersonId: 1,
    balanceDate: new Date('2026-05-09'),
    openingBalance: 0,
    stockGiven: 1500,
    amountPaid: 1000,
    closingBalance: 500,
  },
];

// ─── GET /api/v1/salesperson-balance/:id/history ──────────────────────────────

test.describe('GET /api/v1/salesperson-balance/:id/history', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance/1/history');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-balance/abc/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 404 when salesperson does not exist', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);

    const res = await request.get('/api/v1/salesperson-balance/999/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 200 with paginated balance history for admin', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue(BALANCE_ROWS);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(2);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination).toMatchObject({
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  test('response items include all balance fields as numbers', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([BALANCE_ROWS[0]]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(1);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    const item = (await res.json()).data.items[0];
    expect(item).toHaveProperty('openingBalance', 500);
    expect(item).toHaveProperty('stockGiven', 3000);
    expect(item).toHaveProperty('amountPaid', 2000);
    expect(item).toHaveProperty('closingBalance', 1500);
    expect(item).toHaveProperty('balanceDate');
  });

  test('returns 200 with empty items when no balance records exist', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(0);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
    expect(body.data.pagination.hasMore).toBe(false);
  });

  test('respects page and limit query params', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([BALANCE_ROWS[0]]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(50);

    const res = await request.get('/api/v1/salesperson-balance/1/history?page=2&limit=10', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.pagination.page).toBe(2);
    expect(body.data.pagination.limit).toBe(10);
    expect(body.data.pagination.total).toBe(50);
    expect(body.data.pagination.pages).toBe(5);
    expect(body.data.pagination.hasMore).toBe(true);
  });

  test('accepts from and to date range filters', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue(BALANCE_ROWS);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(2);

    const res = await request.get(
      '/api/v1/salesperson-balance/1/history?from=2026-05-01&to=2026-05-31',
      { headers: { Authorization: `Bearer ${makeAuthToken()}` } }
    );

    expect(res.status()).toBe(200);
    expect((await res.json()).data.items).toHaveLength(2);
  });

  test('hasMore is false when on the last page', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue(BALANCE_ROWS);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(2);

    const res = await request.get('/api/v1/salesperson-balance/1/history?page=1&limit=20', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    const body = await res.json();
    expect(body.data.pagination.hasMore).toBe(false);
    expect(body.data.pagination.pages).toBe(1);
  });
});

// ─── Salesman RBAC: own history vs. other's history ──────────────────────────

test.describe('GET /api/v1/salesperson-balance/:id/history — salesman RBAC', () => {
  test('salesman can access their own balance history', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue(BALANCE_ROWS);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(2);

    // Token has salespersonId: 1; accessing id: 1 → allowed
    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });

    expect(res.status()).toBe(200);
  });

  test('salesman cannot access another salesperson\'s balance history', async ({ request }) => {
    // Token has salespersonId: 2; accessing id: 1 → denied
    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(2)}` },
    });

    expect(res.status()).toBe(403);
  });
});

// ─── Admin top-ups attached to history rows ──────────────────────────────────

test.describe('GET /api/v1/salesperson-balance/:id/history — admin top-ups', () => {
  const ROW_WITH_TOPUP = {
    ...BALANCE_ROWS[0],
    topUpAmount: 50000,
  };
  const TOP_UP = {
    paymentDate: BALANCE_ROWS[0].balanceDate,
    amount:      50000,
    notes:       'Opening dues',
    createdBy:   'raghav',
  };

  test('exposes topUpAmount on each row', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([ROW_WITH_TOPUP]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(1);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([TOP_UP]);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).data.items[0].topUpAmount).toBe(50000);
  });

  test('attaches the top-up detail with the admin who recorded it', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([ROW_WITH_TOPUP]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(1);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([TOP_UP]);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    const item = (await res.json()).data.items[0];
    expect(item.topUps).toHaveLength(1);
    expect(item.topUps[0]).toMatchObject({ amount: 50000, createdBy: 'raghav', notes: 'Opening dues' });
  });

  test('queries only top-up rows, scoped to this salesperson', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([ROW_WITH_TOPUP]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(1);
    let args;
    ctx.mockPrisma.salespersonPayment.findMany.mockImplementation(async (a) => { args = a; return [TOP_UP]; });

    await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(args.where.isTopUp).toBe(true);
    expect(args.where.salespersonId).toBe(1);
  });

  test('skips the top-up lookup entirely when no row has one', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    // BALANCE_ROWS carry no topUpAmount at all — the common case.
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue(BALANCE_ROWS);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(2);
    let queried = false;
    ctx.mockPrisma.salespersonPayment.findMany.mockImplementation(async () => { queried = true; return []; });

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(queried).toBe(false);
  });

  test('rows without a top-up get topUpAmount 0 and an empty topUps array', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([ROW_WITH_TOPUP, BALANCE_ROWS[1]]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(2);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([TOP_UP]);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    const [withTopUp, without] = (await res.json()).data.items;
    expect(withTopUp.topUps).toHaveLength(1);
    expect(without.topUpAmount).toBe(0);
    expect(without.topUps).toEqual([]);
  });

  test('a salesman sees the top-up attribution on their own history', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([ROW_WITH_TOPUP]);
    ctx.mockPrisma.salespersonBalance.count.mockResolvedValue(1);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([TOP_UP]);

    const res = await request.get('/api/v1/salesperson-balance/1/history', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).data.items[0].topUps[0].createdBy).toBe('raghav');
  });
});
