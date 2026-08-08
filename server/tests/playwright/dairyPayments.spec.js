'use strict';

/**
 * Dairy Payments API Tests
 * Covers: POST, GET, PUT, DELETE /api/v1/dairy-payments
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSuperAdminToken, makeSalesmanToken } = require('../helpers/test-setup');
const { mockDairyCascade } = require('../helpers/mock-cascade');

const { test, ctx, makeAuthToken } = setupSuite();

const PAYMENT = {
  id:          1,
  brandId:     1,
  paymentDate: new Date('2026-04-30'),
  amount:      5000,
  paymentMode: 'cash',
  reference:   null,
  notes:       null,
};

// ─── POST /api/v1/dairy-payments ──────────────────────────────────────────────

test.describe('POST /api/v1/dairy-payments', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments', {
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when payment is created', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.create.mockResolvedValue(PAYMENT);
    mockDairyCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { paymentDate: '2026-04-30', amount: 5000 },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when amount is missing', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when amount is negative', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: -100 },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Excess payments create a carried-forward credit ───────────────────────

  test('allows payment when brand has no outstanding balance, creating a credit', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.dairyPayment.create.mockResolvedValue(PAYMENT);
    mockDairyCascade(ctx.mockPrisma, { onPaymentAggregate: async () => ({ _sum: { amount: 5000 } }) });
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });

    expect(res.status()).toBe(201);
    expect(upsertCalls[0].create.closingBalance).toBe(-5000);
  });

  test('allows payment that exceeds outstanding balance, creating a credit', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.dairyPayment.create.mockResolvedValue(PAYMENT);
    mockDairyCascade(ctx.mockPrisma, { onPaymentAggregate: async () => ({ _sum: { amount: 5000 } }) });
    // Simulate a prior day's closing balance of ₹1000 owed.
    ctx.mockPrisma.dairyBalance.findFirst.mockImplementation(async ({ where }) =>
      where?.balanceDate ? { closingBalance: 1000 } : null
    );
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });

    expect(res.status()).toBe(201);
    // openingBalance 1000 + stockValue 0 - amountPaid 5000 = -4000 (credit)
    expect(upsertCalls[0].create.closingBalance).toBe(-4000);
  });
});

  test('triggers balance recalculation on create (cascade runs)', async ({ request }) => {
    // Verify that after creating a payment, _calcDairyBalance runs for that date
    // and cascades forward to any subsequent stored balance records.
    const recalcDates = [];
    ctx.mockPrisma.dairyPayment.create.mockResolvedValue(PAYMENT);

    mockDairyCascade(ctx.mockPrisma, {
      subsequentDates: ['2026-05-01', '2026-05-02'],
      onPaymentAggregate: async ({ where }) => {
        recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
        return { _sum: { amount: 5000 } };
      },
    });

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });

    expect(res.status()).toBe(201);
    // Payment date + both subsequent dates should all be recalculated
    expect(recalcDates).toContain('2026-04-30');
    expect(recalcDates).toContain('2026-05-01');
    expect(recalcDates).toContain('2026-05-02');
  });

// ─── GET /api/v1/dairy-payments ───────────────────────────────────────────────

test.describe('GET /api/v1/dairy-payments', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-payments');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with payment list', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 with empty list when no payments', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  test('returns 200 filtered by brandId', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get('/api/v1/dairy-payments?brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('brandId', 1);
  });

  test('returns 400 when brandId filter is non-numeric', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-payments?brandId=abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 filtered by date range', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get('/api/v1/dairy-payments?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── PUT /api/v1/dairy-payments/:id ──────────────────────────────────────────

test.describe('PUT /api/v1/dairy-payments/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/dairy-payments/1', {
      data: { amount: 6000, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when payment is updated', async ({ request }) => {
    const updated = { ...PAYMENT, amount: 6000 };
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.update.mockResolvedValue(updated);
    mockDairyCascade(ctx.mockPrisma);

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 6000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when payment does not exist', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(null);

    const res = await request.put('/api/v1/dairy-payments/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 6000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 when amount is missing', async ({ request }) => {
    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when amount is negative', async ({ request }) => {
    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: -500, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric payment ID', async ({ request }) => {
    const res = await request.put('/api/v1/dairy-payments/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 6000, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Excess payments create a carried-forward credit ───────────────────────

  test('PUT allows bumping amount past remaining outstanding, creating a credit', async ({ request }) => {
    // PAYMENT.amount = 5000, remaining outstanding ₹1000, edit to ₹7000
    // → delta 2000 > 1000, but excess payments are allowed and become credit.
    const upsertCalls = [];
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.update.mockResolvedValue({ ...PAYMENT, amount: 7000 });
    mockDairyCascade(ctx.mockPrisma, { onPaymentAggregate: async () => ({ _sum: { amount: 7000 } }) });
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 7000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    expect(upsertCalls[0].create.closingBalance).toBe(-7000);
  });

  test('PUT allows decreasing the amount even when outstanding is 0', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.update.mockResolvedValue({ ...PAYMENT, amount: 1000 });
    mockDairyCascade(ctx.mockPrisma, { outstanding: 0 });

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 1000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
  });

  test('PUT allows an increase up to remaining outstanding (boundary)', async ({ request }) => {
    // PAYMENT 5000, outstanding 500, edit to 5500 → delta exactly 500 → allow.
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.update.mockResolvedValue({ ...PAYMENT, amount: 5500 });
    mockDairyCascade(ctx.mockPrisma, { outstanding: 500 });

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 5500, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
  });

  test('triggers recalculation for both old and new date when date changes', async ({ request }) => {
    // Payment originally on 2026-04-29, being moved to 2026-04-30
    const existingOnOldDate = { ...PAYMENT, paymentDate: new Date('2026-04-29'), brandId: 1 };
    const updated = { ...PAYMENT, amount: 6000, paymentDate: new Date('2026-04-30') };

    const recalcDates = [];
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(existingOnOldDate);
    ctx.mockPrisma.dairyPayment.update.mockResolvedValue(updated);

    mockDairyCascade(ctx.mockPrisma, {
      onPaymentAggregate: async ({ where }) => {
        recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
        return { _sum: { amount: null } };
      },
    });

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 6000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    // Both old date and new date must be recalculated when date changes
    expect(recalcDates).toContain('2026-04-29');
    expect(recalcDates).toContain('2026-04-30');
  });

  test('triggers recalculation once when date does not change', async ({ request }) => {
    const recalcDates = [];
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.update.mockResolvedValue({ ...PAYMENT, amount: 6000 });

    mockDairyCascade(ctx.mockPrisma, {
      onPaymentAggregate: async ({ where }) => {
        recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
        return { _sum: { amount: null } };
      },
    });

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 6000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    // Same date — recalculated exactly once
    expect(recalcDates.filter(d => d === '2026-04-30')).toHaveLength(1);
  });
});

// ─── DELETE /api/v1/dairy-payments/:id ───────────────────────────────────────

test.describe('DELETE /api/v1/dairy-payments/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/dairy-payments/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when payment is deleted', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.delete.mockResolvedValue(PAYMENT);
    mockDairyCascade(ctx.mockPrisma);

    const res = await request.delete('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when payment does not exist', async ({ request }) => {
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/dairy-payments/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric payment ID', async ({ request }) => {
    const res = await request.delete('/api/v1/dairy-payments/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('triggers balance cascade for subsequent dates after delete', async ({ request }) => {
    // Deleting a payment should recalculate the balance on that date AND cascade forward
    const recalcDates = [];

    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.dairyPayment.delete.mockResolvedValue(PAYMENT);

    mockDairyCascade(ctx.mockPrisma, {
      subsequentDates: ['2026-05-01', '2026-05-02'],
      onPaymentAggregate: async ({ where }) => {
        recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
        return { _sum: { amount: null } };
      },
    });

    const res = await request.delete('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    // Deleted date + both subsequent cascade dates
    expect(recalcDates).toContain('2026-04-30');
    expect(recalcDates).toContain('2026-05-01');
    expect(recalcDates).toContain('2026-05-02');
  });
});

// ─── POST /api/v1/dairy-payments/bulk-topup ──────────────────────────────────

test.describe('POST /api/v1/dairy-payments/bulk-topup', () => {
  /**
   * Wires the mocks a successful bulk top-up needs and returns the arrays that
   * capture what the controller wrote (mockFn has no built-in call recording).
   */
  function mockTopUpDeps(ids = [1, 2], username = 'admin') {
    const createCalls = [];
    const upsertCalls = [];
    ctx.mockPrisma.brand.findMany.mockResolvedValue(ids.map(id => ({ id })));
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username });
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async (args) => {
      createCalls.push(args);
      return { id: 90 + createCalls.length, ...args.data };
    });
    mockDairyCascade(ctx.mockPrisma);
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });
    return { createCalls, upsertCalls };
  }

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a salesman', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a plain admin — superadmin only', async ({ request }) => {
    const { createCalls } = mockTopUpDeps();

    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(res.status()).toBe(403);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 201 and creates one top-up row per brand', async ({ request }) => {
    const { createCalls } = mockTopUpDeps();

    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 500 }, { brandId: 2, amount: 750 }],
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.count).toBe(2);
    expect(body.data.total).toBe(1250);
    expect(createCalls).toHaveLength(2);
  });

  test('marks rows isTopUp with mode Top-up and stamps the admin username', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1], 'raghav');

    await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(createCalls[0].data).toMatchObject({
      isTopUp:     true,
      paymentMode: 'Top-up',
      createdBy:   'raghav',
      amount:      500,
      brandId:     1,
    });
  });

  test('stores a positive amount — top-ups are added, not subtracted', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1]);

    await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(createCalls[0].data.amount).toBeGreaterThan(0);
  });

  test('cascades the balance for every brand touched', async ({ request }) => {
    const { upsertCalls } = mockTopUpDeps([1, 2]);

    await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 500 }, { brandId: 2, amount: 750 }],
      },
    });

    const cascaded = upsertCalls.map(c => c.create.brandId);
    expect(cascaded).toContain(1);
    expect(cascaded).toContain(2);
  });

  test('returns 404 when a brand in the batch does not exist', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1]); // brand 2 missing

    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 500 }, { brandId: 2, amount: 750 }],
      },
    });

    expect(res.status()).toBe(404);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 400 when the same brand appears twice', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1]);

    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 500 }, { brandId: 1, amount: 750 }],
      },
    });

    expect(res.status()).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 400 when entries is empty', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when an amount is zero or negative', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: -500 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when paymentDate format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '30-04-2026', entries: [{ brandId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Dairy balance formula: + topUpAmount ────────────────────────────────────

test.describe('Dairy balance formula — top-ups vs payments', () => {
  async function runTopUp(request, cascadeOpts, amount = 50000) {
    const upsertCalls = [];
    ctx.mockPrisma.brand.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockDairyCascade(ctx.mockPrisma, cascadeOpts);
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount }] },
    });
    return { res, upsertCalls };
  }

  test('a top-up is ADDED to what the dairy owes, a payment is subtracted', async ({ request }) => {
    const { res, upsertCalls } = await runTopUp(request, {
      onTopUpAggregate:   async () => ({ _sum: { amount: 50000 } }),
      onPaymentAggregate: async () => ({ _sum: { amount: 9000 } }),
    });

    expect(res.status()).toBe(201);
    // opening 0 + stock 0 + deposit 0 + topUp 50000 − paid 9000 = 41000
    expect(upsertCalls[0].create).toMatchObject({
      topUpAmount:    50000,
      amountPaid:     9000,
      closingBalance: 41000,
    });
  });

  test('payments and top-ups are aggregated separately, not lumped together', async ({ request }) => {
    const seen = [];
    ctx.mockPrisma.brand.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockDairyCascade(ctx.mockPrisma);
    ctx.mockPrisma.dairyPayment.aggregate.mockImplementation(async (args) => {
      seen.push(args.where.isTopUp);
      return { _sum: { amount: null } };
    });

    await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(seen).toContain(false);
    expect(seen).toContain(true);
  });

  test('a back-dated top-up cascades forward to later dates', async ({ request }) => {
    const { upsertCalls } = await runTopUp(request, {
      subsequentDates:  ['2026-05-01', '2026-05-02'],
      onTopUpAggregate: async () => ({ _sum: { amount: 50000 } }),
    });

    expect(upsertCalls).toHaveLength(3);
    expect(upsertCalls.every(c => c.create.brandId === 1)).toBe(true);
  });

  test('topUpAmount is 0 when the brand has no top-ups that date', async ({ request }) => {
    const { upsertCalls } = await runTopUp(request, {});
    expect(upsertCalls[0].create.topUpAmount).toBe(0);
  });
});

