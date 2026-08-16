/**
 * Frontend product "layout order" helpers — the client-side counterpart to the
 * server's utils/productLayout.js. Centralizes the category→product sort that
 * was copy-pasted across StockReceipt, ProductsSetup, SalesmanPricesSetup,
 * StockSummary, etc. Layout order is:
 *   categoryDisplayOrder → product.displayOrder → product name
 */

export const DEFAULT_ORDER = 9999;

/** Map category name → displayOrder (frontend groups within a single brand). */
export function buildCategoryOrderMap(categories = []) {
  return new Map(categories.map((c) => [c.name, c.displayOrder]));
}

/**
 * Comparator for product rows that expose `categoryDisplayOrder`, `displayOrder`
 * and a name field (`productName` or `name`). Pass to Array.prototype.sort.
 */
export function compareByLayout(a, b) {
  return (
    (a.categoryDisplayOrder ?? DEFAULT_ORDER) - (b.categoryDisplayOrder ?? DEFAULT_ORDER) ||
    (a.displayOrder ?? DEFAULT_ORDER) - (b.displayOrder ?? DEFAULT_ORDER) ||
    (a.productName ?? a.name ?? '').localeCompare(b.productName ?? b.name ?? '')
  );
}

/** Convenience: a sorted copy of a product array in layout order. */
export function sortByLayout(products = []) {
  return [...products].sort(compareByLayout);
}

/**
 * Sort `Object.entries(groupedByCategoryName)` by the categories' displayOrder,
 * then name. Returns the sorted [name, items] entries.
 */
export function sortCategoryGroups(grouped, categories = []) {
  const map = buildCategoryOrderMap(categories);
  return Object.entries(grouped).sort(([a], [b]) => {
    const oa = map.get(a) ?? DEFAULT_ORDER;
    const ob = map.get(b) ?? DEFAULT_ORDER;
    return oa !== ob ? oa - ob : a.localeCompare(b);
  });
}
