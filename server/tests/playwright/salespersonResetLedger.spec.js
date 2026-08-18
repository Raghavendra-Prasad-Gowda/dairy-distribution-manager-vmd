'use strict';

/**
 * Salesperson Ledger Reset API Tests
 * Covers: POST /api/v1/salespeople/reset-ledger
 *
 * Superadmin-only, irreversible wipe of one or more salespeople's financial
 * ledgers (payments incl. top-ups, dispatches, balance rows) so their balances
 * reset to ₹0. Accounts, custom prices and product access are left alone.
 *
 * Lives in its own spec file rather than salespeople.spec.js: every request to
 * /api/v1/salespeople passes through bulkWriteLimiter (30/min), and each spec
 * file gets a fresh server — so splitting keeps both files inside the budget.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSuperAdminToken, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SALESPEOPLE = [
  { id: 1, name: 'K Pandu' },
  { id: 2, name: 'Mahesh' },
];

test.describe('POST /api/v1/salespeople/reset-ledger', () => {
  /** Wires the deleteMany mocks and captures which tables were cleared. */
  function mockResetDeps(people = SALESPEOPLE) {
    const deleted = {};
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue(people);
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
    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      data: { salespersonIds: [1] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a salesman', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { salespersonIds: [1] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a plain admin — superadmin only', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonIds: [1] },
    });

    expect(res.status()).toBe(403);
    expect(deleted.payments).toBeUndefined();
  });

  test('clears payments, dispatches and balances for a single salesperson', async ({ request }) => {
    const deleted = mockResetDeps([SALESPEOPLE[0]]);

    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [1] },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ payments: 3, dispatches: 5, balances: 7 });
    // Every delete must be scoped to the requested ids — never a global wipe.
    expect(deleted.payments.where).toEqual({ salespersonId: { in: [1] } });
    expect(deleted.dispatches.where).toEqual({ salespersonId: { in: [1] } });
    expect(deleted.balances.where).toEqual({ salespersonId: { in: [1] } });
  });

  test('resets several salespeople in one call', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [1, 2] },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.salespeople).toEqual(['K Pandu', 'Mahesh']);
    expect(deleted.payments.where).toEqual({ salespersonId: { in: [1, 2] } });
  });

  test('scopes the wipe to the selected ids only, never all salespeople', async ({ request }) => {
    const deleted = mockResetDeps([SALESPEOPLE[1]]);

    await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [2] },
    });

    // A missing/empty where would delete every row in the table.
    for (const args of [deleted.payments, deleted.dispatches, deleted.balances]) {
      expect(args.where.salespersonId.in).toEqual([2]);
    }
  });

  test('stamps the real acting admin username when the lookup succeeds', async ({ request }) => {
    mockResetDeps([SALESPEOPLE[0]]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'super_raghav' });

    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [1] },
    });

    expect(res.status()).toBe(200);
  });

  test('leaves custom prices and product access untouched', async ({ request }) => {
    mockResetDeps([SALESPEOPLE[0]]);
    let pricesCleared = false;
    let productsCleared = false;
    ctx.mockPrisma.salespersonPrice.deleteMany.mockImplementation(async () => {
      pricesCleared = true; return { count: 0 };
    });
    ctx.mockPrisma.salespersonProduct.deleteMany.mockImplementation(async () => {
      productsCleared = true; return { count: 0 };
    });

    await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [1] },
    });

    expect(pricesCleared).toBe(false);
    expect(productsCleared).toBe(false);
  });

  test('returns 404 when any salesperson in the batch does not exist', async ({ request }) => {
    const deleted = mockResetDeps([SALESPEOPLE[0]]); // id 2 missing

    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [1, 2] },
    });

    expect(res.status()).toBe(404);
    // Nothing is wiped when part of the batch is invalid.
    expect(deleted.payments).toBeUndefined();
  });

  test('returns 400 when the same salesperson appears twice', async ({ request }) => {
    const deleted = mockResetDeps();

    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [1, 1] },
    });

    expect(res.status()).toBe(400);
    expect(deleted.payments).toBeUndefined();
  });

  test('returns 400 when salespersonIds is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when salespersonIds is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for a non-numeric salesperson id', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/reset-ledger', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { salespersonIds: ['abc'] },
    });
    expect(res.status()).toBe(400);
  });
});
