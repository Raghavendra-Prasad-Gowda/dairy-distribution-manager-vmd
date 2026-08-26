import { describe, it, expect } from 'vitest';
import { buildDispatchStockSummary } from './salespersonProductStatement';

function row(date, items) {
  return { date, items };
}

function item(overrides) {
  return {
    brandName: 'Nandini', brandDisplayOrder: 1,
    category: 'Milk', categoryDisplayOrder: 1,
    productName: 'Toned Milk 500ml', displayOrder: 1,
    quantity: 10, totalAmount: 100,
    unitType: null, unitSize: null, unitsPerContainer: null, containerType: null,
    ...overrides,
  };
}

describe('buildDispatchStockSummary', () => {
  it('sums the same product across multiple days into one row', () => {
    const rows = [
      row('2026-08-01', [item({ quantity: 10, totalAmount: 445 })]),
      row('2026-08-02', [item({ quantity: 5, totalAmount: 222.5 })]),
    ];
    const result = buildDispatchStockSummary(rows);

    expect(result.brands).toHaveLength(1);
    expect(result.brands[0].categories).toHaveLength(1);
    expect(result.brands[0].categories[0].products).toEqual([
      { productName: 'Toned Milk 500ml', displayOrder: 1, totalQty: 15, totalValue: 667.5, totalCrates: null, totalLiters: null, totalKgs: null },
    ]);
  });

  it('nests distinct products under their own category, and categories under their own brand', () => {
    const rows = [row('2026-08-01', [
      item({ productName: 'Toned Milk 500ml', category: 'Milk', categoryDisplayOrder: 1, quantity: 10, totalAmount: 445 }),
      item({ productName: 'Curd 200g', category: 'Curd', categoryDisplayOrder: 2, quantity: 4, totalAmount: 50 }),
      item({ brandName: 'Jersey', brandDisplayOrder: 2, productName: 'HTM 1000ml', category: 'Milk', categoryDisplayOrder: 1, quantity: 2, totalAmount: 90 }),
    ])];
    const result = buildDispatchStockSummary(rows);

    expect(result.brands.map(b => b.brandName)).toEqual(['Nandini', 'Jersey']);
    const nandini = result.brands[0];
    expect(nandini.categories.map(c => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(nandini.categories[0].products.map(p => p.productName)).toEqual(['Toned Milk 500ml']);
    expect(nandini.categories[1].products.map(p => p.productName)).toEqual(['Curd 200g']);
    expect(result.brands[1].categories[0].products.map(p => p.productName)).toEqual(['HTM 1000ml']);
  });

  it('sorts brands, categories, and products by their displayOrder, falling back to name', () => {
    const rows = [row('2026-08-01', [
      item({ brandName: 'Jersey', brandDisplayOrder: 2, category: 'Milk', categoryDisplayOrder: 1, productName: 'Z Product', displayOrder: 1 }),
      item({ brandName: 'Nandini', brandDisplayOrder: 1, category: 'Curd', categoryDisplayOrder: 2, productName: 'A Product', displayOrder: 1 }),
      item({ brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'B Product', displayOrder: 2 }),
      item({ brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'A Product', displayOrder: 1 }),
    ])];
    const result = buildDispatchStockSummary(rows);

    expect(result.brands.map(b => b.brandName)).toEqual(['Nandini', 'Jersey']);
    expect(result.brands[0].categories.map(c => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(result.brands[0].categories[0].products.map(p => p.productName)).toEqual(['A Product', 'B Product']);
  });

  it('groups a null category under "Uncategorized"', () => {
    const rows = [row('2026-08-01', [item({ category: null, categoryDisplayOrder: undefined })])];
    const result = buildDispatchStockSummary(rows);
    expect(result.brands[0].categories[0].categoryName).toBe('Uncategorized');
  });

  it('computes grand totals across all brands', () => {
    const rows = [row('2026-08-01', [
      item({ brandName: 'Nandini', quantity: 10, totalAmount: 445 }),
      item({ brandName: 'Jersey', brandDisplayOrder: 2, quantity: 2, totalAmount: 90 }),
    ])];
    const result = buildDispatchStockSummary(rows);
    expect(result.totalQty).toBe(12);
    expect(result.totalValue).toBe(535);
  });

  it('returns an empty summary for no rows', () => {
    expect(buildDispatchStockSummary([])).toEqual({
      brands: [], totalQty: 0, totalValue: 0, totalCrates: null, totalLiters: null, totalKgs: null,
    });
    expect(buildDispatchStockSummary()).toEqual({
      brands: [], totalQty: 0, totalValue: 0, totalCrates: null, totalLiters: null, totalKgs: null,
    });
  });

  // ─── Crate / litre / kg conversions ──────────────────────────────────────

  it('computes crates for a crate product from quantity ÷ unitsPerContainer', () => {
    const rows = [row('2026-08-01', [
      item({ quantity: 120, unitsPerContainer: 12, containerType: 'crate' }),
    ])];
    const result = buildDispatchStockSummary(rows);
    expect(result.brands[0].categories[0].products[0].totalCrates).toBe(10);
  });

  it('falls back to raw quantity for crates when unitsPerContainer is missing', () => {
    const rows = [row('2026-08-01', [
      item({ quantity: 7, unitsPerContainer: null, containerType: 'crate' }),
    ])];
    const result = buildDispatchStockSummary(rows);
    expect(result.brands[0].categories[0].products[0].totalCrates).toBe(7);
  });

  it('computes liters for a crate product measured in ml', () => {
    const rows = [row('2026-08-01', [
      item({ quantity: 24, unitType: 'ml', unitSize: 500, containerType: 'crate' }),
    ])];
    const result = buildDispatchStockSummary(rows);
    const product = result.brands[0].categories[0].products[0];
    expect(product.totalLiters).toBe(12); // 24 × 500ml / 1000
    expect(product.totalKgs).toBeNull();
  });

  it('computes kgs for a crate product measured in grams', () => {
    const rows = [row('2026-08-01', [
      item({ quantity: 24, unitType: 'gram', unitSize: 1000, containerType: 'crate' }),
    ])];
    const result = buildDispatchStockSummary(rows);
    const product = result.brands[0].categories[0].products[0];
    expect(product.totalKgs).toBe(24); // 24 × 1000g / 1000
    expect(product.totalLiters).toBeNull();
  });

  it('leaves crates/liters/kgs null for a non-crate product', () => {
    const rows = [row('2026-08-01', [
      item({ quantity: 5, unitType: 'ml', unitSize: 500, unitsPerContainer: 12, containerType: 'piece' }),
    ])];
    const result = buildDispatchStockSummary(rows);
    const product = result.brands[0].categories[0].products[0];
    expect(product.totalCrates).toBeNull();
    expect(product.totalLiters).toBeNull();
    expect(product.totalKgs).toBeNull();
  });

  it('rolls crate/litre/kg totals up to category, brand, and grand total', () => {
    const rows = [row('2026-08-01', [
      item({ productName: 'A', quantity: 12, unitType: 'ml', unitSize: 500, unitsPerContainer: 12, containerType: 'crate' }),
      item({ productName: 'B', quantity: 24, unitType: 'ml', unitSize: 500, unitsPerContainer: 12, containerType: 'crate' }),
    ])];
    const result = buildDispatchStockSummary(rows);
    const category = result.brands[0].categories[0];
    expect(category.totalCrates).toBe(3); // 1 + 2
    expect(category.totalLiters).toBe(18); // 6 + 12
    expect(result.brands[0].totalCrates).toBe(3);
    expect(result.totalCrates).toBe(3);
  });

  it('rolls up as null when none of the products in scope are crate products', () => {
    const rows = [row('2026-08-01', [item({ containerType: 'piece' })])];
    const result = buildDispatchStockSummary(rows);
    expect(result.brands[0].categories[0].totalCrates).toBeNull();
    expect(result.brands[0].totalCrates).toBeNull();
    expect(result.totalCrates).toBeNull();
  });
});
