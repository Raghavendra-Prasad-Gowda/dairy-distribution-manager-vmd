import { describe, it, expect } from 'vitest';
import { buildProductPurchaseRows, buildBrandCategoryBreakdown } from './salespersonProductStatement';

function row(date, items) {
  return { date, items };
}
function item(brandName, quantity, totalAmount) {
  return { brandName, quantity, totalAmount };
}

describe('buildProductPurchaseRows', () => {
  it('returns one row per date+brand, summing quantity and amount across products', () => {
    const rows = [
      row('2026-08-01', [
        item('Nandini', 10, 500),
        item('Nandini', 5, 250), // same brand, same day — merges into one row
        item('Jersey', 2, 100),
      ]),
    ];
    const result = buildProductPurchaseRows(rows);
    expect(result).toEqual([
      { date: '2026-08-01', brandName: 'Jersey', quantity: 2, amount: 100 },
      { date: '2026-08-01', brandName: 'Nandini', quantity: 15, amount: 750 },
    ]);
  });

  it('keeps the same brand on different dates as separate rows', () => {
    const rows = [
      row('2026-08-01', [item('Nandini', 10, 500)]),
      row('2026-08-02', [item('Nandini', 8, 400)]),
    ];
    const result = buildProductPurchaseRows(rows);
    expect(result).toEqual([
      { date: '2026-08-01', brandName: 'Nandini', quantity: 10, amount: 500 },
      { date: '2026-08-02', brandName: 'Nandini', quantity: 8, amount: 400 },
    ]);
  });

  it('sorts by date, then brand name', () => {
    const rows = [
      row('2026-08-02', [item('Zeta', 1, 10)]),
      row('2026-08-01', [item('Beta', 1, 10), item('Alpha', 1, 10)]),
    ];
    const result = buildProductPurchaseRows(rows).map((r) => `${r.date}/${r.brandName}`);
    expect(result).toEqual(['2026-08-01/Alpha', '2026-08-01/Beta', '2026-08-02/Zeta']);
  });

  it('skips days with no items and handles an empty input', () => {
    const rows = [row('2026-08-01', []), row('2026-08-02', undefined)];
    expect(buildProductPurchaseRows(rows)).toEqual([]);
    expect(buildProductPurchaseRows([])).toEqual([]);
    expect(buildProductPurchaseRows()).toEqual([]);
  });
});

function fullItem(overrides) {
  return {
    brandName: 'Nandini', brandDisplayOrder: 1,
    category: 'Milk', categoryDisplayOrder: 1,
    productName: 'Toned Milk 500ml', displayOrder: 1,
    quantity: 10, totalAmount: 100,
    ...overrides,
  };
}

describe('buildBrandCategoryBreakdown', () => {
  it('sums the same product across multiple days into one row', () => {
    const rows = [
      row('2026-08-01', [fullItem({ quantity: 10, totalAmount: 445 })]),
      row('2026-08-02', [fullItem({ quantity: 5, totalAmount: 222.5 })]),
    ];
    const result = buildBrandCategoryBreakdown(rows);

    expect(result.brands).toHaveLength(1);
    expect(result.brands[0].categories).toHaveLength(1);
    expect(result.brands[0].categories[0].products).toEqual([
      { productName: 'Toned Milk 500ml', displayOrder: 1, quantity: 15, amount: 667.5, avgUnitPrice: 44.5 },
    ]);
  });

  it('nests distinct products under their own category, and categories under their own brand', () => {
    const rows = [row('2026-08-01', [
      fullItem({ productName: 'Toned Milk 500ml', category: 'Milk', categoryDisplayOrder: 1, quantity: 10, totalAmount: 445 }),
      fullItem({ productName: 'Curd 200g', category: 'Curd', categoryDisplayOrder: 2, quantity: 4, totalAmount: 50 }),
      fullItem({ brandName: 'Jersey', brandDisplayOrder: 2, productName: 'HTM 1000ml', category: 'Milk', categoryDisplayOrder: 1, quantity: 2, totalAmount: 90 }),
    ])];
    const result = buildBrandCategoryBreakdown(rows);

    expect(result.brands.map(b => b.brandName)).toEqual(['Nandini', 'Jersey']);
    const nandini = result.brands[0];
    expect(nandini.categories.map(c => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(nandini.categories[0].products.map(p => p.productName)).toEqual(['Toned Milk 500ml']);
    expect(nandini.categories[1].products.map(p => p.productName)).toEqual(['Curd 200g']);
    expect(result.brands[1].categories[0].products.map(p => p.productName)).toEqual(['HTM 1000ml']);
  });

  it('sorts brands, categories, and products by their displayOrder, falling back to name', () => {
    const rows = [row('2026-08-01', [
      fullItem({ brandName: 'Jersey', brandDisplayOrder: 2, category: 'Milk', categoryDisplayOrder: 1, productName: 'Z Product', displayOrder: 1 }),
      fullItem({ brandName: 'Nandini', brandDisplayOrder: 1, category: 'Curd', categoryDisplayOrder: 2, productName: 'A Product', displayOrder: 1 }),
      fullItem({ brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'B Product', displayOrder: 2 }),
      fullItem({ brandName: 'Nandini', brandDisplayOrder: 1, category: 'Milk', categoryDisplayOrder: 1, productName: 'A Product', displayOrder: 1 }),
    ])];
    const result = buildBrandCategoryBreakdown(rows);

    expect(result.brands.map(b => b.brandName)).toEqual(['Nandini', 'Jersey']);
    expect(result.brands[0].categories.map(c => c.categoryName)).toEqual(['Milk', 'Curd']);
    expect(result.brands[0].categories[0].products.map(p => p.productName)).toEqual(['A Product', 'B Product']);
  });

  it('groups a null category under "Uncategorized"', () => {
    const rows = [row('2026-08-01', [fullItem({ category: null, categoryDisplayOrder: undefined })])];
    const result = buildBrandCategoryBreakdown(rows);
    expect(result.brands[0].categories[0].categoryName).toBe('Uncategorized');
  });

  it('computes grand totals across all brands', () => {
    const rows = [row('2026-08-01', [
      fullItem({ brandName: 'Nandini', quantity: 10, totalAmount: 445 }),
      fullItem({ brandName: 'Jersey', brandDisplayOrder: 2, quantity: 2, totalAmount: 90 }),
    ])];
    const result = buildBrandCategoryBreakdown(rows);
    expect(result.totalQty).toBe(12);
    expect(result.totalAmount).toBe(535);
  });

  it('returns an empty breakdown for no rows', () => {
    expect(buildBrandCategoryBreakdown([])).toEqual({ brands: [], totalQty: 0, totalAmount: 0 });
    expect(buildBrandCategoryBreakdown()).toEqual({ brands: [], totalQty: 0, totalAmount: 0 });
  });
});