// ─── Deposit top-up — same mechanism, distinct label ─────────────────────────

test.describe('POST /api/v1/dairy-payments/bulk-topup — paymentMode', () => {
  function mockDeps(ids = [1]) {
    const createCalls = [];
    ctx.mockPrisma.brand.findMany.mockResolvedValue(ids.map(id => ({ id })));
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async (args) => {
      createCalls.push(args);
      return { id: 1, ...args.data };
    });
    mockDairyCascade(ctx.mockPrisma);
    return createCalls;
  }

  test('defaults to "Top-up" when paymentMode is omitted', async ({ request }) => {
    const createCalls = mockDeps();

    await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(createCalls[0].data.paymentMode).toBe('Top-up');
  });

  test('accepts "Deposit Top-up" and still sets isTopUp true', async ({ request }) => {
    const createCalls = mockDeps();

    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        paymentMode: 'Deposit Top-up',
        entries: [{ brandId: 1, amount: 20000 }],
      },
    });

    expect(res.status()).toBe(201);
    expect(createCalls[0].data).toMatchObject({ paymentMode: 'Deposit Top-up', isTopUp: true });
  });

  test('rejects an unrecognized paymentMode', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        paymentMode: 'Cash',
        entries: [{ brandId: 1, amount: 500 }],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('a deposit top-up adds to the balance exactly like a dues top-up', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.brand.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockDairyCascade(ctx.mockPrisma, {
      onTopUpAggregate: async () => ({ _sum: { amount: 20000 } }),
    });
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    await request.post('/api/v1/dairy-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        paymentMode: 'Deposit Top-up',
        entries: [{ brandId: 1, amount: 20000 }],
      },
    });

    // Same accumulation as a plain top-up — only the label differs.
    expect(upsertCalls[0].create.topUpAmount).toBe(20000);
    expect(upsertCalls[0].create.closingBalance).toBe(20000);
  });
});
