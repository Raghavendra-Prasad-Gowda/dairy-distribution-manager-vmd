'use strict';

/**
 * services/depositRules.js — single source of truth for deposit qualification
 * and line-amount math. Pure functions, tested directly (no HTTP needed).
 */

const { test, expect } = require('@playwright/test');
const { qualifiesForDeposit, calculateLineDeposit } = require('../../services/depositRules');

const BRAND = { depositEnabled: true, depositPerLitre: 0.2 };
const PRODUCT = { unitType: 'ml', unitSize: 500, containerType: 'crate', depositEnabled: true, category: 'Milk' };
const ENABLED_CATS = new Set(['Milk']);

test.describe('qualifiesForDeposit', () => {
  test('qualifies a crate ml product in an enabled category', () => {
    expect(qualifiesForDeposit(PRODUCT, BRAND, ENABLED_CATS)).toBe(true);
  });

  test('qualifies a crate gram product too', () => {
    expect(qualifiesForDeposit({ ...PRODUCT, unitType: 'gram' }, BRAND, ENABLED_CATS)).toBe(true);
  });

  test('disqualifies when the brand has deposit disabled', () => {
    expect(qualifiesForDeposit(PRODUCT, { ...BRAND, depositEnabled: false }, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when brand is missing entirely', () => {
    expect(qualifiesForDeposit(PRODUCT, null, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when depositPerLitre is zero', () => {
    expect(qualifiesForDeposit(PRODUCT, { ...BRAND, depositPerLitre: 0 }, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when depositPerLitre is missing (defaults to 0)', () => {
    expect(qualifiesForDeposit(PRODUCT, { depositEnabled: true }, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when the product has deposit disabled', () => {
    expect(qualifiesForDeposit({ ...PRODUCT, depositEnabled: false }, BRAND, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when the product is missing entirely', () => {
    expect(qualifiesForDeposit(null, BRAND, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies a piece-type product (neither ml nor gram)', () => {
    expect(qualifiesForDeposit({ ...PRODUCT, unitType: 'piece' }, BRAND, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies a non-crate container', () => {
    expect(qualifiesForDeposit({ ...PRODUCT, containerType: 'pouch' }, BRAND, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when unitSize is missing', () => {
    expect(qualifiesForDeposit({ ...PRODUCT, unitSize: null }, BRAND, ENABLED_CATS)).toBe(false);
  });

  test('disqualifies when the category is not in the enabled set', () => {
    expect(qualifiesForDeposit(PRODUCT, BRAND, new Set(['Curd']))).toBe(false);
  });

  test('disqualifies when the product has no category', () => {
    expect(qualifiesForDeposit({ ...PRODUCT, category: null }, BRAND, ENABLED_CATS)).toBe(false);
  });
});

test.describe('calculateLineDeposit', () => {
  test('computes quantity × litres × rate, rounded to paisa', () => {
    // 1000 units × 0.5L × 0.20/L = 100
    expect(calculateLineDeposit(1000, 500, 0.2)).toBe(100);
  });

  test('rounds to 2 decimal places', () => {
    expect(calculateLineDeposit(3, 333, 0.2)).toBeCloseTo(0.2, 2);
  });
});
