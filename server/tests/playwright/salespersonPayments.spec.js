'use strict';

/**
 * Salesperson Payments API Tests
 * Covers: POST, GET, DELETE /:id /api/v1/salesperson-payments
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeSuperAdminToken } = require('../helpers/test-setup');
const { mockSalespersonCascade } = require('../helpers/mock-cascade');

const { test, ctx, makeAuthToken } = setupSuite();

const PAYMENT = {
  id:            1,
  salespersonId: 1,
  paymentDate:   new Date('2026-04-30'),
  amount:        1500,
  paymentMode:   'cash',
  reference:     null,
  notes:         null,
};

// ─── POST /api/v1/salesperson-payments ───────────────────────────────────────

test.describe('POST /api/v1/salesperson-payments', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments', {
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 1500 },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when payment is created', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.create.mockResolvedValue(PAYMENT);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 1500 },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('amount', 1500);
  });

  test('returns 400 when salespersonId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { paymentDate: '2026-04-30', amount: 1500 },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when amount is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when amount is negative', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: -100 },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when paymentDate format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '30-04-2026', amount: 1500 },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Excess payments create a carried-forward credit ───────────────────────

  test('allows payment when salesperson has no outstanding balance, creating a credit', async ({ request }) => {
    // A salesperson can hand in an advance even when fully settled — it
    // carries forward as a credit that reduces future collections.
    const upsertCalls = [];
    ctx.mockPrisma.salespersonPayment.create.mockResolvedValue({ id: 1, salespersonId: 1, amount: 500, paymentDate: new Date('2026-04-30') });
    mockSalespersonCascade(ctx.mockPrisma, { onPaymentAggregate: async () => ({ _sum: { amount: 500 } }) });
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 500 },
    });

    expect(res.status()).toBe(201);
    expect(upsertCalls[0].create.closingBalance).toBe(-500);
  });

  test('allows payment that exceeds outstanding balance, creating a credit', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.salespersonPayment.create.mockResolvedValue({ id: 1, salespersonId: 1, amount: 500, paymentDate: new Date('2026-04-30') });
    mockSalespersonCascade(ctx.mockPrisma, { onPaymentAggregate: async () => ({ _sum: { amount: 500 } }) });
    // Simulate a prior day's closing balance of ₹200 owed.
    ctx.mockPrisma.salespersonBalance.findFirst.mockImplementation(async ({ where }) =>
      where?.balanceDate ? { closingBalance: 200 } : null
    );
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 500 },
    });

    expect(res.status()).toBe(201);
    // openingBalance 200 + stockGiven 0 - amountPaid 500 = -300 (credit)
    expect(upsertCalls[0].create.closingBalance).toBe(-300);
  });

  test('accepts payment exactly equal to outstanding balance', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.create.mockResolvedValue({ id: 1, salespersonId: 1, amount: 500, paymentDate: new Date('2026-04-30') });
    mockSalespersonCascade(ctx.mockPrisma, { outstanding: 500 });

    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 500 },
    });

    expect(res.status()).toBe(201);
  });
});

// ─── GET /api/v1/salesperson-payments ────────────────────────────────────────

test.describe('GET /api/v1/salesperson-payments', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salesperson-payments');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with payment list', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 filtered by salespersonId', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([PAYMENT]);

    const res = await request.get('/api/v1/salesperson-payments?salespersonId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 with empty list when no payments', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── PUT /api/v1/salesperson-payments/:id ────────────────────────────────────

test.describe('PUT /api/v1/salesperson-payments/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/salesperson-payments/1', {
      data: { amount: 2000, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when payment is updated', async ({ request }) => {
    const updated = { ...PAYMENT, amount: 2000 };
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.salespersonPayment.update.mockResolvedValue(updated);
    mockSalespersonCascade(ctx.mockPrisma); // routes findFirst — outstanding defaults large enough

    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when payment does not exist', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(null);

    const res = await request.put('/api/v1/salesperson-payments/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 when amount is missing', async ({ request }) => {
    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when amount is negative', async ({ request }) => {
    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: -500, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric payment ID', async ({ request }) => {
    const res = await request.put('/api/v1/salesperson-payments/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2000, paymentDate: '2026-04-30' },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Excess payments create a carried-forward credit ───────────────────────

  test('PUT allows bumping amount past remaining outstanding, creating a credit', async ({ request }) => {
    // Existing payment ₹1500; remaining outstanding is ₹500; edit to ₹2500
    // → delta 1000 > 500, but excess payments are allowed and become credit.
    const upsertCalls = [];
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.salespersonPayment.update.mockResolvedValue({ ...PAYMENT, amount: 2500 });
    mockSalespersonCascade(ctx.mockPrisma, { onPaymentAggregate: async () => ({ _sum: { amount: 2500 } }) });
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2500, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    expect(upsertCalls[0].create.closingBalance).toBe(-2500);
  });

  test('PUT allows decreasing the amount even when outstanding is 0', async ({ request }) => {
    // Decrease is always safe — outstanding goes back up. PAYMENT.amount = 1500.
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.salespersonPayment.update.mockResolvedValue({ ...PAYMENT, amount: 500 });
    mockSalespersonCascade(ctx.mockPrisma, { outstanding: 0 });

    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 500, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
  });

  test('PUT allows an increase up to remaining outstanding (boundary)', async ({ request }) => {
    // PAYMENT 1500, outstanding 500, edit to 2000 → delta exactly 500 → allow.
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.salespersonPayment.update.mockResolvedValue({ ...PAYMENT, amount: 2000 });
    mockSalespersonCascade(ctx.mockPrisma, { outstanding: 500 });

    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 400 when paymentDate format is invalid', async ({ request }) => {
    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2000, paymentDate: '30-04-2026' },
    });
    expect(res.status()).toBe(400);
  });

  test('triggers balance recalculation for both old and new date when date changes', async ({ request }) => {
    // Payment originally on 2026-04-29, being moved to 2026-04-30
    const existingOnOldDate = { ...PAYMENT, paymentDate: new Date('2026-04-29') };
    const updated = { ...PAYMENT, amount: 2000, paymentDate: new Date('2026-04-30') };

    const recalcDates = [];
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(existingOnOldDate);
    ctx.mockPrisma.salespersonPayment.update = async () => updated;

    mockSalespersonCascade(ctx.mockPrisma, {
      onPaymentAggregate: async ({ where }) => {
        recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
        return { _sum: { amount: null } };
      },
    });

    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    // Both old date (2026-04-29) and new date (2026-04-30) should be recalculated
    expect(recalcDates).toContain('2026-04-29');
    expect(recalcDates).toContain('2026-04-30');
  });
});

// ─── DELETE /api/v1/salesperson-payments/:id ─────────────────────────────────

test.describe('DELETE /api/v1/salesperson-payments/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/salesperson-payments/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when payment is deleted', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.salespersonPayment.delete.mockResolvedValue(PAYMENT);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.delete('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe('Payment deleted');
  });

  test('returns 404 when payment does not exist', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/salesperson-payments/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric payment ID', async ({ request }) => {
    const res = await request.delete('/api/v1/salesperson-payments/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});


// ─── POST /api/v1/salesperson-payments/bulk-topup ────────────────────────────

test.describe('POST /api/v1/salesperson-payments/bulk-topup', () => {
  /**
   * Wires the mocks a successful bulk top-up needs and returns the arrays that
   * capture what the controller wrote (mockFn has no built-in call recording).
   */
  function mockTopUpDeps(ids = [1, 2], username = 'admin') {
    const createCalls = [];
    const upsertCalls = [];
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue(ids.map(id => ({ id })));
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username });
    ctx.mockPrisma.salespersonPayment.create.mockImplementation(async (args) => {
      createCalls.push(args);
      return { id: 90 + createCalls.length, ...args.data };
    });
    mockSalespersonCascade(ctx.mockPrisma);
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });
    return { createCalls, upsertCalls };
  }

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a salesman', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a plain admin — superadmin only', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 and creates one top-up row per entry', async ({ request }) => {
    const { createCalls } = mockTopUpDeps();

    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ salespersonId: 1, amount: 500 }, { salespersonId: 2, amount: 750 }],
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

    await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 500 }] },
    });

    expect(createCalls[0].data).toMatchObject({
      isTopUp:     true,
      paymentMode: 'Top-up',
      createdBy:   'raghav',
      amount:      500,
    });
  });

  test('stores a positive amount — top-ups are added, not subtracted', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1]);

    await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 500 }] },
    });

    expect(createCalls[0].data.amount).toBeGreaterThan(0);
  });

  test('cascades the balance for every salesperson touched', async ({ request }) => {
    const { upsertCalls } = mockTopUpDeps([1, 2]);

    await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ salespersonId: 1, amount: 500 }, { salespersonId: 2, amount: 750 }],
      },
    });

    const cascaded = upsertCalls.map(c => c.create.salespersonId);
    expect(cascaded).toContain(1);
    expect(cascaded).toContain(2);
  });

  test('a top-up increases what the salesman owes', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.salespersonPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockSalespersonCascade(ctx.mockPrisma, {
      onTopUpAggregate: async () => ({ _sum: { amount: 50000 } }),
    });
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 50000 }] },
    });

    expect(res.status()).toBe(201);
    // opening 0 + stock 0 + topUp 50000 - paid 0 = 50000 owed
    expect(upsertCalls[0].create.topUpAmount).toBe(50000);
    expect(upsertCalls[0].create.closingBalance).toBe(50000);
  });

  test('returns 404 when a salesperson in the batch does not exist', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1]); // 2 is missing
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }]);

    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ salespersonId: 1, amount: 500 }, { salespersonId: 2, amount: 750 }],
      },
    });

    expect(res.status()).toBe(404);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 400 when the same salesperson appears twice', async ({ request }) => {
    const { createCalls } = mockTopUpDeps([1]);

    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        paymentDate: '2026-04-30',
        entries: [{ salespersonId: 1, amount: 500 }, { salespersonId: 1, amount: 750 }],
      },
    });

    expect(res.status()).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 400 when entries is empty', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when an amount is zero or negative', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: -500 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when paymentDate format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '30-04-2026', entries: [{ salespersonId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Balance formula: closing = opening + stockGiven + topUp − amountPaid ────

test.describe('Salesperson balance formula — top-ups vs payments', () => {
  /** Drives a bulk top-up and returns what the cascade wrote. */
  async function runTopUp(request, cascadeOpts, amount = 50000) {
    const upsertCalls = [];
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.salespersonPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockSalespersonCascade(ctx.mockPrisma, cascadeOpts);
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    const res = await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount }] },
    });
    return { res, upsertCalls };
  }

  test('a top-up is ADDED to the balance, a payment is subtracted', async ({ request }) => {
    const { res, upsertCalls } = await runTopUp(request, {
      onTopUpAggregate:  async () => ({ _sum: { amount: 50000 } }),
      onPaymentAggregate: async () => ({ _sum: { amount: 9000 } }),
    });

    expect(res.status()).toBe(201);
    // opening 0 + stock 0 + topUp 50000 − paid 9000 = 41000
    expect(upsertCalls[0].create).toMatchObject({
      topUpAmount:    50000,
      amountPaid:     9000,
      closingBalance: 41000,
    });
  });

  test('a top-up stacks on top of an existing opening balance', async ({ request }) => {
    const upsertCalls = [];
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.salespersonPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockSalespersonCascade(ctx.mockPrisma, {
      onTopUpAggregate: async () => ({ _sum: { amount: 10000 } }),
    });
    // Prior day closed at ₹2,000 owed — the cascade's "previous balance" lookup
    // is the one carrying a balanceDate filter.
    ctx.mockPrisma.salespersonBalance.findFirst.mockImplementation(async ({ where }) =>
      where?.balanceDate ? { closingBalance: 2000 } : null
    );
    ctx.mockPrisma.salespersonBalance.upsert.mockImplementation(async (args) => {
      upsertCalls.push(args);
      return {};
    });

    await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 10000 }] },
    });

    // opening 2000 + stock 0 + topUp 10000 − paid 0 = 12000
    expect(upsertCalls[0].create.openingBalance).toBe(2000);
    expect(upsertCalls[0].create.closingBalance).toBe(12000);
  });

  test('payments and top-ups are aggregated separately, not lumped together', async ({ request }) => {
    const seen = [];
    ctx.mockPrisma.salesperson.findMany.mockResolvedValue([{ id: 1 }]);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.salespersonPayment.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    mockSalespersonCascade(ctx.mockPrisma);
    ctx.mockPrisma.salespersonPayment.aggregate.mockImplementation(async (args) => {
      seen.push(args.where.isTopUp);
      return { _sum: { amount: null } };
    });

    await request.post('/api/v1/salesperson-payments/bulk-topup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { paymentDate: '2026-04-30', entries: [{ salespersonId: 1, amount: 500 }] },
    });

    // One aggregate filtered to real payments, one to top-ups — never a single
    // unfiltered sum, which would let a top-up cancel a payment out.
    expect(seen).toContain(false);
    expect(seen).toContain(true);
  });

  test('a back-dated top-up cascades forward to later dates', async ({ request }) => {
    const { upsertCalls } = await runTopUp(request, {
      subsequentDates:  ['2026-05-01', '2026-05-02'],
      onTopUpAggregate: async () => ({ _sum: { amount: 50000 } }),
    });

    // The dated row plus every later balance row gets recomputed.
    expect(upsertCalls).toHaveLength(3);
    expect(upsertCalls.every(c => c.create.salespersonId === 1)).toBe(true);
  });

  test('topUpAmount is persisted on the balance row', async ({ request }) => {
    const { upsertCalls } = await runTopUp(request, {
      onTopUpAggregate: async () => ({ _sum: { amount: 1234 } }),
    });

    expect(upsertCalls[0].create.topUpAmount).toBe(1234);
    expect(upsertCalls[0].update.topUpAmount).toBe(1234);
  });

  test('topUpAmount is 0 when the salesperson has no top-ups that date', async ({ request }) => {
    const { upsertCalls } = await runTopUp(request, {});
    expect(upsertCalls[0].create.topUpAmount).toBe(0);
  });
});
