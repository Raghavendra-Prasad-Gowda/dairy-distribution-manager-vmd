import { describe, it, expect } from 'vitest';
import { buildProductPurchaseRows } from './salespersonProductStatement';

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
