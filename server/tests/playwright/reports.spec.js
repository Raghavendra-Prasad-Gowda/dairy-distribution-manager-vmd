'use strict';

/**
 * Reports API Tests
 * Covers: GET /dairy-statement, /salesperson-statement, /stock-summary, /outstanding
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── GET /api/v1/reports/dairy-statement ─────────────────────────────────────

test.describe('GET /api/v1/reports/dairy-statement', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/dairy-statement?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when from is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/dairy-statement?brandId=1&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when to is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with dairy statement rows', async ({ request }) => {
    const balance = {
      balanceDate: new Date('2026-04-30'),
      openingBalance: 1000, stockValue: 5000, amountPaid: 2000, closingBalance: 4000,
      brand: { name: 'Nandini' },
    };
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([balance]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('closingBalance', 4000);
  });

  test('returns 200 with empty array when no balance records', async ({ request }) => {
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── GET /api/v1/reports/salesperson-statement ───────────────────────────────

test.describe('GET /api/v1/reports/salesperson-statement', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when salespersonId is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when from is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=1&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with salesperson statement rows', async ({ request }) => {
    const balance = {
      balanceDate: new Date('2026-04-30'),
      openingBalance: 0, stockGiven: 3000, amountPaid: 1500, closingBalance: 1500,
    };
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([balance]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('closingBalance', 1500);
  });

  test('returns 200 with empty array when no balance records', async ({ request }) => {
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── GET /api/v1/reports/stock-summary ───────────────────────────────────────

test.describe('GET /api/v1/reports/stock-summary', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/stock-summary?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date query param is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/stock-summary', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with stock summary', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('date', '2026-04-30');
    expect(body.data).toHaveProperty('receipts');
    expect(body.data).toHaveProperty('dispatches');
  });
});

// ─── GET /api/v1/reports/outstanding ─────────────────────────────────────────

test.describe('GET /api/v1/reports/outstanding', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/outstanding');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with outstanding balances', async ({ request }) => {
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([
      { brandId: 1, closingBalance: 4000, brand: { id: 1, name: 'Nandini' } },
    ]);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([
      { salespersonId: 1, closingBalance: 1500, salesperson: { id: 1, name: 'Raju' } },
    ]);

    const res = await request.get('/api/v1/reports/outstanding', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.dairy).toHaveLength(1);
    expect(body.data.salespeople).toHaveLength(1);
    expect(body.data.dairy[0]).toHaveProperty('outstanding', 4000);
    expect(body.data.salespeople[0]).toHaveProperty('outstanding', 1500);
  });

  test('returns 200 with empty arrays when no balances', async ({ request }) => {
    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/outstanding', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.dairy).toHaveLength(0);
    expect(body.data.salespeople).toHaveLength(0);
  });
});

// ─── GET /api/v1/reports/deposit-summary ─────────────────────────────────────

const DEPOSIT_BRAND = { id: 1, name: 'Nandini', depositEnabled: true, depositPerLitre: 0.20 };

test.describe('GET /api/v1/reports/deposit-summary', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when required params are missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 404 when brand does not exist', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=999&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('returns 200 with depositEnabled false and zero total when brand has no deposit', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue({ ...DEPOSIT_BRAND, depositEnabled: false, depositPerLitre: 0 });
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.depositEnabled).toBe(false);
    expect(body.data.totalDeposit).toBe(0);
    expect(body.data.rows).toHaveLength(0);
  });

  test('calculates deposit correctly for qualifying crate receipts', async ({ request }) => {
    // 1000 units × 500ml crate × ₹0.20/L = ₹100
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([{
      receiptDate: new Date('2026-04-15'),
      quantity: 1000, unitPrice: 22,
      product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true },
    }]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].dailyDeposit).toBeCloseTo(100, 2);
    expect(body.data.rows[0].items[0].litres).toBeCloseTo(500, 1);
    expect(body.data.totalDeposit).toBeCloseTo(100, 2);
  });

  test('excludes non-crate products from deposit calculation', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { name: 'Milk', depositEnabled: true },
      { name: 'Curd', depositEnabled: true },
    ]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      {
        receiptDate: new Date('2026-04-15'), quantity: 1000, unitPrice: 22,
        product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true },
      },
      {
        receiptDate: new Date('2026-04-15'), quantity: 500, unitPrice: 30,
        product: { name: 'Curd 400g', category: 'Curd', unitType: 'gram', unitSize: 400, containerType: 'box', depositEnabled: true },
      },
    ]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Only crate qualifies; box is excluded
    expect(body.data.rows[0].items).toHaveLength(1);
    expect(body.data.rows[0].items[0].productName).toBe('Milk 500ml');
    expect(body.data.totalDeposit).toBeCloseTo(100, 2);
  });

  test('accumulates running total correctly across multiple days', async ({ request }) => {
    // Day 1: 1000 × 0.5L × 0.20 = ₹100; Day 2: 500 × 0.5L × 0.20 = ₹50; running = ₹150
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      {
        receiptDate: new Date('2026-04-01'), quantity: 1000, unitPrice: 22,
        product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true },
      },
      {
        receiptDate: new Date('2026-04-02'), quantity: 500, unitPrice: 22,
        product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true },
      },
    ]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rows[0].runningTotal).toBeCloseTo(100, 2);
    expect(body.data.rows[1].runningTotal).toBeCloseTo(150, 2);
    expect(body.data.totalDeposit).toBeCloseTo(150, 2);
  });
});
