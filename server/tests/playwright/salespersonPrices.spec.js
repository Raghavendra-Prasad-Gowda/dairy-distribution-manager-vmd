'use strict';

/**
 * Salesperson Prices API Tests
 * Covers: GET /:id/prices, POST /:id/prices/bulk /api/v1/salespeople
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const PRODUCT = {
  id: 1, brandId: 1, name: 'Milk 500ml', isActive: true,
  brand: { id: 1, name: 'Nandini' },
};

const PRICE_ROW = {
  id: 1, salespersonId: 1, productId: 1,
  sellingPrice: 25, effectiveFrom: new Date('2026-04-01'),
};

// ─── GET /api/v1/salespeople/:id/prices ──────────────────────────────────────

test.describe('GET /api/v1/salespeople/:id/prices', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/1/prices');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with price list for a salesperson', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([PRICE_ROW]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty('sellingPrice', 25);
  });

  test('returns 200 with null sellingPrice when no price set', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]); // no prices
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty('sellingPrice', null);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.get('/api/v1/salespeople/abc/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('GET splits price rows into current (latest <= today) and upcoming (earliest > today)', async ({ request }) => {
    // Three price rows: a past, an "in-effect-since" current, and a future.
    // Response must surface the latest <=today as `sellingPrice`+`effectiveFrom`,
    // and the earliest >today as `upcomingSellingPrice`+`upcomingEffectiveFrom`.
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const past   = new Date(today); past.setDate(past.getDate() - 30);
    const future = new Date(today); future.setDate(future.getDate() + 7);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([
      // desc order
      { productId: 1, sellingPrice: 30, effectiveFrom: future },
      { productId: 1, sellingPrice: 25, effectiveFrom: new Date(today) },
      { productId: 1, sellingPrice: 20, effectiveFrom: past },
    ]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row.sellingPrice).toBe(25);
    expect(row.upcomingSellingPrice).toBe(30);
    expect(String(row.effectiveFrom).slice(0, 10)).toBe(today);
    expect(row.upcomingEffectiveFrom).toBeTruthy();
  });

  test('GET returns upcoming=null when no future-scheduled price exists', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([
      { productId: 1, sellingPrice: 25, effectiveFrom: new Date(today) },
    ]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row.sellingPrice).toBe(25);
    expect(row.upcomingSellingPrice).toBeNull();
    expect(row.upcomingEffectiveFrom).toBeNull();
  });
});

// ─── POST /api/v1/salespeople/:id/prices/bulk ────────────────────────────────

test.describe('POST /api/v1/salespeople/:id/prices/bulk', () => {
  // Effective dates must be today (IST) or later — past dates are rejected.
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const future = (days = 7) => {
    const d = new Date(today());
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA');
  };
  const validPayload = () => ({
    effectiveFrom: today(),
    prices: [{ productId: 1, sellingPrice: 25 }],
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  // A salesman must never rewrite what they're billed. This router is mounted
  // without a router-level requireAdmin (GET /:id/prices has to stay open to
  // them), so this asserts the per-route guard actually holds.
  test('returns 403 when salesman token provided — even for their own id', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when prices are saved', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([PRICE_ROW]);

    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload(),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/prices saved/);
  });

  test('returns 400 when effectiveFrom is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { prices: [{ productId: 1, sellingPrice: 25 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when effectiveFrom format is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { effectiveFrom: '01-04-2026', prices: [{ productId: 1, sellingPrice: 25 }] },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when prices array is missing', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { effectiveFrom: today() },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when effectiveFrom is a past date (today-or-later validation)', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { effectiveFrom: '2020-01-01', prices: [{ productId: 1, sellingPrice: 25 }] },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error || body.errors || JSON.stringify(body)).toMatch(/today or later/i);
  });

  test('returns 400 when per-item effectiveFrom is a past date', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: today(),
        prices: [{ productId: 1, sellingPrice: 25, effectiveFrom: '2020-01-01' }],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/abc/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload(),
    });
    expect(res.status()).toBe(400);
  });

  test('today-dated save preserves an existing future-scheduled row (no deleteMany)', async ({ request }) => {
    // Saving today's price must NOT wipe a previously-scheduled future change.
    // The two prices are independent: today's becomes the new current, the
    // future schedule still kicks in on its date.
    let deleteCalled = false;
    let upsertArgs = null;
    ctx.mockPrisma.salespersonPrice.deleteMany.mockImplementation(async () => {
      deleteCalled = true;
      return { count: 0 };
    });
    ctx.mockPrisma.salespersonPrice.upsert.mockImplementation(async (args) => {
      upsertArgs = args;
      return {};
    });

    const res = await request.post('/api/v1/salespeople/5/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: today(),
        prices: [{ productId: 42, sellingPrice: 30, effectiveFrom: today() }],
      },
    });

    expect(res.status()).toBe(200);
    expect(deleteCalled).toBe(false);
    expect(upsertArgs.where.salespersonId_productId_effectiveFrom.effectiveFrom.toISOString().slice(0, 10)).toBe(today());
  });

  test('future-dated save replaces existing future row (only one upcoming at a time)', async ({ request }) => {
    let deleteArgs = null;
    let upsertArgs = null;
    ctx.mockPrisma.salespersonPrice.deleteMany.mockImplementation(async (args) => {
      deleteArgs = args;
      return { count: 1 };
    });
    ctx.mockPrisma.salespersonPrice.upsert.mockImplementation(async (args) => {
      upsertArgs = args;
      return {};
    });

    const futureDate = future(14);
    const res = await request.post('/api/v1/salespeople/5/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: futureDate,
        prices: [{ productId: 42, sellingPrice: 30, effectiveFrom: futureDate }],
      },
    });

    expect(res.status()).toBe(200);
    expect(deleteArgs).not.toBeNull();
    expect(deleteArgs.where).toMatchObject({ salespersonId: 5, productId: 42 });
    // deleteMany targets other future rows: gt today, not the row we're upserting
    expect(deleteArgs.where.effectiveFrom.gt).toBeInstanceOf(Date);
    expect(deleteArgs.where.effectiveFrom.not).toBeInstanceOf(Date);
    expect(upsertArgs.where.salespersonId_productId_effectiveFrom.effectiveFrom.toISOString().slice(0, 10)).toBe(futureDate);
  });

  test('item without effectiveFrom falls back to the global date', async ({ request }) => {
    let upsertArgs = null;
    ctx.mockPrisma.salespersonPrice.upsert.mockImplementation(async (args) => {
      upsertArgs = args;
      return {};
    });

    const todayStr = today();
    const res = await request.post('/api/v1/salespeople/5/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: todayStr,
        prices: [{ productId: 42, sellingPrice: 30 }], // no per-item effectiveFrom
      },
    });

    expect(res.status()).toBe(200);
    expect(upsertArgs.where.salespersonId_productId_effectiveFrom.effectiveFrom.toISOString().slice(0, 10)).toBe(todayStr);
  });
});

// ─── Display order fields — used by the salesman pricing UI for sorted layout ──

test.describe('GET /api/v1/salespeople/:id/prices — display order fields', () => {
  const PRODUCT_FULL = {
    id: 1, name: 'Toned 500ml', brandId: 10,
    brand: { id: 10, name: 'Nandini', displayOrder: 1 },
    category: 'Milk', displayOrder: 4,
    isActive: true, showInStockReceipt: true,
    salespersonEnabled: true, salespersonDefaultPrice: '50.00',
    costPrice: '22.00', sellingPrice: '24.00',
    unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
  };

  test('response includes displayOrder field from product', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_FULL]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row).toHaveProperty('displayOrder', 4);
  });

  test('categoryDisplayOrder is computed from category.findMany lookup', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_FULL]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 10, name: 'Milk', displayOrder: 3 },
      { brandId: 10, name: 'Curd', displayOrder: 6 },
    ]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row).toHaveProperty('categoryDisplayOrder', 3);
  });

  test('categoryDisplayOrder defaults to 999 when no matching category', async ({ request }) => {
    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_FULL]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    // Only a category for a different brand
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 99, name: 'Milk', displayOrder: 1 },
    ]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row).toHaveProperty('categoryDisplayOrder', 999);
  });

  test('multiple products receive correct per-category display orders', async ({ request }) => {
    const MILK_PRODUCT = { ...PRODUCT_FULL, id: 1, name: 'Toned Milk', category: 'Milk', displayOrder: 1 };
    const CURD_PRODUCT = {
      ...PRODUCT_FULL, id: 2, name: 'Curd 400g', category: 'Curd', displayOrder: 1,
    };
    ctx.mockPrisma.product.findMany.mockResolvedValue([MILK_PRODUCT, CURD_PRODUCT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([
      { brandId: 10, name: 'Milk', displayOrder: 1 },
      { brandId: 10, name: 'Curd', displayOrder: 2 },
    ]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    const milk = data.find(p => p.productId === 1);
    const curd = data.find(p => p.productId === 2);
    expect(milk.categoryDisplayOrder).toBe(1);
    expect(curd.categoryDisplayOrder).toBe(2);
  });
});

// ─── GET response shape contract — used by the admin prices UI ───────────────

test.describe('GET /api/v1/salespeople/:id/prices — UI contract', () => {
  test('response carries the fields the admin Edit Price modal reads', async ({ request }) => {
    // The pencil-edit modal renders: productName, brandName, category,
    // unitType, unitSize, containerType, unitsPerContainer, dairyCostPrice,
    // dairySellingPrice, sellingPrice (current), effectiveFrom (current).
    // Locking the shape so a casual controller refactor can't silently drop a
    // field the UI depends on.
    ctx.mockPrisma.product.findMany.mockResolvedValue([{
      id: 1, name: 'Toned 500ml', brandId: 10, brand: { id: 10, name: 'Nandini', displayOrder: 1 },
      category: 'Milk', displayOrder: 1,
      unitType: 'ml', unitSize: 500, containerType: 'crate', unitsPerContainer: 20,
      showInStockReceipt: true, salespersonEnabled: true,
      costPrice: 22, sellingPrice: 24,
    }]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([
      { id: 99, productId: 1, sellingPrice: 25, effectiveFrom: new Date('2026-05-01') },
    ]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/5/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const row = (await res.json()).data[0];
    expect(row).toMatchObject({
      productId:         1,
      productName:       'Toned 500ml',
      brandId:           10,
      brandName:         'Nandini',
      category:          'Milk',
      unitType:          'ml',
      unitSize:          500,
      containerType:     'crate',
      unitsPerContainer: 20,
      dairyCostPrice:    22,
      dairySellingPrice: 24,
      sellingPrice:      25,
    });
    expect(row.effectiveFrom).toBeTruthy();
    expect(String(row.effectiveFrom).slice(0, 10)).toBe('2026-05-01');
  });
});

// ─── Global Default Price Fallback Tests ─────────────────────────────────────

test.describe('Global default price fallback behavior', () => {
  test('returns global salespersonDefaultPrice when no custom price exists', async ({ request }) => {
    const PRODUCT_WITH_GLOBAL_DEFAULT = {
      id: 1, brandId: 1, name: 'Nandini Milk', isActive: true,
      showInStockReceipt: true,
      salespersonEnabled: true,
      salespersonDefaultPrice: '50.00',
      costPrice: '30.00',
      sellingPrice: '45.00',
      brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    };

    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_WITH_GLOBAL_DEFAULT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].sellingPrice).toBe(50); // Falls back to global default
  });

  test('custom price takes precedence over global default', async ({ request }) => {
    const PRODUCT_WITH_GLOBAL_DEFAULT = {
      id: 1, brandId: 1, name: 'Nandini Milk', isActive: true,
      showInStockReceipt: true,
      salespersonEnabled: true,
      salespersonDefaultPrice: '50.00',
      costPrice: '30.00',
      sellingPrice: '45.00',
      brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    };

    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_WITH_GLOBAL_DEFAULT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([
      { productId: 1, salespersonId: 1, sellingPrice: '48.00', effectiveFrom: new Date(today) },
    ]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].sellingPrice).toBe(48); // Custom price, not global default
  });

  test('returns zero when no custom price and global default is zero', async ({ request }) => {
    const PRODUCT_NO_DEFAULT = {
      id: 1, brandId: 1, name: 'Nandini Milk', isActive: true,
      showInStockReceipt: true,
      salespersonEnabled: true,
      salespersonDefaultPrice: '0.00',
      costPrice: '30.00',
      sellingPrice: '45.00',
      brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    };

    ctx.mockPrisma.product.findMany.mockResolvedValue([PRODUCT_NO_DEFAULT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].sellingPrice).toBe(0); // No fallback if global default is 0
  });

  test('globally disabled product without per-salesman exception is excluded from salesman view', async ({ request }) => {
    const ENABLED_PRODUCT = {
      id: 1, brandId: 1, name: 'Nandini Milk', isActive: true,
      showInStockReceipt: true,
      salespersonEnabled: true,
      salespersonDefaultPrice: '50.00',
      costPrice: '30.00',
      sellingPrice: '45.00',
      displayOrder: 1,
      unitType: 'piece',
      unitSize: 500,
      containerType: 'bottle',
      unitsPerContainer: 12,
      brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    };

    const DISABLED_PRODUCT = {
      id: 2, brandId: 1, name: 'Jersey Milk', isActive: true,
      showInStockReceipt: true,
      salespersonEnabled: false, // Globally disabled
      salespersonDefaultPrice: '0.00',
      costPrice: '35.00',
      sellingPrice: '48.00',
      displayOrder: 2,
      unitType: 'piece',
      unitSize: 1000,
      containerType: 'pouch',
      unitsPerContainer: 10,
      brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    };

    ctx.mockPrisma.product.findMany.mockResolvedValue([ENABLED_PRODUCT, DISABLED_PRODUCT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: 1, isEnabled: true },
      // No per-salesman exception for product 2 — salespersonEnabled:false defaults to hidden
    ]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].productId).toBe(1);
  });

  test('globally enabled product shows with isEnabled flag', async ({ request }) => {
    const GLOBAL_ENABLED_PRODUCT = {
      id: 1, brandId: 1, name: 'Nandini Milk', isActive: true,
      showInStockReceipt: true,
      salespersonEnabled: true, // Globally enabled
      salespersonDefaultPrice: '50.00',
      costPrice: '30.00',
      sellingPrice: '45.00',
      brand: { id: 1, name: 'Nandini', displayOrder: 1 },
    };

    ctx.mockPrisma.product.findMany.mockResolvedValue([GLOBAL_ENABLED_PRODUCT]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([
      { productId: 1, isEnabled: true },
    ]);
    ctx.mockPrisma.salespersonPrice.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data[0].salespersonEnabled).toBe(true);
    expect(body.data[0].isEnabled).toBe(true);
  });
});
