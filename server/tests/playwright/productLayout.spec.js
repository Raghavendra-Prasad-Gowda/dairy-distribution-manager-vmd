'use strict';

/**
 * utils/productLayout.js — canonical brand → category → displayOrder → name
 * sort helpers. Pure functions, tested directly (no HTTP needed).
 */

const { test, expect } = require('@playwright/test');
const { buildCategoryOrderMap, getCategoryOrder, compareProductsByLayout, DEFAULT_ORDER } = require('../../utils/productLayout');

test.describe('buildCategoryOrderMap / getCategoryOrder', () => {
  test('resolves a known brandId+category pair', () => {
    const map = buildCategoryOrderMap([{ brandId: 1, name: 'Milk', displayOrder: 2 }]);
    expect(getCategoryOrder(map, 1, 'Milk')).toBe(2);
  });

  test('defaults to DEFAULT_ORDER for an unknown pair', () => {
    const map = buildCategoryOrderMap([{ brandId: 1, name: 'Milk', displayOrder: 2 }]);
    expect(getCategoryOrder(map, 1, 'Curd')).toBe(DEFAULT_ORDER);
    expect(getCategoryOrder(map, 2, 'Milk')).toBe(DEFAULT_ORDER);
  });
});

test.describe('compareProductsByLayout', () => {
  const catOrderMap = buildCategoryOrderMap([
    { brandId: 1, name: 'Milk', displayOrder: 1 },
    { brandId: 1, name: 'Curd', displayOrder: 2 },
  ]);
  const cmp = compareProductsByLayout(catOrderMap);

  test('sorts by brand.displayOrder first', () => {
    const a = { brand: { displayOrder: 2 }, brandId: 1, category: 'Milk', displayOrder: 1, name: 'A' };
    const b = { brand: { displayOrder: 1 }, brandId: 1, category: 'Milk', displayOrder: 1, name: 'B' };
    expect(cmp(a, b)).toBeGreaterThan(0);
  });

  test('falls back to brandDisplayOrder when brand.displayOrder is absent', () => {
    const a = { brandDisplayOrder: 2, brandId: 1, category: 'Milk', displayOrder: 1, name: 'A' };
    const b = { brandDisplayOrder: 1, brandId: 1, category: 'Milk', displayOrder: 1, name: 'B' };
    expect(cmp(a, b)).toBeGreaterThan(0);
  });

  test('then by category order when brand order ties', () => {
    const a = { brandId: 1, category: 'Curd', displayOrder: 1, name: 'A' };
    const b = { brandId: 1, category: 'Milk', displayOrder: 1, name: 'B' };
    expect(cmp(a, b)).toBeGreaterThan(0); // Curd(2) after Milk(1)
  });

  test('then by product displayOrder when brand and category tie', () => {
    const a = { brandId: 1, category: 'Milk', displayOrder: 2, name: 'A' };
    const b = { brandId: 1, category: 'Milk', displayOrder: 1, name: 'B' };
    expect(cmp(a, b)).toBeGreaterThan(0);
  });

  test('finally by name when everything else ties', () => {
    const a = { brandId: 1, category: 'Milk', displayOrder: 1, name: 'Zebra' };
    const b = { brandId: 1, category: 'Milk', displayOrder: 1, name: 'Apple' };
    expect(cmp(a, b)).toBeGreaterThan(0);
  });

  test('treats a missing name as empty string rather than throwing', () => {
    const a = { brandId: 1, category: 'Milk', displayOrder: 1, name: undefined };
    const b = { brandId: 1, category: 'Milk', displayOrder: 1, name: 'Apple' };
    expect(() => cmp(a, b)).not.toThrow();
  });

  test('defaults a missing product displayOrder to DEFAULT_ORDER', () => {
    const a = { brandId: 1, category: 'Milk', displayOrder: null, name: 'A' };
    const b = { brandId: 1, category: 'Milk', displayOrder: 1, name: 'B' };
    expect(cmp(a, b)).toBeGreaterThan(0); // null → 999, sorts after 1
  });

  test('both names missing sorts as equal (empty string vs empty string)', () => {
    const a = { brandId: 1, category: 'Milk', displayOrder: 1, name: undefined };
    const b = { brandId: 1, category: 'Milk', displayOrder: 1, name: undefined };
    expect(cmp(a, b)).toBe(0);
  });
});
