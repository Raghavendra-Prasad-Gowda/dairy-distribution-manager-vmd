/**
 * Aggregates a salesperson statement's per-day dispatch items into the
 * "Products Purchased" statement — one row per (date, brand), with the
 * total quantity and total ₹ amount for that brand that day. Shared by
 * MyStatement.jsx (screen) and MyStatementPrint.jsx (print/PDF) so the two
 * views can never drift out of sync — both already have the full per-day
 * `items` array from GET /salesperson-statement/me, so this needs no
 * separate API call.
 */

/**
 * @param {Array<{ date: string, items?: Array<{ brandName: string, quantity: number, totalAmount: number }> }>} rows
 * @returns {Array<{ date: string, brandName: string, quantity: number, amount: number }>}
 *   Sorted by date, then brand name.
 */
export function buildProductPurchaseRows(rows = []) {
  const map = new Map(); // key: `${date}::${brandName}`

  for (const row of rows) {
    for (const item of row.items ?? []) {
      const key = `${row.date}::${item.brandName}`;
      const entry = map.get(key);
      if (entry) {
        entry.quantity += item.quantity;
        entry.amount += item.totalAmount;
      } else {
        map.set(key, { date: row.date, brandName: item.brandName, quantity: item.quantity, amount: item.totalAmount });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date) || a.brandName.localeCompare(b.brandName)
  );
}
