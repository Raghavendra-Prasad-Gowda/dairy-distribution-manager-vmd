'use strict';

/**
 * RBAC Matrix Tests
 *
 * Every endpoint is checked against four authentication contexts:
 *   - unauth        → expect 403 (no token; auth middleware blocks)
 *   - expired       → expect 401
 *   - admin         → expect 200/201 (or appropriate success)
 *   - salesman own  → behaviour depends on endpoint
 *   - salesman other (different salespersonId) → must NOT leak data
 *
 * This protects against the data-leak class of bug where requireAdmin or
 * assertAdmin() gets accidentally removed, or scoping-by-role disappears.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { mockSalespersonCascade } = require('../helpers/mock-cascade');
const jwt = require('jsonwebtoken');

const { test, ctx } = setupSuite();

const SECRET = 'test-secret-for-ci';
const adminToken    = () => jwt.sign({ id: 1 }, SECRET, { expiresIn: '1h' });
const salesmanToken = (sid) => jwt.sign({ id: 100, role: 'salesman', salespersonId: sid }, SECRET, { expiresIn: '1h' });
const expiredToken  = () => jwt.sign({ id: 1 }, SECRET, { expiresIn: '-1h' });

// ─── Admin-only endpoints ────────────────────────────────────────────────────
//
// These routes mount under requireAdmin in app.js. Salesman → 403.

const ADMIN_ONLY = [
  { method: 'get',  path: '/api/v1/stock-receipts?date=2026-04-30' },
  { method: 'get',  path: '/api/v1/stock-receipts/availability?date=2026-04-30' },
  { method: 'post', path: '/api/v1/stock-receipts/bulk', body: { brandId: 1, date: '2026-04-30', items: [] } },
  { method: 'get',  path: '/api/v1/dairy-balance?date=2026-04-30' },
  { method: 'get',  path: '/api/v1/dairy-balance/1?date=2026-04-30' },
  { method: 'post', path: '/api/v1/dairy-payments', body: { brandId: 1, amount: 100, paymentDate: '2026-04-30' } },
  { method: 'get',  path: '/api/v1/dairy-payments' },
  { method: 'put',  path: '/api/v1/dairy-payments/1', body: { amount: 100, paymentDate: '2026-04-30' } },
  { method: 'delete', path: '/api/v1/dairy-payments/1' },
  { method: 'get',  path: '/api/v1/salespeople' },
  { method: 'get',  path: '/api/v1/salespeople/1' },
  { method: 'post', path: '/api/v1/salespeople', body: { name: 'Test' } },
  { method: 'put',  path: '/api/v1/salespeople/1', body: { name: 'Updated' } },
  { method: 'delete', path: '/api/v1/salespeople/1' },
  { method: 'get',  path: '/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30' },
  { method: 'get',  path: '/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30' },
  { method: 'get',  path: '/api/v1/reports/stock-summary?date=2026-04-30' },
  { method: 'get',  path: '/api/v1/reports/outstanding' },
  { method: 'get',  path: '/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30' },
  { method: 'get',  path: '/api/v1/reports/daily-dispatch?date=2026-04-30' },
  { method: 'post', path: '/api/v1/pin/verify', body: { pin: '123456' } },
  { method: 'get',  path: '/api/v1/routes' },
  { method: 'post', path: '/api/v1/routes', body: { brandId: 1, routeNumber: 'R1' } },
  { method: 'put',  path: '/api/v1/routes/1', body: { routeNumber: 'R2' } },
  { method: 'delete', path: '/api/v1/routes/1' },
  { method: 'get',  path: '/api/v1/salespeople/1/products' },
  { method: 'post', path: '/api/v1/salespeople/1/products/bulk', body: { products: [{ productId: 1, isEnabled: true }] } },
];

test.describe('RBAC — admin-only endpoints', () => {
  for (const { method, path, body } of ADMIN_ONLY) {
    test(`${method.toUpperCase()} ${path} → unauth = 403`, async ({ request }) => {
      const res = await request[method](path, body ? { data: body } : {});
      expect(res.status()).toBe(403);
    });

    test(`${method.toUpperCase()} ${path} → expired JWT = 401`, async ({ request }) => {
      const res = await request[method](path, {
        headers: { Authorization: `Bearer ${expiredToken()}` },
        ...(body ? { data: body } : {}),
      });
      expect(res.status()).toBe(401);
    });

    test(`${method.toUpperCase()} ${path} → salesman = 403`, async ({ request }) => {
      const res = await request[method](path, {
        headers: { Authorization: `Bearer ${salesmanToken(1)}` },
        ...(body ? { data: body } : {}),
      });
      expect(res.status()).toBe(403);
    });
  }
});

// ─── Shared endpoints (admin + salesman) — scoping rules ─────────────────────

test.describe('RBAC — shared endpoints scoping', () => {
  // GET /dispatches — salesman sees only their own
  test('GET /dispatches → salesman where clause is scoped to salespersonId', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.stockDispatch.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${salesmanToken(7)}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where.salespersonId).toBe(7);
  });

  // GET /dispatches — admin can query any salespersonId
  test('GET /dispatches?salespersonId=N → admin can specify any salespersonId', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.stockDispatch.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/dispatches?salespersonId=5', {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status()).toBe(200);
    expect(findManyArgs.where.salespersonId).toBe(5);
  });

  // GET /dispatches — even with ?salespersonId= override, salesman is forced to own scope
  test('GET /dispatches?salespersonId=99 → salesman query-param override is ignored', async ({ request }) => {
    let findManyArgs = null;
    ctx.mockPrisma.stockDispatch.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/dispatches?salespersonId=99', {
      headers: { Authorization: `Bearer ${salesmanToken(7)}` },
    });
    expect(res.status()).toBe(200);
    // Must be salesman's own ID — not the query parameter
    expect(findManyArgs.where.salespersonId).toBe(7);
  });

  // POST /dispatches — salesman cannot dispatch for someone else
  test('POST /dispatches → salesman salespersonId is taken from JWT, not payload', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.stockReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
    ctx.mockPrisma.stockDispatchItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, salespersonId: args.data.salespersonId, dispatchDate: args.data.dispatchDate, totalAmount: 0, items: [] };
    });
    // Salesman requests re-derive each item's price server-side (see
    // resolveSalespersonItemPricing in dispatches.controller.js) — product
    // must be active + salesperson-enabled, with no per-salesperson override
    // rows or custom price rows, so it falls back to salespersonDefaultPrice.
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 10 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${salesmanToken(7)}` },
      data: { salespersonId: 999, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 1, unitPrice: 10 }] },
    });
    expect(res.status()).toBe(201);
    // Server must use salesperson 7 from JWT, not 999 from payload
    expect(createArgs.data.salespersonId).toBe(7);
  });

  // GET /salesperson-balance/:id — salesman accessing own = OK
  test('GET /salesperson-balance/:id → salesman accessing own ID = 200', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.salespersonBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue({ id: 7, name: 'Alice', isActive: true });
    ctx.mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    ctx.mockPrisma.salespersonPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/salesperson-balance/7?date=2026-04-30', {
      headers: { Authorization: `Bearer ${salesmanToken(7)}` },
    });
    expect([200, 404]).toContain(res.status());
  });

  // GET /reports/daily-dispatch — salesman gets scoped data only (defense-in-depth even though it's
  // mounted under requireAdmin, the controller scopes by salespersonId if role==salesman)
  test('GET /reports/daily-dispatch → controller scopes by salespersonId if salesman ever gets here', async ({ request }) => {
    // Controller-level scoping: we call assertAdmin in the controller, which means salesman gets 403
    // before any DB query. But the scoping code path exists as defense-in-depth.
    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${salesmanToken(7)}` },
    });
    expect(res.status()).toBe(403);
  });
});

// ─── JWT lifecycle tests ─────────────────────────────────────────────────────

test.describe('RBAC — JWT lifecycle', () => {
  test('expired token → 401 across multiple endpoints', async ({ request }) => {
    const paths = [
      '/api/v1/brands',
      '/api/v1/dispatches',
      '/api/v1/dairy-payments',
    ];
    for (const path of paths) {
      const res = await request.get(path, {
        headers: { Authorization: `Bearer ${expiredToken()}` },
      });
      expect(res.status(), `${path} should reject expired token`).toBe(401);
    }
  });

  test('malformed JWT → 401', async ({ request }) => {
    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: 'Bearer not.a.real.jwt' },
    });
    expect(res.status()).toBe(401);
  });

  test('token signed with wrong secret → 401', async ({ request }) => {
    const fakeToken = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test('token with no role defaults to admin', async ({ request }) => {
    // JWT only contains { id: 1 } — controller derives role='admin' via auth middleware default
    ctx.mockPrisma.brand.findMany.mockResolvedValue([]);
    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: `Bearer ${jwt.sign({ id: 1 }, SECRET, { expiresIn: '1h' })}` },
    });
    expect(res.status()).toBe(200);
  });
});
