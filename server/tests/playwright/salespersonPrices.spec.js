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

  test('filters effective_from in IST date space, not UTC instant (regression)', async ({ request }) => {
    // The bug: a price saved with effectiveFrom = today (IST) is stored as
    // today's UTC midnight. Between 00:00–05:30 IST the UTC clock is still
    // on yesterday, so a naive `lte: new Date()` filter would exclude the
    // freshly-saved price and the admin would see "no change" after saving.
    // The fix uses `lte: new Date(getIndiaDateStr())` — an IST-date upper bound.
    let findManyArgs = null;
    ctx.mockPrisma.product.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonProduct.findMany.mockResolvedValue([]);
    ctx.mockPrisma.category.findMany.mockResolvedValue([]);
    ctx.mockPrisma.salespersonPrice.findMany.mockImplementation(async (args) => {
      findManyArgs = args;
      return [];
    });

    const res = await request.get('/api/v1/salespeople/1/prices', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);

    const upperBound = findManyArgs.where.effectiveFrom.lte;
    // Upper bound must be midnight UTC of today's IST date (not "now" UTC).
    expect(upperBound).toBeInstanceOf(Date);
    expect(upperBound.getUTCHours()).toBe(0);
    expect(upperBound.getUTCMinutes()).toBe(0);
    expect(upperBound.getUTCSeconds()).toBe(0);
  });
});

// ─── POST /api/v1/salespeople/:id/prices/bulk ────────────────────────────────

test.describe('POST /api/v1/salespeople/:id/prices/bulk', () => {
  const validPayload = {
    effectiveFrom: '2026-04-01',
    prices: [{ productId: 1, sellingPrice: 25 }],
  };

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      data: validPayload,
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when prices are saved', async ({ request }) => {
    ctx.mockPrisma.$transaction.mockResolvedValue([PRICE_ROW]);

    const res = await request.post('/api/v1/salespeople/1/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
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
      data: { effectiveFrom: '2026-04-01' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for non-numeric salesperson ID', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople/abc/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: validPayload,
    });
    expect(res.status()).toBe(400);
  });

  test('save with earlier date supersedes later-dated rows for same (sp, product)', async ({ request }) => {
    // Bug fix regression: previously, editing to an earlier effective date
    // left the later-dated row in place, so the desc ordering on the GET
    // kept showing the later date — admin's change appeared not to take.
    // bulkSave now deleteMany's rows with effectiveFrom > the new date for
    // the same (salesperson, product), so the saved date is the latest.
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

    const res = await request.post('/api/v1/salespeople/5/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: '2026-05-23',
        prices: [{ productId: 42, sellingPrice: 30, effectiveFrom: '2026-05-23' }],
      },
    });

    expect(res.status()).toBe(200);
    expect(deleteArgs).not.toBeNull();
    expect(deleteArgs.where).toMatchObject({ salespersonId: 5, productId: 42 });
    expect(deleteArgs.where.effectiveFrom.gt).toBeInstanceOf(Date);
    expect(deleteArgs.where.effectiveFrom.gt.toISOString().slice(0, 10)).toBe('2026-05-23');
    expect(upsertArgs).not.toBeNull();
  });

  test('single-item save (per-row pencil edit) uses item.effectiveFrom for upsert key', async ({ request }) => {
    // The admin Prices page now saves one price at a time via the pencil-edit
    // modal. Each call posts a 1-item array with its own effectiveFrom. The
    // upsert must use that per-item date as the composite-key dimension so
    // editing a price for a NEW date creates a fresh historical row instead
    // of overwriting the previous one.
    let upsertArgs = null;
    ctx.mockPrisma.salespersonPrice.upsert.mockImplementation(async (args) => {
      upsertArgs = args;
      return { id: 1, salespersonId: 5, productId: 42, sellingPrice: 30, effectiveFrom: new Date('2026-05-24') };
    });

    const res = await request.post('/api/v1/salespeople/5/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: '2026-05-24',
        prices: [{ productId: 42, sellingPrice: 30, effectiveFrom: '2026-05-24' }],
      },
    });

    expect(res.status()).toBe(200);
    expect(upsertArgs).not.toBeNull();
    expect(upsertArgs.where.salespersonId_productId_effectiveFrom.salespersonId).toBe(5);
    expect(upsertArgs.where.salespersonId_productId_effectiveFrom.productId).toBe(42);
    // The composite-key date must come from item.effectiveFrom, parsed as UTC midnight
    const keyDate = upsertArgs.where.salespersonId_productId_effectiveFrom.effectiveFrom;
    expect(keyDate.toISOString().slice(0, 10)).toBe('2026-05-24');
    expect(upsertArgs.update.sellingPrice).toBe(30);
    expect(upsertArgs.create.sellingPrice).toBe(30);
  });

  test('item without effectiveFrom falls back to the global date', async ({ request }) => {
    // Backwards-compatibility: the contract still allows omitting per-item
    // effectiveFrom, in which case the controller uses the top-level
    // effectiveFrom for every item.
    let upsertArgs = null;
    ctx.mockPrisma.salespersonPrice.upsert.mockImplementation(async (args) => {
      upsertArgs = args;
      return {};
    });

    const res = await request.post('/api/v1/salespeople/5/prices/bulk', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {
        effectiveFrom: '2026-04-01',
        prices: [{ productId: 42, sellingPrice: 30 }], // no effectiveFrom
      },
    });

    expect(res.status()).toBe(200);
    expect(upsertArgs.where.salespersonId_productId_effectiveFrom.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-04-01');
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
      id: 1, name: 'Toned 500ml', brandId: 10, brand: { id: 10, name: 'Nandini', salespersonDisplayOrder: 1 },
      category: 'Milk', salespersonDisplayOrder: 1,
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
