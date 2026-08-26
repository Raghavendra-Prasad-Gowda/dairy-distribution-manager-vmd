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

const UNCATEGORIZED = 'Uncategorized';
const DEFAULT_ORDER  = 999;

/**
 * Aggregates a salesperson statement's per-day dispatch items into a
 * Brand → Category → Product breakdown for the WHOLE selected date range —
 * one row per product, summed across every day in range, nested under its
 * category and brand. Used by the admin-side SalespersonStatement.jsx
 * "Products Purchased" tab (and its print view) — reuses the same `rows`
 * data already fetched from GET /reports/salesperson-statement (which
 * includes category/categoryDisplayOrder/displayOrder/brandDisplayOrder on
 * each item precisely so this can re-sort after aggregating), so no
 * separate API call is needed.
 *
 * Sort order matches the canonical dairy layout order (see CLAUDE.md §9):
 * brand.displayOrder → categoryDisplayOrder → product.displayOrder → name.
 *
 * @param {Array<{ items?: Array<{
 *   brandName: string, brandDisplayOrder?: number,
 *   category?: string|null, categoryDisplayOrder?: number,
 *   productName: string, displayOrder?: number,
 *   quantity: number, totalAmount: number,
 * }> }>} rows
 * @returns {{
 *   brands: Array<{ brandName: string, quantity: number, amount: number, categories: Array<{
 *     categoryName: string, quantity: number, amount: number, products: Array<{
 *       productName: string, quantity: number, amount: number, avgUnitPrice: number,
 *     }>,
 *   }> }>,
 *   totalQty: number, totalAmount: number,
 * }}
 */
export function buildBrandCategoryBreakdown(rows = []) {
  // brandName -> { displayOrder, quantity, amount, categories: Map(categoryName -> {...}) }
  const brandMap = new Map();

  for (const row of rows) {
    for (const item of row.items ?? []) {
      const categoryName = item.category ?? UNCATEGORIZED;

      if (!brandMap.has(item.brandName)) {
        brandMap.set(item.brandName, {
          displayOrder: item.brandDisplayOrder ?? DEFAULT_ORDER,
          quantity: 0, amount: 0,
          categories: new Map(),
        });
      }
      const brand = brandMap.get(item.brandName);
      brand.quantity += item.quantity;
      brand.amount += item.totalAmount;

      if (!brand.categories.has(categoryName)) {
        brand.categories.set(categoryName, {
          displayOrder: item.categoryDisplayOrder ?? DEFAULT_ORDER,
          quantity: 0, amount: 0,
          products: new Map(), // productName -> { displayOrder, quantity, amount }
        });
      }
      const category = brand.categories.get(categoryName);
      category.quantity += item.quantity;
      category.amount += item.totalAmount;

      const product = category.products.get(item.productName);
      if (product) {
        product.quantity += item.quantity;
        product.amount += item.totalAmount;
      } else {
        category.products.set(item.productName, {
          displayOrder: item.displayOrder ?? DEFAULT_ORDER,
          quantity: item.quantity,
          amount: item.totalAmount,
        });
      }
    }
  }

  const brands = Array.from(brandMap.entries())
    .map(([brandName, brand]) => ({
      brandName,
      displayOrder: brand.displayOrder,
      quantity: brand.quantity,
      amount: brand.amount,
      categories: Array.from(brand.categories.entries())
        .map(([categoryName, category]) => ({
          categoryName,
          displayOrder: category.displayOrder,
          quantity: category.quantity,
          amount: category.amount,
          products: Array.from(category.products.entries())
            .map(([productName, product]) => ({
              productName,
              displayOrder: product.displayOrder,
              quantity: product.quantity,
              amount: product.amount,
              avgUnitPrice: product.quantity > 0 ? product.amount / product.quantity : 0,
            }))
            .sort((a, b) => a.displayOrder - b.displayOrder || a.productName.localeCompare(b.productName)),
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder || a.categoryName.localeCompare(b.categoryName)),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.brandName.localeCompare(b.brandName));

  return {
    brands,
    totalQty: brands.reduce((s, b) => s + b.quantity, 0),
    totalAmount: brands.reduce((s, b) => s + b.amount, 0),
  };
}
