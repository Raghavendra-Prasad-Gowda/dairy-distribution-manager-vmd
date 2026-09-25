'use strict';

/**
 * utils/billFormat.js — Brand → Category → Product aggregation for the
 * printed bill. Pure functions, tested directly (no HTTP/Prisma needed) —
 * see depositRules.spec.js and productLayout.spec.js for the same
 * convention.
 *
 * bills.spec.js exercises this module end-to-end through /bills/preview with
 * a representative fixture; this file pins the aggregation edge cases
 * (multiple products per category, multiple categories per brand, multiple
 * brands, unit conversion, the divide-by-zero rate guard) that a
 * Prisma-shaped fixture would be awkward to hit precisely.
 */

const { test, expect } = require('@playwright/test');
const { buildBillLines, unitLabel, measureOf } = require('../../utils/billFormat');

// ─── unitLabel / measureOf ──────────────────────────────────────────────────────

test.describe('unitLabel', () => {
  test('maps ml to litres and gram to kilograms', () => {
    expect(unitLabel('ml')).toBe('ltr');
    expect(unitLabel('gram')).toBe('kg');
  });

  test('falls back to pieces for anything else', () => {
    expect(unitLabel('piece')).toBe('pcs');
    expect(unitLabel(null)).toBe('pcs');
    expect(unitLabel(undefined)).toBe('pcs');
  });
});

test.describe('measureOf', () => {
  test('converts an ml product to litres', () => {
    expect(measureOf({ quantity: 10, unitType: 'ml', unitSize: 500 })).toBe(5);
  });

  test('converts a gram product to kilograms', () => {
    expect(measureOf({ quantity: 4, unitType: 'gram', unitSize: 250 })).toBe(1);
  });

  test('falls back to raw quantity when unitSize is missing despite an ml/gram unitType', () => {
    expect(measureOf({ quantity: 7, unitType: 'ml', unitSize: null })).toBe(7);
  });

  test('treats a missing quantity as zero', () => {
    expect(measureOf({ unitType: 'piece' })).toBe(0);
  });
});

// ─── buildBillLines ─────────────────────────────────────────────────────────────

