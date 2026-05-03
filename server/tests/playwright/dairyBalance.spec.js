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
    // getOrBuildBalance: existing balance found — returns early
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(BALANCE);

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
    ctx.mockPrisma.dairyBalance.findUnique.mockResolvedValue(null); // no existing
    ctx.mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);  // no prev
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/dairy-balance?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.brands[0]).toHaveProperty('closingBalance', 0);
  });

  test('returns 200 with empty brands array when no brands', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockResolvedValue([]);

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
});
