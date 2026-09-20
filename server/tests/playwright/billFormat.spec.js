'use strict';

/**
 * utils/billFormat.js — category→row mapping, unit conversion and rate
 * derivation for the printed cash/credit bill. Pure functions, tested
 * directly (no HTTP/Prisma needed) — see depositRules.spec.js and
 * productLayout.spec.js for the same convention.
 *
 * bills.spec.js exercises this module end-to-end through /bills/preview with
 * a couple of representative fixtures; this file pins the specific edge
 * cases (alias normalization, the substring fallback, unit-guard branches)
 * that a Prisma-shaped fixture would be awkward to hit precisely.
 */

const { test, expect } = require('@playwright/test');
const { BILL_ROWS, resolveBillRow, measureOf, buildBillLines } = require('../../utils/billFormat');

// ─── resolveBillRow ────────────────────────────────────────────────────────────

test.describe('resolveBillRow', () => {
  test('maps every documented alias to its row', () => {
    expect(resolveBillRow('Milk')).toBe('MILK');
    expect(resolveBillRow('Milks')).toBe('MILK');
    expect(resolveBillRow('Toned Milk')).toBe('MILK');
    expect(resolveBillRow('Curd')).toBe('CURD');
    expect(resolveBillRow('Curds')).toBe('CURD');
    expect(resolveBillRow('Dahi')).toBe('CURD');
    expect(resolveBillRow('Ghee')).toBe('GHEE');
    expect(resolveBillRow('Butter')).toBe('BUTTER');
    expect(resolveBillRow('Panneer')).toBe('PANNEER / KOVA');
    expect(resolveBillRow('Paneer')).toBe('PANNEER / KOVA');
    expect(resolveBillRow('Kova')).toBe('PANNEER / KOVA');
    expect(resolveBillRow('Khova')).toBe('PANNEER / KOVA');
  });

  test('normalizes case and punctuation before matching', () => {
    expect(resolveBillRow('PANNEER/KOVA')).toBe('PANNEER / KOVA');
    expect(resolveBillRow('paneer & kova')).toBe('PANNEER / KOVA');
    expect(resolveBillRow('  CuRdS  ')).toBe('CURD');
  });

  test('falls back to a substring match for a category the pad never named exactly', () => {
    // Documented in billFormat.js's own header comment — "Milk 500ml
    // Pouches" still bills as MILK — but never exercised anywhere else.
    expect(resolveBillRow('Milk 500ml Pouches')).toBe('MILK');
    expect(resolveBillRow('Fresh Curd Cups')).toBe('CURD');
  });

  test('sends an unrecognized category to OTHERS', () => {
    expect(resolveBillRow('Lassi')).toBe('OTHERS');
    expect(resolveBillRow('Ice Cream')).toBe('OTHERS');
  });

  test('sends a missing category to OTHERS via the empty-key branch, not a false alias match', () => {
    expect(resolveBillRow(null)).toBe('OTHERS');
    expect(resolveBillRow(undefined)).toBe('OTHERS');
    expect(resolveBillRow('')).toBe('OTHERS');
    expect(resolveBillRow('   ')).toBe('OTHERS');
  });
});

// ─── measureOf ─────────────────────────────────────────────────────────────────

test.describe('measureOf', () => {
  test('converts an ml product to litres', () => {
    expect(measureOf({ quantity: 10, unitType: 'ml', unitSize: 500 })).toEqual({ unit: 'ltr', value: 5 });
  });

  test('converts a gram product to kilograms', () => {
    expect(measureOf({ quantity: 4, unitType: 'gram', unitSize: 250 })).toEqual({ unit: 'kg', value: 1 });
  });

  test('bills a piece product by raw quantity', () => {
    expect(measureOf({ quantity: 12, unitType: 'piece', unitSize: null })).toEqual({ unit: 'pcs', value: 12 });
  });

  test('falls back to pieces when unitSize is missing despite an ml/gram unitType', () => {
    // Guards `unitType === 'ml' && unitSize` — a product missing its size
    // must not be silently treated as 0 litres; it bills by raw count instead.
    expect(measureOf({ quantity: 7, unitType: 'ml', unitSize: null })).toEqual({ unit: 'pcs', value: 7 });
    expect(measureOf({ quantity: 7, unitType: 'gram', unitSize: 0 })).toEqual({ unit: 'pcs', value: 7 });
  });

  test('treats a missing quantity as zero', () => {
    expect(measureOf({ unitType: 'piece' })).toEqual({ unit: 'pcs', value: 0 });
  });
});

