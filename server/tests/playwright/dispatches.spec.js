'use strict';

/**
 * Dispatches API Tests
 * Covers: GET, POST, DELETE /api/v1/dispatches
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { mockSalespersonCascade } = require('../helpers/mock-cascade');

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
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // Stock guard temporarily disabled in dispatches.controller.js — re-enable
  // this test when validateDispatchStock is uncommented.
  test.skip('returns 400 when stock is insufficient', async ({ request }) => {
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
    expect(body.error).toMatch(/Insufficient stock/);
    expect(body.error).toMatch(/Milk 500ml/);
    expect(body.error).toMatch(/need 10/);
    expect(body.error).toMatch(/have 2/);
  });

  test('empty items + no existing dispatch → 200 no-op ("Nothing to save")', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/Nothing to save/i);
  });

  test('empty items + existing dispatch → deletes dispatch and cascades balance', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.stockDispatch.delete.mockResolvedValue(DISPATCH);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/cleared/i);
  });

  test('empty items + admin-unlocked dispatch → clears in place, does not delete or re-lock', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, isAdminUnlocked: true });
    let deleteCalled = false;
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.delete.mockImplementation(async () => {
      deleteCalled = true;
      return DISPATCH;
    });
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, totalAmount: 0, isAdminUnlocked: true };
    });
    ctx.mockPrisma.stockDispatchItem.deleteMany.mockResolvedValue({ count: 0 });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [] },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/cleared/i);
    expect(deleteCalled).toBe(false);
    expect(updateArgs.data).toMatchObject({ totalAmount: 0 });
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
    mockSalespersonCascade(ctx.mockPrisma);

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

// ─── PATCH /api/v1/dispatches/:id/submit ─────────────────────────────────────

test.describe('PATCH /api/v1/dispatches/:id/submit', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/submit');
    expect(res.status()).toBe(403);
  });

  test('returns 404 when dispatch does not exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    const res = await request.patch('/api/v1/dispatches/999/submit', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric dispatch ID', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/abc/submit', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('admin can submit any dispatch, locks it', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, isSubmitted: true, isAdminUnlocked: false };
    });

    const res = await request.patch('/api/v1/dispatches/1/submit', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateArgs.data).toMatchObject({ isSubmitted: true, isAdminUnlocked: false });
    expect(updateArgs.where).toEqual({ id: 1 });
  });
});

// ─── PATCH /api/v1/dispatches/:id/lock ───────────────────────────────────────

test.describe('PATCH /api/v1/dispatches/:id/lock', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/lock');
    expect(res.status()).toBe(403);
  });

  test('returns 404 when dispatch does not exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    const res = await request.patch('/api/v1/dispatches/999/lock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('admin locks the dispatch (sets isSubmitted=true, isAdminUnlocked=false)', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, isSubmitted: false, isAdminUnlocked: true });
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, isSubmitted: true, isAdminUnlocked: false };
    });

    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toMatchObject({ isSubmitted: true, isAdminUnlocked: false });
  });
});

// ─── PATCH /api/v1/dispatches/:id/unlock ─────────────────────────────────────

test.describe('PATCH /api/v1/dispatches/:id/unlock', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/unlock');
    expect(res.status()).toBe(403);
  });

  test('returns 404 when dispatch does not exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    const res = await request.patch('/api/v1/dispatches/999/unlock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('admin unlocks the dispatch (sets isSubmitted=false, isAdminUnlocked=true)', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, isSubmitted: true, isAdminUnlocked: false });
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, isSubmitted: false, isAdminUnlocked: true };
    });

    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toMatchObject({ isSubmitted: false, isAdminUnlocked: true });
  });

  test('returns 200 and is idempotent when called on already-unlocked dispatch', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, isSubmitted: false, isAdminUnlocked: true });
    ctx.mockPrisma.stockDispatch.update.mockResolvedValue({ ...DISPATCH, isSubmitted: false, isAdminUnlocked: true });

    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
  });
});

// ─── POST /api/v1/dispatches/open-for-entry ──────────────────────────────────

test.describe('POST /api/v1/dispatches/open-for-entry', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches/open-for-entry', {
      data: { salespersonId: 1, dispatchDate: '2026-04-28' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when salespersonId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches/open-for-entry', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { dispatchDate: '2026-04-28' },
    });
    expect(res.status()).toBe(400);
  });

  test('creates a new blank, unlocked dispatch when none exists for that date', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { ...DISPATCH, id: 2, totalAmount: 0, isSubmitted: false, isAdminUnlocked: true };
    });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches/open-for-entry', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-28' },
    });

    expect(res.status()).toBe(200);
    expect(createArgs.data).toMatchObject({
      salespersonId:   1,
      totalAmount:     0,
      isSubmitted:     false,
      isAdminUnlocked: true,
    });
  });

  test('unlocks the existing dispatch when one already exists for that date', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, isSubmitted: true, isAdminUnlocked: false });
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, isSubmitted: false, isAdminUnlocked: true };
    });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches/open-for-entry', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30' },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toMatchObject({ isSubmitted: false, isAdminUnlocked: true });
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
