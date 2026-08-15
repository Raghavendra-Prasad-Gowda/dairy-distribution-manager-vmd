import { describe, it, expect } from 'vitest';
import {
  buildCategoryOrderMap,
  compareByLayout,
  sortByLayout,
  sortCategoryGroups,
  DEFAULT_ORDER,
} from './productLayout';

describe('productLayout', () => {
  it('builds a category → displayOrder map', () => {
    const map = buildCategoryOrderMap([
      { name: 'Milk', displayOrder: 1 },
      { name: 'Curd', displayOrder: 2 },
    ]);
    expect(map.get('Milk')).toBe(1);
    expect(map.get('Curd')).toBe(2);
  });

  it('sorts by category, then displayOrder, then name', () => {
    const products = [
      { categoryDisplayOrder: 2, displayOrder: 1, productName: 'Curd 500' },
      { categoryDisplayOrder: 1, displayOrder: 2, productName: 'Milk B' },
      { categoryDisplayOrder: 1, displayOrder: 1, productName: 'Milk A' },
      { categoryDisplayOrder: 1, displayOrder: 1, productName: 'Milk A2' },
    ];
    const sorted = sortByLayout(products).map((p) => p.productName);
    expect(sorted).toEqual(['Milk A', 'Milk A2', 'Milk B', 'Curd 500']);
  });

  it('defaults missing orders to the end', () => {
    const a = { productName: 'x' };
    const b = { categoryDisplayOrder: 1, productName: 'y' };
    expect(compareByLayout(a, b)).toBeGreaterThan(0);
    expect(DEFAULT_ORDER).toBe(9999);
  });

  it('supports `name` as well as `productName`', () => {
    const sorted = sortByLayout([{ name: 'B' }, { name: 'A' }]).map((p) => p.name);
    expect(sorted).toEqual(['A', 'B']);
  });

  it('sorts grouped category entries by displayOrder', () => {
    const grouped = { Curd: [1], Milk: [2], Ghee: [3] };
    const cats = [
      { name: 'Milk', displayOrder: 1 },
      { name: 'Curd', displayOrder: 2 },
      { name: 'Ghee', displayOrder: 3 },
    ];
    expect(sortCategoryGroups(grouped, cats).map(([n]) => n)).toEqual(['Milk', 'Curd', 'Ghee']);
  });
});
