'use strict';

/**
 * Salesperson Ledger Reset API Tests
 * Covers: POST /api/v1/salespeople/:id/reset-ledger
 *
 * Superadmin-only, irreversible wipe of one salesperson's financial ledger
 * (payments incl. top-ups, dispatches, balance rows) so their balance resets
 * to ₹0. Their account, custom prices and product access are left alone.
 *
 * Lives in its own spec file rather than salespeople.spec.js: every request to
 * /api/v1/salespeople passes through bulkWriteLimiter (30/min), and each spec
 * file gets a fresh server — so splitting keeps both files inside the budget.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSuperAdminToken, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SP = { id: 1, name: 'K Pandu' };

test.describe('POST /api/v1/salespeople/:id/reset-ledger', () => {
  /** Wires the deleteMany mocks and captures which tables were cleared. */
  function mockResetDeps(name = SP.name) {
    const deleted = {};
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue({ id: 1, name });
    ctx.mockPrisma.salespersonPayment.deleteMany.mockImplementation(async (args) => {
      deleted.payments = args; return { count: 3 };
    });
    ctx.mockPrisma.stockDispatch.deleteMany.mockImplementation(async (args) => {
      deleted.dispatches = args; return { count: 5 };
    });
    ctx.mockPrisma.salespersonBalance.deleteMany.mockImplementation(async (args) => {
      deleted.balances = args; return { count: 7 };
    });
    return deleted;
  }

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/reset-ledger', {
      data: { confirmName: SP.name },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a salesman', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { confirmName: SP.name },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a plain admin — superadmin only', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/1/reset-ledger', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { confirmName: SP.name },
    });

    expect(res.status()).toBe(403);
    expect(deleted.payments).toBeUndefined();
  });

  test('clears payments, dispatches and balances for that salesperson only', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/1/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { confirmName: SP.name },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ payments: 3, dispatches: 5, balances: 7 });
    // Every delete must be scoped to this salesperson — never a global wipe.
    expect(deleted.payments.where).toEqual({ salespersonId: 1 });
    expect(deleted.dispatches.where).toEqual({ salespersonId: 1 });
    expect(deleted.balances.where).toEqual({ salespersonId: 1 });
  });

  test('leaves custom prices and product access untouched', async ({ request }) => {
    mockResetDeps();
    let pricesCleared = false;
    let productsCleared = false;
    ctx.mockPrisma.salespersonPrice.deleteMany.mockImplementation(async () => {
      pricesCleared = true; return { count: 0 };
    });
    ctx.mockPrisma.salespersonProduct.deleteMany.mockImplementation(async () => {
      productsCleared = true; return { count: 0 };
    });

    await request.post('/api/v1/salespeople/1/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { confirmName: SP.name },
    });

    expect(pricesCleared).toBe(false);
    expect(productsCleared).toBe(false);
  });

  test('returns 400 when confirmName does not match', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/1/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { confirmName: 'Wrong Name' },
    });

    expect(res.status()).toBe(400);
    expect(deleted.payments).toBeUndefined();
  });

  test('returns 400 when confirmName is missing', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/1/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {},
    });

    expect(res.status()).toBe(400);
    expect(deleted.payments).toBeUndefined();
  });

  test('returns 404 when the salesperson does not exist', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);

    const res = await request.post('/api/v1/salespeople/999/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { confirmName: SP.name },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for a non-numeric salesperson ID', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/abc/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { confirmName: SP.name },
    });
    expect(res.status()).toBe(400);
  });
});
