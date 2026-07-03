'use strict';

/**
 * Salesperson Prices API Tests
 * Covers: GET /:id/prices, POST /:id/prices/bulk /api/v1/salespeople
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

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
