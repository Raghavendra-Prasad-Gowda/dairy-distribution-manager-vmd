'use strict';

/**
 * Dispatches API Tests
 * Covers: GET, POST, DELETE /api/v1/dispatches
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');
const { mockSalespersonCascade } = require('../helpers/mock-cascade');
const { getIndiaDateStr, getIndiaTomorrowStr } = require('../../utils/dateUtils');

const { test, ctx, makeAuthToken, makeDispatcherToken, makeSuperAdminToken } = setupSuite();

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
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.get('/api/v1/dispatches/summary?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

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

  test('accepts dispatchDate = tomorrow — one day ahead is allowed for both roles', async ({ request }) => {
    mockStockAvailable(ctx.mockPrisma);
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null); // new dispatch
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue(DISPATCH);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { ...validPayload, dispatchDate: getIndiaTomorrowStr() },
    });

    expect(res.status()).toBe(201);
  });

  test('returns 400 when dispatchDate is more than one day in the future', async ({ request }) => {
    // A stock guard against physically impossible entries — nobody can
    // dispatch stock for a date further out than tomorrow.
    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2099-01-01', items: [{ productId: 1, quantity: 5, unitPrice: 40 }] },
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

  // `submitting` tells the controller to skip this save's own Slack
  // notification (the Submit call right after it reports the same total) —
  // it must not affect the actual save: the DB write, balance cascade, and
  // response all stay identical to an ordinary Save.
  test('submitting:true still creates the dispatch and cascades balance normally', async ({ request }) => {
    mockStockAvailable(ctx.mockPrisma);
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue(DISPATCH);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { ...validPayload, submitting: true },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('submitting:true on an empty-items clear still deletes the dispatch', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(DISPATCH);
    ctx.mockPrisma.stockDispatch.delete.mockResolvedValue(DISPATCH);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 1, dispatchDate: '2026-04-30', items: [], submitting: true },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/cleared/i);
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

  // itemCount used to only be reported by the (now-suppressed) intermediate
  // save's own card, so the Submitted card needs the dispatch's items included
  // to report it itself and not lose that information.
  test('includes items on the dispatch lookup so the card can report itemCount', async ({ request }) => {
    let findUniqueArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockImplementation(async (args) => {
      findUniqueArgs = args;
      return { ...DISPATCH, items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    });
    ctx.mockPrisma.stockDispatch.update.mockResolvedValue({ ...DISPATCH, isSubmitted: true, isAdminUnlocked: false });

    const res = await request.patch('/api/v1/dispatches/1/submit', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(findUniqueArgs.include).toEqual({ items: true });
  });
});

// ─── PATCH /api/v1/dispatches/:id/lock ───────────────────────────────────────

test.describe('PATCH /api/v1/dispatches/:id/lock', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/lock');
    expect(res.status()).toBe(403);
  });

  test('returns 400 for non-numeric dispatch ID', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/abc/lock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
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

  test('dispatcher locks a dispatch dated today', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date(getIndiaDateStr()), isSubmitted: false, isAdminUnlocked: true });
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, isSubmitted: true, isAdminUnlocked: false };
    });

    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toMatchObject({ isSubmitted: true, isAdminUnlocked: false });
  });

  test('dispatcher is blocked from locking a dispatch dated in the past', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date('2020-01-01') });

    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(403);
  });

  test('dispatcher is blocked from locking a dispatch dated in the future', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date(getIndiaTomorrowStr()) });

    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(403);
  });

  test('dispatcher is blocked from locking today once today has been finalized', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date(getIndiaDateStr()) });
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({ id: 1, date: new Date(getIndiaDateStr()) });

    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(403);
  });

  test('salesman is blocked from locking (dispatcher/admin only)', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/lock', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
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

  test('dispatcher unlocks a dispatch dated today', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date(getIndiaDateStr()), isSubmitted: true, isAdminUnlocked: false });
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...DISPATCH, isSubmitted: false, isAdminUnlocked: true };
    });

    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toMatchObject({ isSubmitted: false, isAdminUnlocked: true });
  });

  test('dispatcher is blocked from unlocking a dispatch dated yesterday', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date('2020-01-01') });

    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(403);
  });

  test('dispatcher is blocked from unlocking today once today has been finalized', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date(getIndiaDateStr()) });
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({ id: 1, date: new Date(getIndiaDateStr()) });

    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(403);
  });

  // Regression guard: admin/superadmin's unlock must stay completely
  // unrestricted regardless of finalization — the dispatcher-only check in
  // assertDispatcherCanToggleLock must never run for the admin/superadmin path.
  test('admin can still unlock a dispatch on a day that has been finalized', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({ ...DISPATCH, dispatchDate: new Date(getIndiaDateStr()), isSubmitted: true, isAdminUnlocked: false });
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({ id: 1, date: new Date(getIndiaDateStr()) });
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

  test('salesman is blocked from unlocking (dispatcher/admin only)', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/unlock', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
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

// ─── POST /api/v1/dispatches/finalize-day ────────────────────────────────────

test.describe('POST /api/v1/dispatches/finalize-day', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches/finalize-day');
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a salesman token', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 for an admin token — finalize-day is dispatcher-only, no escape hatch', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('dispatcher finalizes today: force-locks stragglers and creates a finalization row', async ({ request }) => {
    let updateManyArgs = null;
    let createArgs = null;
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.updateMany.mockImplementation(async (args) => {
      updateManyArgs = args;
      return { count: 2 };
    });
    ctx.mockPrisma.dispatchDayFinalization.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, date: args.data.date, finalizedByAdminUserId: args.data.finalizedByAdminUserId, isAuto: false };
    });

    const res = await request.post('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(updateManyArgs.where).toMatchObject({ isSubmitted: false });
    expect(updateManyArgs.data).toMatchObject({ isSubmitted: true, isAdminUnlocked: false });
    expect(createArgs.data).toMatchObject({ finalizedByAdminUserId: 2, isAuto: false });
  });

  test('returns 400 when today has already been finalized', async ({ request }) => {
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({ id: 1, date: new Date(getIndiaDateStr()) });

    const res = await request.post('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already been finalized/i);
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

// ─── POST /api/v1/dispatches — salesman price integrity ─────────────────────
//
// A salesman's request body must never dictate what they're billed.
// resolveSalespersonItemPricing() in dispatches.controller.js re-derives
// each item's unitPrice server-side from SalespersonPrice (effective on
// dispatchDate) or the product's salespersonDefaultPrice, and rejects any
// product that isn't enabled for them.

test.describe('POST /api/v1/dispatches — salesman price integrity', () => {
  const salesmanAuth = () => ({ Authorization: `Bearer ${makeSalesmanToken(7)}` });
  const TODAY = getIndiaDateStr();

  test('overrides a manipulated unitPrice with the real salespersonDefaultPrice', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, salespersonId: 7, dispatchDate: args.data.dispatchDate, totalAmount: args.data.totalAmount, items: [] };
    });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      // Attempted fraud: bill 100 units at ₹0.01 instead of the real ₹30.
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 100, unitPrice: 0.01 }] },
    });

    expect(res.status()).toBe(201);
    expect(createArgs.data.items.create[0].unitPrice).toBe(30);
    expect(createArgs.data.totalAmount).toBe(3000); // 100 * 30, not 100 * 0.01
  });

  test('uses a custom SalespersonPrice row over the global default when one is effective', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, salespersonId: 7, dispatchDate: args.data.dispatchDate, totalAmount: args.data.totalAmount, items: [] };
    });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([
      { productId: 1, sellingPrice: 22, effectiveFrom: new Date('2020-01-01') },
    ]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 999 }] },
    });

    expect(res.status()).toBe(201);
    expect(createArgs.data.items.create[0].unitPrice).toBe(22);
    expect(createArgs.data.totalAmount).toBe(220);
  });

  test('falls back to salespersonDefaultPrice when no SalespersonPrice row is effective yet', async ({ request }) => {
    // The resolver's own query filters effectiveFrom: { lte: dispatchDate },
    // so a future-scheduled price row would never appear in what it sees —
    // simulated here by an empty result set.
    let createArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, salespersonId: 7, dispatchDate: args.data.dispatchDate, totalAmount: args.data.totalAmount, items: [] };
    });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 999 }] },
    });

    expect(res.status()).toBe(201);
    expect(createArgs.data.items.create[0].unitPrice).toBe(30);
  });

  test('the price-resolution query scopes SalespersonPrice by salespersonId, productId and effectiveFrom<=dispatchDate', async ({ request }) => {
    let priceFindManyArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue({ id: 1, salespersonId: 7, dispatchDate: TODAY, totalAmount: 300, items: [] });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockImplementation(async (args) => {
      priceFindManyArgs = args;
      return [];
    });
    mockSalespersonCascade(ctx.mockPrisma);

    await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(priceFindManyArgs.where.salespersonId).toBe(7);
    expect(priceFindManyArgs.where.productId).toEqual({ in: [1] });
    expect(priceFindManyArgs.where.effectiveFrom).toEqual({ lte: new Date(TODAY) });
  });

  test('allows a globally-disabled product when a per-salesperson exception enables it', async ({ request }) => {
    // The Exception Manager (superadmin) creates a salespersonProduct row with
    // isEnabled=true for an otherwise globally-disabled product. That exception
    // must take precedence over the global gate so the salesperson can dispatch it.
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue({ id: 1, salespersonId: 7, dispatchDate: TODAY, totalAmount: 300, items: [] });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: false, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([{ productId: 1, isEnabled: true }]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(201);
  });

  test('rejects a globally-disabled product when no per-salesperson exception exists', async ({ request }) => {
    // Without an exception row, a globally-disabled product stays blocked.
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: false, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]); // no exception row
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(403);
  });

  test('rejects a product explicitly disabled for this salesperson', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([{ productId: 1, isEnabled: false }]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(403);
  });

  test('allows a product with no per-salesperson override row (defaults to enabled)', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue({ id: 1, salespersonId: 7, dispatchDate: TODAY, totalAmount: 300, items: [] });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]); // no row at all
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(201);
  });

  test('rejects an inactive product', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: false, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(400);
  });

  test('rejects a productId that does not exist', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.product.findMany.mockResolvedValue([]); // nothing matches that id
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 999, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(400);
  });

  test('re-resolves price on the UPDATE path too, not just create', async ({ request }) => {
    const EXISTING = { id: 9, salespersonId: 7, dispatchDate: new Date(TODAY), totalAmount: 100, isSubmitted: false, isAdminUnlocked: false };
    let findUniqueCallCount = 0;
    let updateArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockImplementation(async () => {
      findUniqueCallCount++;
      return findUniqueCallCount === 1 ? EXISTING : { ...EXISTING, totalAmount: 750, items: [] };
    });
    ctx.mockPrisma.stockDispatchItem.deleteMany.mockResolvedValue({ count: 1 });
    ctx.mockPrisma.stockDispatch.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { ...EXISTING, totalAmount: args.data.totalAmount };
    });
    ctx.mockPrisma.stockDispatchItem.createMany.mockResolvedValue({ count: 1 });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 25 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      // Attempted fraud on an edit: bill 30 units at ₹1 instead of ₹25.
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 30, unitPrice: 1 }] },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data.totalAmount).toBe(750); // 30 * 25, not 30 * 1
  });

  test('admin-supplied unitPrice is NOT overridden (admin flexibility preserved)', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockImplementation(async (args) => {
      createArgs = args;
      return { id: 1, salespersonId: 2, dispatchDate: args.data.dispatchDate, totalAmount: args.data.totalAmount, items: [] };
    });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      // No product/salespersonProduct/salespersonPrice mocks needed at all —
      // an admin request never calls resolveSalespersonItemPricing.
      data: { salespersonId: 2, dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 99 }] },
    });

    expect(res.status()).toBe(201);
    expect(createArgs.data.items.create[0].unitPrice).toBe(99);
    expect(createArgs.data.totalAmount).toBe(990);
  });
});

// ─── POST /api/v1/dispatches — salesman lock enforcement ────────────────────
//
// A salesman can never edit a finalized (submitted) entry, and a draft
// auto-locks once its date passes into the past — even if it was never
// submitted. A past date with NO existing record at all must be treated the
// same way: openForEntry (admin) always creates the row first when opening a
// date, so "no record" + "past date" together can only mean admin hasn't
// touched it.

test.describe('POST /api/v1/dispatches — salesman lock enforcement', () => {
  const salesmanAuth = () => ({ Authorization: `Bearer ${makeSalesmanToken(7)}` });
  const TODAY = getIndiaDateStr();
  const PAST_DATE = '2020-01-01';

  function mockUnlockedSave(existingBase) {
    let findUniqueCallCount = 0;
    ctx.mockPrisma.stockDispatch.findUnique.mockImplementation(async () => {
      findUniqueCallCount++;
      return findUniqueCallCount === 1 ? existingBase : { ...existingBase, items: [] };
    });
    ctx.mockPrisma.stockDispatchItem.deleteMany.mockResolvedValue({ count: 0 });
    ctx.mockPrisma.stockDispatch.update.mockResolvedValue({ ...existingBase, totalAmount: 300 });
    ctx.mockPrisma.stockDispatchItem.createMany.mockResolvedValue({ count: 1 });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);
  }

  test('blocked when the existing entry has been submitted', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 7, dispatchDate: new Date(TODAY), isSubmitted: true, isAdminUnlocked: false,
    });

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 1, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(403);
  });

  test('allowed when submitted but admin has unlocked it', async ({ request }) => {
    mockUnlockedSave({ id: 1, salespersonId: 7, dispatchDate: new Date(TODAY), isSubmitted: true, isAdminUnlocked: true, totalAmount: 100 });

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(200);
  });

  test('blocked when an un-submitted draft has aged into a past date', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 7, dispatchDate: new Date(PAST_DATE), isSubmitted: false, isAdminUnlocked: false,
    });

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: PAST_DATE, items: [{ productId: 1, quantity: 1, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(403);
  });

  test('allowed when a past-date draft has been admin-unlocked', async ({ request }) => {
    mockUnlockedSave({ id: 1, salespersonId: 7, dispatchDate: new Date(PAST_DATE), isSubmitted: false, isAdminUnlocked: true, totalAmount: 0 });

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: PAST_DATE, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(200);
  });

  test('blocked when NO existing record and the date is in the past (never opened by admin)', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: PAST_DATE, items: [{ productId: 1, quantity: 1, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(403);
  });

  test('allowed when NO existing record and the date is today', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue({ id: 1, salespersonId: 7, dispatchDate: TODAY, totalAmount: 300, items: [] });
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      { id: 1, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: 30 },
    ]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: TODAY, items: [{ productId: 1, quantity: 10, unitPrice: 30 }] },
    });

    expect(res.status()).toBe(201);
  });

  test('admin bypasses the past-date lock entirely, even with no existing record', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.stockDispatch.create.mockResolvedValue({ id: 1, salespersonId: 2, dispatchDate: PAST_DATE, totalAmount: 250, items: [] });
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { salespersonId: 2, dispatchDate: PAST_DATE, items: [{ productId: 1, quantity: 10, unitPrice: 25 }] },
    });

    expect(res.status()).toBe(201);
  });

  test('empty items (clear) is also blocked on a past date with no existing record — nothing to clear anyway', async ({ request }) => {
    // Empty items against a past date with no row already short-circuits to
    // "Nothing to save" for lack of an existing record — the lock check
    // (which now runs first) blocks it before that branch is even reached.
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue(null);

    const res = await request.post('/api/v1/dispatches', {
      headers: salesmanAuth(),
      data: { dispatchDate: PAST_DATE, items: [] },
    });

    expect(res.status()).toBe(403);
  });
});

// ─── DELETE /api/v1/dispatches/:id — salesman ownership + lock ──────────────

test.describe('DELETE /api/v1/dispatches/:id — salesman', () => {
  const salesmanAuth = () => ({ Authorization: `Bearer ${makeSalesmanToken(7)}` });
  const TODAY = getIndiaDateStr();

  test('returns 403 when deleting another salesperson\'s dispatch', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 999, dispatchDate: new Date(TODAY), isSubmitted: false, isAdminUnlocked: false, totalAmount: 100,
    });

    const res = await request.delete('/api/v1/dispatches/1', { headers: salesmanAuth() });

    expect(res.status()).toBe(403);
  });

  test('returns 403 when own dispatch has been submitted', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 7, dispatchDate: new Date(TODAY), isSubmitted: true, isAdminUnlocked: false, totalAmount: 100,
    });

    const res = await request.delete('/api/v1/dispatches/1', { headers: salesmanAuth() });

    expect(res.status()).toBe(403);
  });

  test('returns 403 when own draft has aged into a past date', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 7, dispatchDate: new Date('2020-01-01'), isSubmitted: false, isAdminUnlocked: false, totalAmount: 100,
    });

    const res = await request.delete('/api/v1/dispatches/1', { headers: salesmanAuth() });

    expect(res.status()).toBe(403);
  });

  test('returns 200 when own dispatch is an editable draft (today, unsubmitted)', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findUnique.mockResolvedValue({
      id: 1, salespersonId: 7, dispatchDate: new Date(TODAY), isSubmitted: false, isAdminUnlocked: false, totalAmount: 100,
    });
    ctx.mockPrisma.stockDispatch.delete.mockResolvedValue({});
    mockSalespersonCascade(ctx.mockPrisma);

    const res = await request.delete('/api/v1/dispatches/1', { headers: salesmanAuth() });

    expect(res.status()).toBe(200);
  });
});

// ─── DELETE /api/v1/dispatches/finalize-day ───────────────────────────────────

test.describe('DELETE /api/v1/dispatches/finalize-day', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/finalize-day');
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a salesman token', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a dispatcher token — only admin/superadmin can undo finalization', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when there is no explicit finalization row for today', async ({ request }) => {
    // No DB row → today was never explicitly finalized (or is auto-finalized via date)
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not been explicitly finalized/i);
  });

  test('admin deletes finalization row and returns 200', async ({ request }) => {
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({
      id: 1, date: new Date(getIndiaDateStr()), finalizedByAdminUserId: 2, isAuto: false,
    });
    let deleteCalled = false;
    ctx.mockPrisma.dispatchDayFinalization.delete.mockImplementation(async () => {
      deleteCalled = true;
      return { id: 1 };
    });

    const res = await request.delete('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/reversed/i);
    expect(deleteCalled).toBe(true);
  });

  test('superadmin can also undo finalization', async ({ request }) => {
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({
      id: 1, date: new Date(getIndiaDateStr()), finalizedByAdminUserId: null, isAuto: false,
    });
    ctx.mockPrisma.dispatchDayFinalization.delete.mockResolvedValue({ id: 1 });

    const res = await request.delete('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
  });
});

// ─── Dispatcher security boundary ────────────────────────────────────────────
//
// A dispatcher may only: read the daily-dispatch report, read stock-receipt
// availability, lock/unlock today's entries, and finalize/undo-finalize today.
// Every other dispatch action must return 403 for a dispatcher token.
// These tests pin the guards so a careless controller change can't silently
// open up a write path to a dispatcher.

test.describe('Dispatcher — blocked actions', () => {
  test('GET /api/v1/dispatches → 403 (raw list; dispatcher uses /reports/daily-dispatch)', async ({ request }) => {
    const res = await request.get('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/v1/dispatches → 403 (cannot create or modify stock entries)', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
      data: { salespersonId: 1, dispatchDate: getIndiaDateStr(), items: [] },
    });
    expect(res.status()).toBe(403);
  });

  test('PATCH /api/v1/dispatches/1/submit → 403 (submit is a salesman/admin action)', async ({ request }) => {
    const res = await request.patch('/api/v1/dispatches/1/submit', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('DELETE /api/v1/dispatches/1 → 403 (cannot delete stock entries)', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/1', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('DELETE /api/v1/dispatches/finalize-day → 403 (undo is an admin-only action)', async ({ request }) => {
    const res = await request.delete('/api/v1/dispatches/finalize-day', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/v1/dispatches/open-for-entry → 403 (admin-only, not dispatcher)', async ({ request }) => {
    const res = await request.post('/api/v1/dispatches/open-for-entry', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
      data: { salespersonId: 1, dispatchDate: getIndiaDateStr() },
    });
    expect(res.status()).toBe(403);
  });
});
