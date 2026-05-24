'use strict';

/**
 * Salesperson Payments API Tests
 * Covers: POST, GET, DELETE /:id /api/v1/salesperson-payments
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
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

  // ─── Over-payment guard (the reported bug) ──────────────────────────────────

  test('rejects payment when salesperson has no outstanding balance', async ({ request }) => {
    // No balance row exists OR closingBalance is 0 → guard treats as settled.
    // This is the bug the user reported: collecting from a settled salesperson.
    mockSalespersonCascade(ctx.mockPrisma, { outstanding: 0 });

    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 500 },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No outstanding balance/i);
  });

  test('rejects payment that exceeds outstanding balance', async ({ request }) => {
    mockSalespersonCascade(ctx.mockPrisma, { outstanding: 200 });

    const res = await request.post('/api/v1/salesperson-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, paymentDate: '2026-04-30', amount: 500 },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds outstanding balance of ₹200/i);
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

  // ─── Update-side over-payment guard ────────────────────────────────────────

  test('PUT rejects when bumping amount past remaining outstanding (delta > outstanding)', async ({ request }) => {
    // Existing payment ₹1500; remaining outstanding is ₹500;
    // edit to ₹2500 → delta 1000 > 500 → reject.
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    mockSalespersonCascade(ctx.mockPrisma, { outstanding: 500 });

    const res = await request.put('/api/v1/salesperson-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 2500, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Increase of ₹1000 would exceed remaining outstanding balance of ₹500/i);
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
