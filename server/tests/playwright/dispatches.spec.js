'use strict';

/**
 * Dispatches API Tests
 * Covers: GET, POST, DELETE /api/v1/dispatches
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const DISPATCH = {
  id:            1,
  salespersonId: 1,
  dispatchDate:  new Date('2026-04-30'),
  totalAmount:   1200,
  notes:         null,
  items:         [],
};

/**
 * Sets up stock guard mocks so validation passes:
 * received qty > 0, dispatched qty = 0 → available stock for any product.
 */
function mockStockAvailable(mockPrisma) {
  mockPrisma.stockReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
  mockPrisma.stockDispatchItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
}

// ─── GET /api/v1/dispatches ───────────────────────────────────────────────────

test.describe('GET /api/v1/dispatches', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dispatches');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when token is invalid', async ({ request }) => {
    const res = await request.get('/api/v1/dispatches', {
      headers: { Authorization: 'Bearer bad.token.here' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 200 with dispatch list', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([DISPATCH]);

    const res = await request.get('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

// ─── GET /api/v1/dispatches/summary ──────────────────────────────────────────

test.describe('GET /api/v1/dispatches/summary', () => {
  test('returns 400 when date is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dispatches/summary', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with summary for a given date', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([DISPATCH]);

    const res = await request.get('/api/v1/dispatches/summary?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── POST /api/v1/dispatches ──────────────────────────────────────────────────

test.describe('POST /api/v1/dispatches', () => {
  const validPayload = {
    salespersonId: 1,
    dispatchDate:  '2026-04-30',
    items: [{ productId: 1, quantity: 5, unitPrice: 40 }],
  };

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches', { data: validPayload });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when dispatch is created successfully', async ({ request }) => {
    mockStockAvailable(ctx.mockPrisma);
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null); // new dispatch
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.$transaction.mockResolvedValue(undefined); // balance recalc

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when stock is insufficient', async ({ request }) => {
    // stockReceipt has 2, but dispatching 10
    ctx.mockPrisma.stockReceipt.aggregate.mockResolvedValue({ _sum: { quantity: 2 } });
    ctx.mockPrisma.stockDispatchItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.product.findMany.mockResolvedValue([{ id: 1, name: 'Milk 500ml' }]);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 10, unitPrice: 40 }] },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('STOCK_INSUFFICIENT');
  });

  test('returns 400 when items array is empty', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when salespersonId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 5, unitPrice: 40 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when dispatchDate format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '30-04-2026', items: [{ productId: 1, quantity: 5, unitPrice: 40 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 when updating an existing dispatch for the same salesperson+date', async ({ request }) => {
    mockStockAvailable(ctx.mockPrisma);

    // The controller calls findUnique twice: once to check for existing, once after update.
    // Use a simple counter to return different values on successive calls.
    let findUniqueCallCount = 0;
    const updatedDispatch = { ...DISPATCH, totalAmount: 400, items: [] };
    ctx.mockPrisma.stockDispatch.findUnique.mockImplementation(async () => {
      findUniqueCallCount++;
      return findUniqueCallCount === 1 ? DISPATCH : updatedDispatch;
    });

    ctx.mockPrisma.stockDispatchItem.deleteMany.mockResolvedValue({ count: 1 });
    ctx.mockPrisma.stockDispatch.update.mockResolvedValue({ ...DISPATCH, totalAmount: 400 });
    ctx.mockPrisma.stockDispatchItem.createMany.mockResolvedValue({ count: 1 });

    // Set up balance recalc mocks
    ctx.mockPrisma.salespersonBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: 400 } });
    ctx.mockPrisma.salespersonPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    ctx.mockPrisma.salespersonBalance.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 10, unitPrice: 40 }] },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('triggers balance cascade for subsequent dates after dispatch create', async ({ request }) => {
    const recalcDates = [];

    mockStockAvailable(ctx.mockPrisma);
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null); // no existing
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue(DISPATCH);

    // Two subsequent balance records should cascade
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([
      { balanceDate: new Date('2026-05-01') },
      { balanceDate: new Date('2026-05-02') },
    ]);
    ctx.mockPrisma.salespersonBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    ctx.mockPrisma.salespersonPayment.aggregate.mockImplementation(async ({ where }) => {
      recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
      return { _sum: { amount: null } };
    });
    ctx.mockPrisma.salespersonBalance.upsert.mockResolvedValue({});

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [{ productId: 1, quantity: 5, unitPrice: 40 }] },
    });

    expect(res.status()).toBe(201);
    // The dispatch date + both subsequent cascade dates
    expect(recalcDates).toContain('2026-04-30');
    expect(recalcDates).toContain('2026-05-01');
    expect(recalcDates).toContain('2026-05-02');
  });
});

// ─── DELETE /api/v1/dispatches/:id ───────────────────────────────────────────

test.describe('DELETE /api/v1/dispatches/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when dispatch is deleted', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.stockDispatch.delete.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.$transaction.mockResolvedValue(undefined); // balance recalc

    const res = await request.delete('/api/v1/dispatches/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when dispatch does not exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/dispatches/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric dispatch ID', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('triggers balance cascade for subsequent dates after dispatch delete', async ({ request }) => {
    const recalcDates = [];

    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.stockDispatch.delete.mockResolvedValue(DISPATCH);

    // Two subsequent balance records should cascade
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([
      { balanceDate: new Date('2026-05-01') },
      { balanceDate: new Date('2026-05-02') },
    ]);
    ctx.mockPrisma.salespersonBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    ctx.mockPrisma.salespersonPayment.aggregate.mockImplementation(async ({ where }) => {
      recalcDates.push(where.paymentDate.toISOString().slice(0, 10));
      return { _sum: { amount: null } };
    });
    ctx.mockPrisma.salespersonBalance.upsert.mockResolvedValue({});

    const res = await request.delete('/api/v1/dispatches/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    // Dispatch date + both subsequent cascade dates
    expect(recalcDates).toContain('2026-04-30');
    expect(recalcDates).toContain('2026-05-01');
    expect(recalcDates).toContain('2026-05-02');
  });
});

// ─── GET /api/v1/dispatches with filters ─────────────────────────────────────

test.describe('GET /api/v1/dispatches with query filters', () => {
  test('returns 200 filtered by date', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([DISPATCH]);

    const res = await request.get('/api/v1/dispatches?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 filtered by salespersonId', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([DISPATCH]);

    const res = await request.get('/api/v1/dispatches?salespersonId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 400 when salespersonId filter is non-numeric', async ({ request }) => {
    const res = await request.get('/api/v1/dispatches?salespersonId=abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with empty list when no dispatches', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});
