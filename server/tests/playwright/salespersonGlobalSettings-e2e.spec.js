'use strict';

/**
 * Salesman User Global Settings E2E Tests
 *
 * End-to-end scenarios testing how salesman users interact with global
 * product settings changes:
 * - Admin changes global price, salesman sees update
 * - Admin disables product globally, salesman no longer sees it
 * - Admin enables product, salesman gets access with default price
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── E2E: Admin changes global price, salesman sees update ────────────────────

test.describe('E2E: Global price changes propagate to salesman view', () => {
  test('salesman fetches prices and uses global default when no custom price', async ({ request }) => {
    const PRODUCT_ID = 1;
    const SALESMAN_ID = 5;
    const salesmanToken = makeSalesmanToken(SALESMAN_ID);
    const adminToken = makeAuthToken();

    // Setup: Product is enabled globally with default price 50
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: 'Nandini Toned Milk 500ml',
        brandId: 1,
        brand: { id: 1, name: 'Nandini', displayOrder: 1 },
        category: 'Milk',
        displayOrder: 1,
        unitType: 'piece',
        unitSize: 500,
        containerType: 'bottle',
        unitsPerContainer: 12,
        showInStockReceipt: true,
        salespersonEnabled: true,
        salespersonDefaultPrice: '50.00',
        costPrice: '30.00',
        sellingPrice: '45.00',
      },
    ]);

    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, isEnabled: true },
    ]);

    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]); // No custom price
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 1, name: 'Milk', displayOrder: 1 },
    ]);

    // Salesman fetches prices
    const res = await request.get(`/api/v1/salespeople/${SALESMAN_ID}/prices`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const product = body.data.find(p => p.productId === PRODUCT_ID);

    // Verify fallback to global default price
    expect(product).toBeDefined();
    expect(product.sellingPrice).toBe(50); // Falls back to salespersonDefaultPrice
    expect(product.isEnabled).toBe(true);
  });

  test('salesman custom price overrides global default', async ({ request }) => {
    const PRODUCT_ID = 1;
    const SALESMAN_ID = 5;
    const salesmanToken = makeSalesmanToken(SALESMAN_ID);

    ctx.mockPrisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: 'Nandini Toned Milk 500ml',
        brandId: 1,
        brand: { id: 1, name: 'Nandini', displayOrder: 1 },
        category: 'Milk',
        displayOrder: 1,
        unitType: 'piece',
        unitSize: 500,
        containerType: 'bottle',
        unitsPerContainer: 12,
        showInStockReceipt: true,
        salespersonEnabled: true,
        salespersonDefaultPrice: '50.00',
        costPrice: '30.00',
        sellingPrice: '45.00',
      },
    ]);

    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, isEnabled: true },
    ]);

    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    todayIST.setUTCHours(0, 0, 0, 0);

    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([
      {
        productId: PRODUCT_ID,
        salespersonId: SALESMAN_ID,
        sellingPrice: '48.00',
        effectiveFrom: todayIST,
      },
    ]);

    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 1, name: 'Milk', displayOrder: 1 },
    ]);

    // Salesman fetches prices
    const res = await request.get(`/api/v1/salespeople/${SALESMAN_ID}/prices`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const product = body.data.find(p => p.productId === PRODUCT_ID);

    // Verify custom price takes precedence
    expect(product).toBeDefined();
    expect(product.sellingPrice).toBe(48); // Custom price, not global default
  });
});

// ─── E2E: Admin disables product globally, salesman no longer sees it ────────

test.describe('E2E: Global disable filters from salesman view', () => {
  test('product disabled globally is excluded from salesman price list', async ({ request }) => {
    const PRODUCT_ID = 2;
    const SALESMAN_ID = 5;
    const salesmanToken = makeSalesmanToken(SALESMAN_ID);

    // Setup: Product is disabled globally (salespersonEnabled: false)
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Enabled Product',
        brandId: 1,
        brand: { id: 1, name: 'Nandini', displayOrder: 1 },
        category: 'Milk',
        displayOrder: 1,
        unitType: 'piece',
        unitSize: 500,
        containerType: 'bottle',
        unitsPerContainer: 12,
        showInStockReceipt: true,
        salespersonEnabled: true,
        salespersonDefaultPrice: '50.00',
        costPrice: '30.00',
        sellingPrice: '45.00',
      },
      {
        id: PRODUCT_ID,
        name: 'Disabled Product',
        brandId: 1,
        brand: { id: 1, name: 'Nandini', displayOrder: 1 },
        category: 'Milk',
        displayOrder: 2,
        unitType: 'piece',
        unitSize: 500,
        containerType: 'bottle',
        unitsPerContainer: 12,
        showInStockReceipt: true,
        salespersonEnabled: false, // Disabled globally
        salespersonDefaultPrice: '0.00',
        costPrice: '30.00',
        sellingPrice: '45.00',
      },
    ]);

    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: 1, isEnabled: true },
      { productId: PRODUCT_ID, isEnabled: true }, // Even if enabled per-salesman
    ]);

    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 1, name: 'Milk', displayOrder: 1 },
    ]);

    // Salesman fetches prices
    const res = await request.get(`/api/v1/salespeople/${SALESMAN_ID}/prices`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Verify disabled product is excluded
    const disabledProduct = body.data.find(p => p.productId === PRODUCT_ID);
    expect(disabledProduct).toBeUndefined();

    // Verify enabled product is included
    const enabledProduct = body.data.find(p => p.productId === 1);
    expect(enabledProduct).toBeDefined();
  });

  test('admin can re-enable product and salesman immediately sees it', async ({ request }) => {
    const PRODUCT_ID = 2;
    const SALESMAN_ID = 5;
    const salesmanToken = makeSalesmanToken(SALESMAN_ID);
    const adminToken = makeAuthToken();

    // Setup: Product now enabled globally with default price
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: 'Nandini Toned Milk 500ml',
        brandId: 1,
        brand: { id: 1, name: 'Nandini', displayOrder: 1 },
        category: 'Milk',
        displayOrder: 1,
        unitType: 'piece',
        unitSize: 500,
        containerType: 'bottle',
        unitsPerContainer: 12,
        showInStockReceipt: true,
        salespersonEnabled: true, // Re-enabled
        salespersonDefaultPrice: '55.00',
        costPrice: '30.00',
        sellingPrice: '45.00',
      },
    ]);

    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, isEnabled: true },
    ]);

    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 1, name: 'Milk', displayOrder: 1 },
    ]);

    // Salesman fetches prices
    const res = await request.get(`/api/v1/salespeople/${SALESMAN_ID}/prices`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const product = body.data.find(p => p.productId === PRODUCT_ID);

    // Verify product is visible and uses global default price
    expect(product).toBeDefined();
    expect(product.salespersonEnabled).toBe(true);
    expect(product.sellingPrice).toBe(55);
  });
});

// ─── E2E: Admin enables product, salesman gets access with default ──────────

test.describe('E2E: Global enable grants salesman access', () => {
  test('admin enables product with default price, salesman can now see it', async ({ request }) => {
    const PRODUCT_ID = 3;
    const SALESMAN_ID = 5;
    const salesmanToken = makeSalesmanToken(SALESMAN_ID);
    const adminToken = makeAuthToken();

    // Setup: Product now enabled globally
    ctx.mockPrisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: 'Jersey Milk 1L',
        brandId: 2,
        brand: { id: 2, name: 'Jersey', displayOrder: 2 },
        category: 'Milk',
        displayOrder: 1,
        unitType: 'piece',
        unitSize: 1000,
        containerType: 'pouch',
        unitsPerContainer: 10,
        showInStockReceipt: true,
        salespersonEnabled: true,
        salespersonDefaultPrice: '60.00',
        costPrice: '35.00',
        sellingPrice: '55.00',
      },
    ]);

    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, isEnabled: true },
    ]);

    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 2, name: 'Milk', displayOrder: 1 },
    ]);

    // Salesman can fetch the product
    const res = await request.get(`/api/v1/salespeople/${SALESMAN_ID}/prices`, {
      headers: { Authorization: `Bearer ${salesmanToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const product = body.data.find(p => p.productId === PRODUCT_ID);

    // Verify product is visible with global default price
    expect(product).toBeDefined();
    expect(product.salespersonEnabled).toBe(true);
    expect(product.sellingPrice).toBe(60);
    expect(product.isEnabled).toBe(true);
  });
});