// ─── buildBillLines ─────────────────────────────────────────────────────────────

test.describe('buildBillLines', () => {
  test('always returns all six rows, in pad order, blank when nothing was supplied', () => {
    const { lines, totalAmount } = buildBillLines([]);
    expect(lines.map((l) => l.label)).toEqual(BILL_ROWS);
    expect(lines.every((l) => l.unit === null && l.quantity === null && l.rate === null && l.amount === 0)).toBe(true);
    expect(totalAmount).toBe(0);
  });

  test('derives the rate as amount ÷ quantity for a single-rate row', () => {
    const { lines } = buildBillLines([
      { category: 'Milk', quantity: 100, totalAmount: 5200, unitType: 'ml', unitSize: 500 },
    ]);
    const milk = lines.find((l) => l.label === 'MILK');
    expect(milk).toEqual({ label: 'MILK', unit: 'ltr', quantity: 50, rate: 104, amount: 5200 });
  });

  test('rolls up two differently-named categories that alias to the same row', () => {
    const { lines, totalAmount } = buildBillLines([
      { category: 'Paneer', quantity: 10, totalAmount: 400, unitType: 'piece', unitSize: null },
      { category: 'Kova',   quantity: 5,  totalAmount: 200, unitType: 'piece', unitSize: null },
    ]);
    const row = lines.find((l) => l.label === 'PANNEER / KOVA');
    expect(row).toEqual({ label: 'PANNEER / KOVA', unit: 'pcs', quantity: 15, rate: 40, amount: 600 });
    expect(totalAmount).toBe(600);
  });

  test('reports amount only, with quantity/rate null, when a row mixes units', () => {
    const { lines } = buildBillLines([
      { category: 'Others', quantity: 10, totalAmount: 500, unitType: 'ml',   unitSize: 500 },
      { category: 'Others', quantity: 4,  totalAmount: 800, unitType: 'gram', unitSize: 250 },
    ]);
    const others = lines.find((l) => l.label === 'OTHERS');
    expect(others).toEqual({ label: 'OTHERS', unit: null, quantity: null, rate: null, amount: 1300 });
  });

  test('never divides by zero when quantity nets to zero but amount does not', () => {
    // Guards `quantity ? amount / quantity : null` — without it this would
    // print "Infinity/ltr" on the bill instead of a blank rate.
    const { lines } = buildBillLines([
      { category: 'Milk', quantity: 0, totalAmount: 100, unitType: 'ml', unitSize: 500 },
    ]);
    const milk = lines.find((l) => l.label === 'MILK');
    expect(milk.quantity).toBeNull();
    expect(milk.rate).toBeNull();
    expect(milk.amount).toBe(100);
  });

  test('sends every unrecognized category to OTHERS and sums them together', () => {
    const { lines } = buildBillLines([
      { category: 'Lassi',     quantity: 2, totalAmount: 100, unitType: 'piece', unitSize: null },
      { category: 'Ice Cream', quantity: 3, totalAmount: 150, unitType: 'piece', unitSize: null },
    ]);
    const others = lines.find((l) => l.label === 'OTHERS');
    expect(others).toEqual({ label: 'OTHERS', unit: 'pcs', quantity: 5, rate: 50, amount: 250 });
  });

  test('collapses float noise from summing many small quantities to a clean 2dp figure', () => {
    const items = Array.from({ length: 7 }, () => (
      { category: 'Milk', quantity: 1, totalAmount: 5.2, unitType: 'ml', unitSize: 100 }
    ));
    const { lines, totalAmount } = buildBillLines(items);
    const milk = lines.find((l) => l.label === 'MILK');
    expect(milk.quantity).toBe(0.7); // 7 × 0.1 litre, not 0.7000000000000001
    expect(totalAmount).toBe(36.4);  // 7 × 5.2, not 36.400000000000006
  });
});