test.describe('buildBillLines', () => {
  test('returns no brands and a zero total for an empty period', () => {
    const { brands, totalAmount } = buildBillLines([]);
    expect(brands).toEqual([]);
    expect(totalAmount).toBe(0);
  });

  test('lists a single product under its category and brand, with a derived rate', () => {
    const { brands, totalAmount } = buildBillLines([
      { brandName: 'Nandini', category: 'Milk', productName: 'Toned Milk 500ml', quantity: 100, totalAmount: 5200, unitType: 'ml', unitSize: 500 },
    ]);
    expect(brands).toEqual([{
      brandName: 'Nandini',
      categories: [{
        categoryName: 'Milk',
        products: [{ productName: 'Toned Milk 500ml', unit: 'ltr', quantity: 50, rate: 104, amount: 5200 }],
        amount: 5200,
      }],
      amount: 5200,
    }]);
    expect(totalAmount).toBe(5200);
  });

  test('keeps two different products separate under the same category', () => {
    const { brands } = buildBillLines([
      { brandName: 'Nandini', category: 'Milk', productName: 'Toned Milk 500ml', quantity: 6650, totalAmount: 172900, unitType: 'ml', unitSize: 500 },
      { brandName: 'Nandini', category: 'Milk', productName: 'Full Cream Milk 500ml', quantity: 200, totalAmount: 6000, unitType: 'ml', unitSize: 500 },
    ]);
    const milk = brands[0].categories.find((c) => c.categoryName === 'Milk');
    // Neither item sets a displayOrder, so both default equal and the tie
    // breaks alphabetically — "Full Cream" before "Toned Milk".
    expect(milk.products.map((p) => p.productName)).toEqual(['Full Cream Milk 500ml', 'Toned Milk 500ml']);
    const tonedMilk = milk.products.find((p) => p.productName === 'Toned Milk 500ml');
    expect(tonedMilk).toMatchObject({ quantity: 3325, rate: 52, amount: 172900 });
    const fullCream = milk.products.find((p) => p.productName === 'Full Cream Milk 500ml');
    expect(fullCream).toMatchObject({ quantity: 100, rate: 60, amount: 6000 });
    expect(milk.amount).toBe(178900);
  });

  test('sums repeated dispatches of the same product across the period into one row', () => {
    const { brands } = buildBillLines([
      { brandName: 'Nandini', category: 'Milk', productName: 'Toned Milk 500ml', quantity: 100, totalAmount: 5200, unitType: 'ml', unitSize: 500 },
      { brandName: 'Nandini', category: 'Milk', productName: 'Toned Milk 500ml', quantity: 200, totalAmount: 10400, unitType: 'ml', unitSize: 500 },
    ]);
    const products = brands[0].categories[0].products;
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ quantity: 150, amount: 15600, rate: 104 });
  });

  test('groups multiple categories under one brand and multiple brands separately', () => {
    const { brands, totalAmount } = buildBillLines([
      { brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'Toned Milk', quantity: 100, totalAmount: 5000, unitType: 'ml', unitSize: 500 },
      { brandName: 'Nandini', brandDisplayOrder: 1, category: 'Curd', categoryDisplayOrder: 2, productName: 'Curd Cup',   quantity: 40,  totalAmount: 2000, unitType: 'ml', unitSize: 500 },
      { brandName: 'Jersey',  brandDisplayOrder: 2, category: 'Milk', categoryDisplayOrder: 1, productName: 'HTM 1L',     quantity: 20,  totalAmount: 900,  unitType: 'ml', unitSize: 1000 },
    ]);
    expect(brands.map((b) => b.brandName)).toEqual(['Nandini', 'Jersey']);
    const nandini = brands.find((b) => b.brandName === 'Nandini');
    expect(nandini.categories.map((c) => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(totalAmount).toBe(7900);
  });

  test('sorts brands, categories and products by display order, falling back to name', () => {
    const { brands } = buildBillLines([
      { brandName: 'Jersey',  brandDisplayOrder: 2, category: 'Milk', productName: 'HTM',  quantity: 1, totalAmount: 40, unitType: 'piece' },
      { brandName: 'Nandini', brandDisplayOrder: 1, category: 'Curd', categoryDisplayOrder: 2, productName: 'Curd', quantity: 1, totalAmount: 40, unitType: 'piece' },
      { brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'Full Cream', displayOrder: 2, quantity: 1, totalAmount: 40, unitType: 'piece' },
      { brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'Toned Milk', displayOrder: 1, quantity: 1, totalAmount: 40, unitType: 'piece' },
    ]);
    expect(brands.map((b) => b.brandName)).toEqual(['Nandini', 'Jersey']);
    expect(brands[0].categories.map((c) => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(brands[0].categories[0].products.map((p) => p.productName)).toEqual(['Toned Milk', 'Full Cream']);
  });

  test('falls back to "Uncategorized" for a product with no category, without crashing the sort', () => {
    const { brands } = buildBillLines([
      { brandName: 'Nandini', category: null, productName: 'Misc Item', quantity: 1, totalAmount: 50, unitType: 'piece' },
    ]);
    expect(brands[0].categories[0].categoryName).toBe('Uncategorized');
  });

  test('never divides by zero when quantity nets to zero but amount does not', () => {
    // Guards `quantity ? amount / quantity : null` — without it this would
    // print "Infinity/ltr" on the bill instead of a blank rate.
    const { brands } = buildBillLines([
      { brandName: 'Nandini', category: 'Milk', productName: 'Toned Milk', quantity: 0, totalAmount: 100, unitType: 'ml', unitSize: 500 },
    ]);
    const product = brands[0].categories[0].products[0];
    expect(product.quantity).toBe(0);
    expect(product.rate).toBeNull();
    expect(product.amount).toBe(100);
  });

  test('collapses float noise from summing many small quantities to a clean 2dp figure', () => {
    const items = Array.from({ length: 7 }, () => (
      { brandName: 'Nandini', category: 'Milk', productName: 'Toned Milk', quantity: 1, totalAmount: 5.2, unitType: 'ml', unitSize: 100 }
    ));
    const { brands, totalAmount } = buildBillLines(items);
    expect(brands[0].categories[0].products[0].quantity).toBe(0.7); // 7 × 0.1 litre, not float noise
    expect(totalAmount).toBe(36.4);
  });

  test('bills a piece product without a unit conversion', () => {
    const { brands } = buildBillLines([
      { brandName: 'Nandini', category: 'Ghee', productName: 'Ghee 500ml Tin', quantity: 12, totalAmount: 7200, unitType: 'piece', unitSize: null },
    ]);
    expect(brands[0].categories[0].products[0]).toMatchObject({ unit: 'pcs', quantity: 12, rate: 600, amount: 7200 });
  });
});
