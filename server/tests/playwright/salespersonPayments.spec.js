'use strict';

/**
 * Salesperson Payments API Tests
 * Covers: POST, GET, DELETE /:id /api/v1/salesperson-payments
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

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
    ctx.mockPrisma.$transaction.mockResolvedValue(undefined); // balance recalc

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

// ─── DELETE /api/v1/salesperson-payments/:id ─────────────────────────────────

test.describe('DELETE /api/v1/salesperson-payments/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/salesperson-payments/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when payment is deleted', async ({ request }) => {
    ctx.mockPrisma.salespersonPayment.findUnique.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.salespersonPayment.delete.mockResolvedValue(PAYMENT);
    ctx.mockPrisma.$transaction.mockResolvedValue(undefined); // balance recalc

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
