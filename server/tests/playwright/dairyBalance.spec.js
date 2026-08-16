'use strict';

/**
 * Dairy Balance API Tests
 * Covers: GET /api/v1/dairy-balance, GET /api/v1/dairy-balance/:brandId
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const BRAND = { id: 1, name: 'Nandini' };

const BALANCE = {
  id: 1, brandId: 1,
  balanceDate: new Date('2026-04-30'),
  openingBalance: 1000, stockValue: 5000, depositValue: 0,
  amountPaid: 2000, closingBalance: 4000,
};

// ─── GET /api/v1/dairy-balance ────────────────────────────────────────────────

test.describe('GET /api/v1/dairy-balance', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balance for all brands', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([BRAND]);
    // getAll batch-fetches persisted rows in one findMany — existing row found.
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([BALANCE]);

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('date', '2026-04-30');
    expect(body.data.brands).toHaveLength(1);
  });

  test('returns 200 with computed balance when no existing record', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([BRAND]);
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ id: 1, name: 'Nandini', depositEnabled: false, depositPerLitre: 0 });
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([]); // batch: no persisted rows
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);  // no prev
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.brands[0]).toHaveProperty('closingBalance', 0);
  });

  test('batch-fetches balances in one query, not one findUnique per brand (N+1 regression)', async ({ request }) => {
    let findManyCalls = 0;
    let findUniqueCalled = false;
    ctx.mockPrisma.brand.findMany.mockResolvedValue([
      { id: 1, name: 'Nandini' }, { id: 2, name: 'Jersey' },
    ]);
    ctx.mockPrisma.dairyBalance.findMany.mockImplementation(async () => {
      findManyCalls += 1;
      return [{ ...BALANCE, brandId: 1 }, { ...BALANCE, id: 2, brandId: 2 }];
    });
    ctx.mockPrisma.dairyBalance.findUnique.mockImplementation(async () => {
      findUniqueCalled = true;
      return null;
    });

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).data.brands).toHaveLength(2);
    // One batched read for two brands; no per-brand findUnique.
    expect(findManyCalls).toBe(1);
    expect(findUniqueCalled).toBe(false);
  });

  test('returns 200 with empty brands array when no brands', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.brands).toHaveLength(0);
  });
});

// ─── GET /api/v1/dairy-balance/:brandId ──────────────────────────────────────

test.describe('GET /api/v1/dairy-balance/:brandId', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with balance for a specific brand', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(BRAND);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(BALANCE);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('brandName', 'Nandini');
    expect(body.data).toHaveProperty('closingBalance', 4000);
  });

  test('returns 404 when brand does not exist', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(null);

    const res = await request.get('/api/v1/dairy-balance/999?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric brand ID', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/abc?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('includes depositValue in response when it exists on saved record', async ({ request }) => {
    const balanceWithDeposit = { ...BALANCE, depositValue: 100, closingBalance: 4100 };
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(BRAND);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(balanceWithDeposit);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.depositValue).toBe(100);
    expect(body.data.closingBalance).toBe(4100);
  });

  test('calculates depositValue on-the-fly for deposit-enabled brand', async ({ request }) => {
    // Brand: ₹0.20/litre deposit enabled
    // Receipt: 1000 units of 500ml crate product in deposit-enabled category
    // Expected deposit = 1000 × (500/1000) × 0.20 = ₹100
    const brandWithDeposit = { id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0.20 };
    const receipt = {
      quantity: 1000, unitPrice: 22,
      product: { unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true, category: 'Milk' },
    };

    ctx.mockPrisma.brand.findUnique.mockResolvedValue(brandWithDeposit);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null);  // no saved balance
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);   // no prior balance
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([receipt]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // stock = 1000 × 22 = 22000; deposit = 1000 × 0.5 × 0.20 = 100
    expect(body.data.depositValue).toBeCloseTo(100, 2);
    expect(body.data.stockValue).toBeCloseTo(22000, 2);
    expect(body.data.closingBalance).toBeCloseTo(22100, 2);
  });

  test('depositValue is zero when product does not qualify (containerType is not crate)', async ({ request }) => {
    const brandWithDeposit = { id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0.20 };
    const receipt = {
      quantity: 1000, unitPrice: 22,
      product: { unitType: 'ml', unitSize: 500, containerType: 'box', depositEnabled: true, category: 'Milk' },
    };

    ctx.mockPrisma.brand.findUnique.mockResolvedValue(brandWithDeposit);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([receipt]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.depositValue).toBe(0);
  });

  test('depositValue is zero when category deposit is disabled', async ({ request }) => {
    const brandWithDeposit = { id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0.20 };
    const receipt = {
      quantity: 1000, unitPrice: 22,
      product: { unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true, category: 'Ghee' },
    };

    ctx.mockPrisma.brand.findUnique.mockResolvedValue(brandWithDeposit);
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([receipt]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    // Ghee category has deposit disabled
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { name: 'Milk', depositEnabled: true },
      { name: 'Ghee', depositEnabled: false },
    ]);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.depositValue).toBe(0);
  });

  test('opening balance comes from prior date closing balance', async ({ request }) => {
    // Prior balance has closingBalance=8000; today has no receipts or payments
    // → openingBalance should be 8000, closingBalance should be 8000
    const priorBalance = { closingBalance: 8000 };
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ id: 1, name: 'Nandini', depositEnabled: false, depositPerLitre: 0 });
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null); // no record for today
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(priorBalance);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-05-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.openingBalance).toBe(8000);
    expect(body.data.stockValue).toBe(0);
    expect(body.data.amountPaid).toBe(0);
    expect(body.data.closingBalance).toBe(8000);
  });

  test('computed fallback ADDS top-ups (regression: must match balanceService)', async ({ request }) => {
    // No persisted row → falls back to balanceService.computeDairyBalance.
    // opening=8000, stock=0, deposit=0, topUp=+500, realPaid=-200 → closing=8300.
    // Guards against the old fallback that dropped topUpAmount from the formula.
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ id: 1, name: 'Nandini', depositEnabled: false, depositPerLitre: 0 });
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue({ closingBalance: 8000 });
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.aggregate.mockImplementation(({ where }) =>
      Promise.resolve({ _sum: { amount: where.isTopUp ? 500 : 200 } })
    );

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-05-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.openingBalance).toBe(8000);
    expect(body.data.topUpAmount).toBe(500);
    expect(body.data.amountPaid).toBe(200);
    expect(body.data.closingBalance).toBe(8300);
  });

  test('formula: closingBalance = openingBalance + stockValue + depositValue - amountPaid', async ({ request }) => {
    // opening=1000, stock=5000, deposit=100, paid=2000 → closing=4100
    const savedBalance = {
      id: 1, brandId: 1,
      balanceDate: new Date('2026-04-30'),
      openingBalance: 1000, stockValue: 5000, depositValue: 100,
      amountPaid: 2000, closingBalance: 4100,
    };
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ id: 1, name: 'Nandini' });
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(savedBalance);

    const res = await request.get('/api/v1/dairy-balance/1?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.openingBalance).toBe(1000);
    expect(body.data.stockValue).toBe(5000);
    expect(body.data.depositValue).toBe(100);
    expect(body.data.amountPaid).toBe(2000);
    expect(body.data.closingBalance).toBe(4100);
    // Verify the formula explicitly
    const { openingBalance, stockValue, depositValue, amountPaid, closingBalance } = body.data;
    expect(closingBalance).toBe(openingBalance + stockValue + depositValue - amountPaid);
  });
});

// ─── GET /api/v1/dairy-balance/route-breakdown ───────────────────────────────

test.describe('GET /api/v1/dairy-balance/route-breakdown', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&from=2026-04-01&to=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/route-breakdown?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when from is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when to is missing', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&from=2026-04-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when from is after to', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&from=2026-04-30&to=2026-04-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric brandId', async ({ request }) => {
    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=abc&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with route breakdown data', async ({ request }) => {
    // $queryRaw returns rows with BigInt/Decimal-like values (mocked as plain numbers here)
    ctx.mockPrisma.$queryRaw.mockResolvedValue([
      { routeId: 1n, routeNumber: 'R1', displayOrder: 1n, totalAmount: '25000.00', totalQuantity: '500.00' },
      { routeId: 2n, routeNumber: 'R2', displayOrder: 2n, totalAmount: '18000.00', totalQuantity: '300.00' },
    ]);

    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toHaveProperty('routeId', 1);
    expect(body.data[0]).toHaveProperty('routeNumber', 'R1');
    expect(body.data[0]).toHaveProperty('totalAmount', 25000);
    expect(body.data[0]).toHaveProperty('totalQuantity', 500);
  });

  test('returns 200 with empty array when no receipts in range', async ({ request }) => {
    ctx.mockPrisma.$queryRaw.mockResolvedValue([]);

    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  test('uses "General" label for routeId=0 when no route number', async ({ request }) => {
    ctx.mockPrisma.$queryRaw.mockResolvedValue([
      { routeId: 0n, routeNumber: null, displayOrder: 0n, totalAmount: '5000.00', totalQuantity: '100.00' },
    ]);

    const res = await request.get('/api/v1/dairy-balance/route-breakdown?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('routeNumber', 'General');
  });
});
