'use strict';

/**
 * Admin statement top-up reconciliation tests.
 *
 * Both ledgers add top-ups to the closing balance:
 *   salesperson: closing = opening + stockGiven  + topUpAmount − amountPaid
 *   dairy:       closing = opening + stockValue  + depositValue + topUpAmount − amountPaid
 *
 * The admin-facing statements used to return neither `topUpAmount` nor a
 * separated `topUps` list, so a statement showing "given 720000, collected
 * 520000, outstanding 201500" had no way to explain the 1500 — and the
 * top-up was listed among the collections, so the payments shown didn't sum
 * to amountPaid either. These tests pin both halves of that contract.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const DATE = new Date('2026-04-30');

// ─── /reports/salesperson-statement ──────────────────────────────────────────

test.describe('GET /api/v1/reports/salesperson-statement — top-ups', () => {
  const BALANCE = {
    balanceDate:    DATE,
    openingBalance: 0,
    stockGiven:     720000,
    topUpAmount:    1500,
    amountPaid:     520000,
    closingBalance: 201500,
  };
  const COLLECTION = {
    paymentDate: DATE, amount: 520000, paymentMode: 'Cash',
    reference: 'REF1', notes: null, isTopUp: false, createdBy: 'raghav',
  };
  const TOP_UP = {
    paymentDate: DATE, amount: 1500, paymentMode: null,
    reference: null, notes: 'old dues', isTopUp: true, createdBy: 'raghav',
  };

  test.beforeEach(() => {
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([BALANCE]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([COLLECTION, TOP_UP]);
  });

  const url = '/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30';

  test('returns 403 when no token is provided', async ({ request }) => {
    expect((await request.get(url)).status()).toBe(403);
  });

  test('returns 403 for a salesman token — admin report', async ({ request }) => {
    const res = await request.get(url, {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when salespersonId is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when salespersonId is non-numeric', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=abc&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns topUpAmount so the row reconciles to closingBalance', async ({ request }) => {
    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];

    expect(row.topUpAmount).toBe(1500);
    expect(row.openingBalance + row.stockGiven + row.topUpAmount - row.amountPaid)
      .toBe(row.closingBalance);
  });

  test('keeps the top-up out of payments so collections sum to amountPaid', async ({ request }) => {
    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    const row = (await res.json()).data[0];

    expect(row.payments).toHaveLength(1);
    expect(row.payments[0].amount).toBe(520000);
    expect(row.payments.reduce((s, p) => s + p.amount, 0)).toBe(row.amountPaid);
  });

  test('reports the top-up separately, with who recorded it and why', async ({ request }) => {
    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    const row = (await res.json()).data[0];

    expect(row.topUps).toHaveLength(1);
    expect(row.topUps[0]).toMatchObject({ amount: 1500, notes: 'old dues', createdBy: 'raghav' });
  });

  test('returns an empty topUps list and zero topUpAmount when there are none', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([
      { ...BALANCE, topUpAmount: 0, closingBalance: 200000 },
    ]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([COLLECTION]);

    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    const row = (await res.json()).data[0];

    expect(row.topUpAmount).toBe(0);
    expect(row.topUps).toEqual([]);
    expect(row.payments).toHaveLength(1);
  });

  test('defaults topUpAmount to 0 for a legacy row that predates the column', async ({ request }) => {
    const { topUpAmount, ...legacy } = BALANCE;
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([legacy]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([COLLECTION]);

    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    expect((await res.json()).data[0].topUpAmount).toBe(0);
  });
});

// ─── /reports/dairy-statement ────────────────────────────────────────────────

test.describe('GET /api/v1/reports/dairy-statement — top-ups', () => {
  const BALANCE = {
    balanceDate:    DATE,
    openingBalance: 0,
    stockValue:     700000,
    depositValue:   0,
    topUpAmount:    3000,
    amountPaid:     500000,
    closingBalance: 203000,
    brand: { name: 'Nandini' },
  };
  const PAYMENT = {
    paymentDate: DATE, amount: 500000, paymentMode: 'Bank',
    reference: 'NEFT1', notes: null, isTopUp: false, createdBy: 'raghav',
  };
  const TOP_UP = {
    paymentDate: DATE, amount: 3000, paymentMode: null,
    reference: null, notes: 'carried forward', isTopUp: true, createdBy: 'raghav',
  };

  test.beforeEach(() => {
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([BALANCE]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([PAYMENT, TOP_UP]);
  });

  const url = '/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30';

  test('returns 403 when no token is provided', async ({ request }) => {
    expect((await request.get(url)).status()).toBe(403);
  });

  test('returns 403 for a salesman token — admin report', async ({ request }) => {
    const res = await request.get(url, {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns topUpAmount so the row reconciles to closingBalance', async ({ request }) => {
    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];

    expect(row.topUpAmount).toBe(3000);
    expect(
      row.openingBalance + row.stockValue + row.depositValue + row.topUpAmount - row.amountPaid
    ).toBe(row.closingBalance);
  });

  test('keeps the top-up out of payments so payments sum to amountPaid', async ({ request }) => {
    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    const row = (await res.json()).data[0];

    expect(row.payments).toHaveLength(1);
    expect(row.payments.reduce((s, p) => s + p.amount, 0)).toBe(row.amountPaid);
    expect(row.topUps).toHaveLength(1);
    expect(row.topUps[0]).toMatchObject({ amount: 3000, notes: 'carried forward', createdBy: 'raghav' });
  });

  test('defaults topUpAmount to 0 for a legacy row that predates the column', async ({ request }) => {
    const { topUpAmount, ...legacy } = BALANCE;
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([legacy]);
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get(url, { headers: { Authorization: `Bearer ${makeAuthToken()}` } });
    const row = (await res.json()).data[0];
    expect(row.topUpAmount).toBe(0);
    expect(row.topUps).toEqual([]);
  });
});
