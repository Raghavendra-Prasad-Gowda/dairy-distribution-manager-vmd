'use strict';

/**
 * Salesperson Self-Service Statement API Tests
 * Covers: GET /api/v1/salesperson-statement/me
 *
 * Self-service statement — an authenticated salesman sees only their own
 * account statement (balance rows + dispatch items + payments). Admin users
 * are blocked entirely; they use /reports/salesperson-statement instead.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const BALANCE_ROW = {
  balanceDate:    new Date('2026-04-30'),
  openingBalance: 100,
  stockGiven:     500,
  amountPaid:     200,
  closingBalance: 400,
};

const DISPATCH = {
  dispatchDate: new Date('2026-04-30'),
  items: [
    {
      quantity: 10, unitPrice: 30, totalAmount: 300,
      product: { name: 'Milk 500ml', brand: { name: 'Nandini' } },
    },
  ],
};

const PAYMENT = {
  paymentDate: new Date('2026-04-30'),
  amount:      200,
  paymentMode: 'Cash',
  reference:   'REF123',
};

test.describe('GET /api/v1/salesperson-statement/me', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when caller is admin, not salesman', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/salespeople only/i);
  });

  test('returns 400 when from query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-statement/me?to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(7)}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when to query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(7)}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balance rows merged with matching dispatch items and payments', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([BALANCE_ROW]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([DISPATCH]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(7)}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    const row = body.data[0];
    expect(row.openingBalance).toBe(100);
    expect(row.closingBalance).toBe(400);
    expect(row.items).toHaveLength(1);
    expect(row.items[0]).toMatchObject({ brandName: 'Nandini', productName: 'Milk 500ml', quantity: 10, unitPrice: 30, totalAmount: 300 });
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0]).toMatchObject({ amount: 200, mode: 'Cash', ref: 'REF123' });
  });

  test('returns empty items/payments for a balance date with no matching dispatch or payment', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([BALANCE_ROW]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]); // no dispatch that day
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([]); // no payment that day

    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(7)}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].items).toEqual([]);
    expect(body.data[0].payments).toEqual([]);
  });

  test('returns 200 with an empty array when there are no balance rows in range', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(7)}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test('scopes all three queries to the salespersonId from the JWT', async ({ request }) => {
    let balanceArgs = null, dispatchArgs = null, paymentArgs = null;
    ctx.mockPrisma.salespersonBalance.findMany.mockImplementation(async (args) => { balanceArgs = args; return []; });
    ctx.mockPrisma.stockDispatch.findMany.mockImplementation(async (args) => { dispatchArgs = args; return []; });
    ctx.mockPrisma.salespersonPayment.findMany.mockImplementation(async (args) => { paymentArgs = args; return []; });

    await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(42)}` },
    });

    expect(balanceArgs.where.salespersonId).toBe(42);
    expect(dispatchArgs.where.salespersonId).toBe(42);
    expect(paymentArgs.where.salespersonId).toBe(42);
  });

  test('merges multiple payments on the same date into one row', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([BALANCE_ROW]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([
      { ...PAYMENT, amount: 100 },
      { ...PAYMENT, amount: 100, paymentMode: 'UPI', reference: 'REF456' },
    ]);

    const res = await request.get('/api/v1/salesperson-statement/me?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(7)}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].payments).toHaveLength(2);
  });
});
