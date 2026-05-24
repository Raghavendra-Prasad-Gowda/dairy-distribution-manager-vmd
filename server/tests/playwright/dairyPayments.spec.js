'use strict';

/**
 * Dairy Payments API Tests
 * Covers: POST, GET, PUT, DELETE /api/v1/dairy-payments
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
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

  // ─── Over-payment guard ─────────────────────────────────────────────────────

  test('rejects payment when brand has no outstanding balance', async ({ request }) => {
    mockDairyCascade(ctx.mockPrisma, { outstanding: 0 });

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No outstanding balance/i);
  });

  test('rejects payment that exceeds outstanding balance', async ({ request }) => {
    mockDairyCascade(ctx.mockPrisma, { outstanding: 1000 });

    const res = await request.post('/api/v1/dairy-payments', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, paymentDate: '2026-04-30', amount: 5000 },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds outstanding balance of ₹1000/i);
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

  // ─── Update-side over-payment guard ────────────────────────────────────────

  test('PUT rejects when bumping amount past remaining outstanding (delta > outstanding)', async ({ request }) => {
    // PAYMENT.amount = 5000, remaining outstanding ₹1000, edit to ₹7000
    // → delta 2000 > 1000 → reject.
    ctx.mockPrisma.dairyPayment.findUnique.mockResolvedValue(PAYMENT);
    mockDairyCascade(ctx.mockPrisma, { outstanding: 1000 });

    const res = await request.put('/api/v1/dairy-payments/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { amount: 7000, paymentDate: '2026-04-30' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Increase of ₹2000 would exceed remaining outstanding balance of ₹1000/i);
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
