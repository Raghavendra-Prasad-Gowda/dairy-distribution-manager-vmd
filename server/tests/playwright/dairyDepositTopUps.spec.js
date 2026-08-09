'use strict';

/**
 * Dairy Deposit Top-up API Tests
 * Covers: POST /api/v1/dairy-deposit-topups/bulk, DELETE /:id
 *
 * A deposit top-up is a standalone ledger (DairyDepositTopUp) — deliberately
 * NOT a DairyPayment. It must never touch DairyBalance/topUpAmount (money
 * owed for stock); it only feeds the Deposit report's running total. See
 * dairyDepositTopUps.controller.js for the full rationale.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSuperAdminToken, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── POST /api/v1/dairy-deposit-topups/bulk ──────────────────────────────────

test.describe('POST /api/v1/dairy-deposit-topups/bulk', () => {
  function mockDeps(brands = [{ id: 1, name: 'Nandini', depositEnabled: true }], username = 'admin') {
    const createCalls = [];
    ctx.mockPrisma.brand.findMany.mockResolvedValue(brands);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username });
    ctx.mockPrisma.dairyDepositTopUp.create.mockImplementation(async (args) => {
      createCalls.push(args);
      return { id: 90 + createCalls.length, ...args.data };
    });
    return { createCalls };
  }

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a salesman', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when caller is a plain admin — superadmin only', async ({ request }) => {
    const { createCalls } = mockDeps();

    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(res.status()).toBe(403);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 201 and creates one top-up row per brand', async ({ request }) => {
    const { createCalls } = mockDeps([
      { id: 1, name: 'Nandini',   depositEnabled: true },
      { id: 2, name: 'Gowardhan', depositEnabled: true },
    ]);

    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        topUpDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 5000 }, { brandId: 2, amount: 7500 }],
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.count).toBe(2);
    expect(body.data.total).toBe(12500);
    expect(createCalls).toHaveLength(2);
  });

  test('stamps the admin username and never sets isTopUp (not a DairyPayment field)', async ({ request }) => {
    const { createCalls } = mockDeps([{ id: 1, name: 'Nandini', depositEnabled: true }], 'raghav');

    await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: 20000 }] },
    });

    expect(createCalls[0].data).toMatchObject({
      brandId:   1,
      amount:    20000,
      createdBy: 'raghav',
    });
    expect(createCalls[0].data.isTopUp).toBeUndefined();
  });

  test('never touches dairyPayment or dairyBalance — a completely separate ledger', async ({ request }) => {
    mockDeps();
    let paymentCreateCalls = 0;
    let balanceUpsertCalls = 0;
    ctx.mockPrisma.dairyPayment.create.mockImplementation(async () => { paymentCreateCalls++; return {}; });
    ctx.mockPrisma.dairyBalance.upsert.mockImplementation(async () => { balanceUpsertCalls++; return {}; });

    await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(paymentCreateCalls).toBe(0);
    expect(balanceUpsertCalls).toBe(0);
  });

  test('returns 400 when a brand does not have deposit enabled', async ({ request }) => {
    const { createCalls } = mockDeps([{ id: 1, name: 'Jersey', depositEnabled: false }]);

    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: 500 }] },
    });

    expect(res.status()).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 404 when a brand in the batch does not exist', async ({ request }) => {
    const { createCalls } = mockDeps([{ id: 1, name: 'Nandini', depositEnabled: true }]); // brand 2 missing

    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        topUpDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 500 }, { brandId: 2, amount: 750 }],
      },
    });

    expect(res.status()).toBe(404);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 400 when the same brand appears twice', async ({ request }) => {
    const { createCalls } = mockDeps();

    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {
        topUpDate: '2026-04-30',
        entries: [{ brandId: 1, amount: 500 }, { brandId: 1, amount: 750 }],
      },
    });

    expect(res.status()).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  test('returns 400 when entries is empty', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { topUpDate: '2026-04-30', entries: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when an amount is zero or negative', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { topUpDate: '2026-04-30', entries: [{ brandId: 1, amount: -500 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when topUpDate format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/dairy-deposit-topups/bulk', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { topUpDate: '30-04-2026', entries: [{ brandId: 1, amount: 500 }] },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── DELETE /api/v1/dairy-deposit-topups/:id ─────────────────────────────────

test.describe('DELETE /api/v1/dairy-deposit-topups/:id', () => {
  const TOPUP = { id: 5, brandId: 1, topUpDate: new Date('2026-04-30'), amount: 5000 };

  test('returns 403 when caller is a plain admin — superadmin only', async ({ request }) => {
    const res = await request.delete('/api/v1/dairy-deposit-topups/5', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 404 when the top-up does not exist', async ({ request }) => {
    ctx.mockPrisma.dairyDepositTopUp.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/dairy-deposit-topups/999', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('returns 200 and deletes the row', async ({ request }) => {
    ctx.mockPrisma.dairyDepositTopUp.findUnique.mockResolvedValue(TOPUP);
    ctx.mockPrisma.dairyDepositTopUp.delete.mockResolvedValue(TOPUP);

    const res = await request.delete('/api/v1/dairy-deposit-topups/5', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
