'use strict';

/**
 * Reports API Tests
 * Covers: GET /dairy-statement, /salesperson-statement, /stock-summary, /outstanding
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { getIndiaDateStr } = require('../../utils/dateUtils');

const { test, ctx, makeAuthToken, makeDispatcherToken } = setupSuite();

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

  test('returns 400 when brandId is non-numeric', async ({ request }) => {
    const res = await request.get('/api/v1/reports/dairy-statement?brandId=abc&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
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

  test('returns 200 with receipts and payments mapped to each day', async ({ request }) => {
    const balance = {
      balanceDate: new Date('2026-04-30'),
      openingBalance: 1000, stockValue: 2200, depositValue: 0, amountPaid: 1000, closingBalance: 2200,
      brand: { name: 'Nandini' },
    };
    const receipt = {
      receiptDate: new Date('2026-04-30'),
      quantity: 100, unitPrice: 22, routeId: 0,
      product: { name: 'Milk 500ml' },
    };
    const payment = {
      paymentDate: new Date('2026-04-30'),
      amount: 1000, paymentMode: 'cash', reference: null, createdAt: new Date('2026-04-30'),
    };

    ctx.mockPrisma.dairyBalance.findMany.mockResolvedValue([balance]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([receipt]);
    ctx.mockPrisma.dairyPayment.findMany.mockResolvedValue([payment]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/dairy-statement?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('stockValue', 2200);
    expect(body.data[0].receipts).toHaveLength(1);
    expect(body.data[0].receipts[0]).toHaveProperty('productName', 'Milk 500ml');
    expect(body.data[0].receipts[0]).toHaveProperty('amount', 2200);
    expect(body.data[0].payments).toHaveLength(1);
    expect(body.data[0].payments[0]).toHaveProperty('amount', 1000);
  });

  test('includes depositValue in dairy statement rows', async ({ request }) => {
    const balance = {
      balanceDate: new Date('2026-04-30'),
      openingBalance: 0, stockValue: 5000, depositValue: 100, amountPaid: 2000, closingBalance: 3100,
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
    expect(body.data[0]).toHaveProperty('depositValue', 100);
    expect(body.data[0]).toHaveProperty('closingBalance', 3100);
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

  test('returns 400 when to is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when salespersonId is non-numeric', async ({ request }) => {
    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=abc&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
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

  test('returns 200 with items and payments mapped to each day', async ({ request }) => {
    const balance = {
      balanceDate: new Date('2026-04-30'),
      openingBalance: 0, stockGiven: 2400, amountPaid: 1200, closingBalance: 1200,
    };
    const dispatch = {
      salespersonId: 1,
      dispatchDate: new Date('2026-04-30'),
      items: [{
        product: { name: 'Milk 500ml', brand: { name: 'Nandini' } },
        quantity: 60, unitPrice: 40, totalAmount: 2400,
      }],
    };
    const payment = {
      salespersonId: 1,
      paymentDate: new Date('2026-04-30'),
      amount: 1200, paymentMode: 'cash', reference: null,
    };

    ctx.mockPrisma.salespersonBalance.findMany.mockResolvedValue([balance]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([dispatch]);
    ctx.mockPrisma.salespersonPayment.findMany.mockResolvedValue([payment]);

    const res = await request.get('/api/v1/reports/salesperson-statement?salespersonId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('stockGiven', 2400);
    expect(body.data[0].items).toHaveLength(1);
    expect(body.data[0].items[0]).toHaveProperty('productName', 'Milk 500ml');
    expect(body.data[0].payments).toHaveLength(1);
    expect(body.data[0].payments[0]).toHaveProperty('amount', 1200);
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

  test('returns 200 with stock summary (legacy single-date param)', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      from: '2026-04-30',
      to:   '2026-04-30',
      grandTotalReceived:   0,
      grandTotalDispatched: 0,
      rows: [],
    });
  });

  test('returns 200 with stock summary using from/to date range', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.from).toBe('2026-04-01');
    expect(body.data.to).toBe('2026-04-30');
  });

  test('aggregates receipts and dispatches into per-day rows', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      {
        receiptDate: new Date('2026-04-30'), quantity: 100, unitPrice: 22, routeId: 0,
        product: { name: 'Milk', unitsPerContainer: null, costPrice: 22, displayOrder: 0 },
        brand:   { name: 'Nandini' },
      },
    ]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([
      {
        dispatchDate: new Date('2026-04-30'),
        salesperson:  { name: 'Alice' },
        items: [
          { quantity: 10, unitPrice: 24, totalAmount: 240, product: { name: 'Milk', brand: { name: 'Nandini' } } },
        ],
      },
    ]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?from=2026-04-30&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].date).toBe('2026-04-30');
    expect(body.data.rows[0].totalReceived).toBe(2200);   // 100 × 22
    expect(body.data.rows[0].totalDispatched).toBe(240);
    expect(body.data.grandTotalReceived).toBe(2200);
    expect(body.data.grandTotalDispatched).toBe(240);
  });

  test('receipt rows carry unitsPerContainer, costPrice, displayOrder, routeNumber for the new UI columns', async ({ request }) => {
    // The Stock Summary period-summary table renders:
    //   - "Total Crates" column   → needs unitsPerContainer
    //   - "Unit Price" column     → needs product.costPrice (configured price)
    //   - sort order in the table → needs product.displayOrder (matches receipt page)
    //   - Route badges            → needs receipt.routeNumber resolved from routeId
    // Lock the response shape so a casual controller change can't break the UI.
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      {
        receiptDate: new Date('2026-04-30'), quantity: 100, unitPrice: 22, routeId: 7,
        product: { name: 'Toned 500ml', unitsPerContainer: 20, costPrice: 22, displayOrder: 3 },
        brand:   { name: 'Nandini' },
      },
    ]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([{ id: 7, routeNumber: 'R3' }]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?from=2026-04-30&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const receipt = (await res.json()).data.rows[0].receipts[0];
    expect(receipt).toMatchObject({
      productName:       'Toned 500ml',
      brandName:         'Nandini',
      quantity:          100,
      unitPrice:         22,
      amount:            2200,
      routeNumber:       'R3',
      unitsPerContainer: 20,
      costPrice:         22,
      displayOrder:      3,
    });
  });

  test('routeId=0 receipts (non-route brands like Jersey/Gowardhan) have routeNumber=null', async ({ request }) => {
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      {
        receiptDate: new Date('2026-04-30'), quantity: 50, unitPrice: 30, routeId: 0,
        product: { name: 'Ghee 500ml', unitsPerContainer: null, costPrice: 30, displayOrder: 0 },
        brand:   { name: 'Jersey' },
      },
    ]);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/stock-summary?from=2026-04-30&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).data.rows[0].receipts[0].routeNumber).toBeNull();
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
    expect(body.data.rows[0].items[0].volumeOrWeight).toBeCloseTo(500, 1);
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

  test('includes gram-type products in deposit calculation', async ({ request }) => {
    // 500 units × 400g crate × ₹0.20/L = 500 × 0.4 × 0.20 = ₹40
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Curd', depositEnabled: true }]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([{
      receiptDate: new Date('2026-04-15'),
      quantity: 500, unitPrice: 30,
      product: { name: 'Curd 400g', category: 'Curd', unitType: 'gram', unitSize: 400, containerType: 'crate', depositEnabled: true },
    }]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    // 500 × (400/1000) × 0.20 = 40
    expect(body.data.rows[0].dailyDeposit).toBeCloseTo(40, 2);
    expect(body.data.totalDeposit).toBeCloseTo(40, 2);
  });

  test('merges same product from multiple routes into a single deposit line', async ({ request }) => {
    // Route 1: 600 units, Route 2: 400 units of same product → total 1000 × 0.5L × 0.20 = ₹100
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([
      {
        receiptDate: new Date('2026-04-15'), quantity: 600, unitPrice: 22,
        product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true, displayOrder: 1 },
      },
      {
        receiptDate: new Date('2026-04-15'), quantity: 400, unitPrice: 22,
        product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true, displayOrder: 1 },
      },
    ]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Two receipts for same product should be merged into a single line
    expect(body.data.rows[0].items).toHaveLength(1);
    expect(body.data.rows[0].items[0].quantity).toBe(1000);
    expect(body.data.rows[0].dailyDeposit).toBeCloseTo(100, 2);
  });

  test('returns correct brandName and depositPerLitre in response', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('brandName', 'Nandini');
    expect(body.data).toHaveProperty('depositEnabled', true);
    expect(body.data).toHaveProperty('depositPerLitre', 0.20);
    expect(body.data).toHaveProperty('from', '2026-04-01');
    expect(body.data).toHaveProperty('to', '2026-04-30');
  });

  test('returns 400 for non-numeric brandId', async ({ request }) => {
    const res = await request.get('/api/v1/reports/deposit-summary?brandId=abc&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
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

  // A manual top-up (DairyDepositTopUp) represents a deposit balance carried
  // over from before the app was used — it must count toward the running
  // total even when it predates the requested `from`, and every test above
  // this point never mocks dairyDepositTopUp at all, so this path (and the
  // two below) were previously exercised only by the mock's silent "no
  // top-up" default, never by an actual carry-forward value.
  test('carries a top-up recorded before "from" forward into openingDeposit and every running total', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([{
      receiptDate: new Date('2026-04-15'), quantity: 1000, unitPrice: 22,
      product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true },
    }]);
    ctx.mockPrisma.dairyDepositTopUp.findMany.mockResolvedValue([]); // none inside the range itself
    ctx.mockPrisma.dairyDepositTopUp.aggregate.mockResolvedValue({ _sum: { amount: 500 } }); // recorded before `from`

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.openingDeposit).toBe(500);
    // Running total starts from the carried-forward 500, plus this day's 100.
    expect(body.data.rows[0].runningTotal).toBeCloseTo(600, 2);
    expect(body.data.totalDeposit).toBeCloseTo(600, 2);
  });

  test('a top-up on a day with no receipts still appears as its own dated row', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
    ctx.mockPrisma.dairyDepositTopUp.findMany.mockResolvedValue([
      { id: 1, topUpDate: new Date('2026-04-10'), amount: 250, notes: 'legacy crate deposit', createdBy: 'admin' },
    ]);
    ctx.mockPrisma.dairyDepositTopUp.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].dailyDeposit).toBe(250);
    expect(body.data.rows[0].items).toHaveLength(1);
    expect(body.data.rows[0].items[0]).toMatchObject({ isTopUp: true, depositAmount: 250, notes: 'legacy crate deposit', createdBy: 'admin' });
    expect(body.data.totalDeposit).toBe(250);
  });

  test('a top-up on the same day as receipts merges into that day\'s row instead of a duplicate date', async ({ request }) => {
    ctx.mockPrisma.brand.findUnique.mockResolvedValue(DEPOSIT_BRAND);
    ctx.mockPrisma.category.findMany.mockResolvedValue([{ name: 'Milk', depositEnabled: true }]);
    ctx.mockPrisma.stockReceipt.findMany.mockResolvedValue([{
      receiptDate: new Date('2026-04-15'), quantity: 1000, unitPrice: 22,
      product: { name: 'Milk 500ml', category: 'Milk', unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true },
    }]);
    ctx.mockPrisma.dairyDepositTopUp.findMany.mockResolvedValue([
      { id: 1, topUpDate: new Date('2026-04-15'), amount: 50, notes: null, createdBy: 'admin' },
    ]);
    ctx.mockPrisma.dairyDepositTopUp.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const res = await request.get('/api/v1/reports/deposit-summary?brandId=1&from=2026-04-01&to=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Receipt deposit (100) + top-up (50) on the SAME date → one row, not two.
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].items).toHaveLength(2); // top-up line + the receipt line
    expect(body.data.rows[0].dailyDeposit).toBeCloseTo(150, 2);
  });
});

// ─── GET /api/v1/reports/daily-dispatch ──────────────────────────────────────
//
// Matrix view used by the daily dispatch summary screen and the stock balance
// page. Brand columns × salesperson rows with qty/price cells.

test.describe('GET /api/v1/reports/daily-dispatch', () => {
  const ACTIVE_PRODUCTS = [
    { id: 1,  name: 'Toned 500ml', brandId: 1, brand: { id: 1, name: 'Nandini', displayOrder: 1 }, displayOrder: 1, unitsPerContainer: 20, category: 'Milk' },
    { id: 2,  name: 'Curd 200g',   brandId: 1, brand: { id: 1, name: 'Nandini', displayOrder: 1 }, displayOrder: 2, unitsPerContainer: null, category: 'Curd' },
    { id: 10, name: 'Ghee 500ml',  brandId: 2, brand: { id: 2, name: 'Jersey',  displayOrder: 2 }, displayOrder: 1, unitsPerContainer: null, category: 'Ghee' },
  ];

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30');
    expect(res.status()).toBe(403);
  });

  test('returns 400 when date is missing', async ({ request }) => {
    const res = await request.get('/api/v1/reports/daily-dispatch', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with brand columns, salesperson rows, and per-product totals', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([
      {
        id: 100, totalAmount: 600, isSubmitted: true, isAdminUnlocked: false,
        salesperson: { id: 5, name: 'Alice' },
        items: [
          { productId: 1,  product: { id: 1,  brandId: 1 }, quantity: 10, unitPrice: 40 },
          { productId: 10, product: { id: 10, brandId: 2 }, quantity: 2,  unitPrice: 100 },
        ],
      },
      {
        id: 101, totalAmount: 200, isSubmitted: false, isAdminUnlocked: false,
        salesperson: { id: 6, name: 'Bob' },
        items: [
          { productId: 1, product: { id: 1, brandId: 1 }, quantity: 5, unitPrice: 40 },
        ],
      },
    ]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.brands).toHaveLength(2);
    expect(body.data.brands[0].brandName).toBe('Nandini');
    expect(body.data.brands[1].brandName).toBe('Jersey');
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.totals[1]).toBe(15); // 10 + 5
    expect(body.data.totals[10]).toBe(2);
  });

  test('isLocked=true when isSubmitted and not isAdminUnlocked', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([
      {
        id: 1, totalAmount: 100, isSubmitted: true, isAdminUnlocked: false,
        salesperson: { id: 1, name: 'A' },
        items: [{ productId: 1, product: { id: 1, brandId: 1 }, quantity: 1, unitPrice: 40 }],
      },
    ]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data.rows[0].isLocked).toBe(true);
  });

  test('isLocked=false when admin has unlocked', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([
      {
        id: 1, totalAmount: 100, isSubmitted: true, isAdminUnlocked: true,
        salesperson: { id: 1, name: 'A' },
        items: [{ productId: 1, product: { id: 1, brandId: 1 }, quantity: 1, unitPrice: 40 }],
      },
    ]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data.rows[0].isLocked).toBe(false);
  });

  test('items whose productId is not in active list are filtered out', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([
      {
        id: 1, totalAmount: 100, isSubmitted: false, isAdminUnlocked: false,
        salesperson: { id: 1, name: 'A' },
        items: [
          { productId: 1,    product: { id: 1,    brandId: 1 }, quantity: 5, unitPrice: 40 },
          { productId: 9999, product: { id: 9999, brandId: 1 }, quantity: 3, unitPrice: 40 }, // not in active list
        ],
      },
    ]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data.rows[0].items[1]).toBeDefined();
    expect(body.data.rows[0].items[9999]).toBeUndefined();
    expect(body.data.totals[9999]).toBeUndefined();
  });

  test('returns 200 with empty rows when no dispatches for date', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toEqual([]);
    expect(body.data.brands).toHaveLength(2);
  });

  // Stock Balance page: the column set must include every product received that
  // day, not just salesperson-dispatchable ones, so the "Received" total can't
  // silently drop non-dispatchable products.
  test('includeReceipts=1 widens the column query to products with receipts that day', async ({ request }) => {
    let capturedWhere = null;
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
      capturedWhere = args.where;
      return ACTIVE_PRODUCTS;
    });

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30&includeReceipts=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(capturedWhere.OR).toEqual([
      { showInStockReceipt: true, salespersonEnabled: true },
      { stockReceipts: { some: { receiptDate: new Date('2026-04-30') } } },
    ]);
  });

  test('default path keeps the narrow salesperson-only column query', async ({ request }) => {
    let capturedWhere = null;
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockImplementation(async (args) => {
      capturedWhere = args.where;
      return ACTIVE_PRODUCTS;
    });

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    expect(capturedWhere.OR).toBeUndefined();
    expect(capturedWhere.showInStockReceipt).toBe(true);
    expect(capturedWhere.salespersonEnabled).toBe(true);
  });

  // ── Dispatcher access + isDayFinalized ──────────────────────────────────
  // This is the one report endpoint a dispatcher may read (both Daily Stock
  // Balance Summary and the Daily Salesman Dispatch Sheet call it) — and the
  // only place the day-level finalization flag needs to travel to the client.

  test('returns 200 for a dispatcher token', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(200);
  });

  test('isDayFinalized is true for a past date, with no finalization row needed', async ({ request }) => {
    let called = false;
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockImplementation(async () => {
      called = true;
      return null;
    });

    const res = await request.get('/api/v1/reports/daily-dispatch?date=2026-04-30', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data.isDayFinalized).toBe(true);
    expect(called).toBe(false);
  });

  test('isDayFinalized is false for today with no finalization row', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue(null);

    const res = await request.get(`/api/v1/reports/daily-dispatch?date=${getIndiaDateStr()}`, {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data.isDayFinalized).toBe(false);
  });

  test('isDayFinalized is true for today once a finalization row exists', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    ctx.mockPrisma.product.findMany.mockResolvedValue(ACTIVE_PRODUCTS);
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({
      id: 1, date: new Date(getIndiaDateStr()), finalizedByAdminUserId: 2, isAuto: false,
    });

    const res = await request.get(`/api/v1/reports/daily-dispatch?date=${getIndiaDateStr()}`, {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    const body = await res.json();
    expect(body.data.isDayFinalized).toBe(true);
  });
});
