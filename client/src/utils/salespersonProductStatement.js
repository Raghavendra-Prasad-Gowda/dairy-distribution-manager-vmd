/**
 * Aggregates a salesperson statement's per-day dispatch items into the
 * "Dispatch Stock Summary" — Brand → Category → Product, summed over the
 * whole selected date range, with crate/litre/kg conversions. Mirrors the
 * Dairy Stock Summary report's aggregation (see StockSummary.jsx), minus the
 * per-route breakdown and per-unit price column — a dispatch has no route
 * dimension, and the summary only needs the totals.
 *
 * Used by both the admin Salesperson Statement's and the salesman's own
 * MyStatement's "Dispatch Stock Summary" tab (and their print views) — both
 * already fetch the full per-day `items` array from their respective
 * endpoints (GET /reports/salesperson-statement, GET
 * /salesperson-statement/me), so this needs no separate API call.
 *
 * Sort order matches the canonical dairy layout order (see CLAUDE.md §9):
 * brand.displayOrder → categoryDisplayOrder → product.displayOrder → name.
 *
 * @param {Array<{ items?: Array<{
 *   brandName: string, brandDisplayOrder?: number,
 *   category?: string|null, categoryDisplayOrder?: number,
 *   productName: string, displayOrder?: number,
 *   quantity: number, totalAmount: number,
 *   unitType?: string|null, unitSize?: number|null,
 *   unitsPerContainer?: number|null, containerType?: string|null,
 * }> }>} rows
 * @returns {{
 *   brands: Array<{
 *     brandName: string, totalQty: number, totalValue: number,
 *     totalCrates: number|null, totalLiters: number|null, totalKgs: number|null,
 *     categories: Array<{
 *       categoryName: string, totalQty: number, totalValue: number,
 *       totalCrates: number|null, totalLiters: number|null, totalKgs: number|null,
 *       products: Array<{
 *         productName: string, totalQty: number, totalValue: number,
 *         totalCrates: number|null, totalLiters: number|null, totalKgs: number|null,
 *       }>,
 *     }>,
 *   }>,
 *   totalQty: number, totalValue: number,
 *   totalCrates: number|null, totalLiters: number|null, totalKgs: number|null,
 * }}
 */
const UNCATEGORIZED = 'Uncategorized';
const DEFAULT_ORDER  = 999;

// Round to 2dp, collapsing float noise (e.g. 0.1 + 0.2) from summing crates.
// Display formatting (whole vs 2dp) is the component's job, not this util's.
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Sums a numeric field across a list, but only when at least one entry
// actually has it — lets a product with no crate/litre/kg figure roll up as
// "—" at the category/brand/grand-total level instead of a misleading 0.
function sumIfPresent(list, key) {
  return list.some((x) => x[key] != null)
    ? round2(list.reduce((s, x) => s + (x[key] ?? 0), 0))
    : null;
}

export function buildDispatchStockSummary(rows = []) {
  // brandName -> { displayOrder, categories: Map(categoryName -> {...}) }
  const brandMap = new Map();

  const ensureProduct = (brandName, brandDisplayOrder, categoryName, categoryDisplayOrder, productName, displayOrder) => {
    if (!brandMap.has(brandName)) {
      brandMap.set(brandName, { displayOrder: brandDisplayOrder, categories: new Map() });
    }
    const brand = brandMap.get(brandName);
    if (!brand.categories.has(categoryName)) {
      brand.categories.set(categoryName, { displayOrder: categoryDisplayOrder, products: new Map() });
    }
    const category = brand.categories.get(categoryName);
    if (!category.products.has(productName)) {
      category.products.set(productName, {
        displayOrder, quantity: 0, amount: 0,
        unitType: null, unitSize: null, unitsPerContainer: null, containerType: null,
      });
    }
    return category.products.get(productName);
  };

  for (const row of rows) {
    for (const item of row.items ?? []) {
      const categoryName = item.category ?? UNCATEGORIZED;
      const product = ensureProduct(
        item.brandName, item.brandDisplayOrder ?? DEFAULT_ORDER,
        categoryName, item.categoryDisplayOrder ?? DEFAULT_ORDER,
        item.productName, item.displayOrder ?? DEFAULT_ORDER,
      );
      product.quantity += item.quantity;
      product.amount   += item.totalAmount;
      if (!product.unitType && item.unitType)                 product.unitType          = item.unitType;
      if (!product.unitSize && item.unitSize)                 product.unitSize          = item.unitSize;
      if (!product.unitsPerContainer && item.unitsPerContainer) product.unitsPerContainer = item.unitsPerContainer;
      if (!product.containerType && item.containerType)       product.containerType     = item.containerType;
    }
  }

  const brands = Array.from(brandMap.entries())
    .map(([brandName, brand]) => {
      const categories = Array.from(brand.categories.entries())
        .map(([categoryName, category]) => {
          const products = Array.from(category.products.entries())
            .map(([productName, p]) => {
              const isCrate     = p.containerType === 'crate';
              const totalCrates = isCrate ? round2(p.unitsPerContainer ? p.quantity / p.unitsPerContainer : p.quantity) : null;
              const totalLiters = isCrate && p.unitType === 'ml'   && p.unitSize ? round2((p.quantity * p.unitSize) / 1000) : null;
              const totalKgs    = isCrate && p.unitType === 'gram' && p.unitSize ? round2((p.quantity * p.unitSize) / 1000) : null;
              return {
                productName, displayOrder: p.displayOrder,
                totalQty: p.quantity, totalValue: p.amount,
                totalCrates, totalLiters, totalKgs,
              };
            })
            .sort((a, b) => a.displayOrder - b.displayOrder || a.productName.localeCompare(b.productName));

          return {
            categoryName, displayOrder: category.displayOrder,
            products,
            totalQty:    products.reduce((s, p) => s + p.totalQty,   0),
            totalValue:  products.reduce((s, p) => s + p.totalValue, 0),
            totalCrates: sumIfPresent(products, 'totalCrates'),
            totalLiters: sumIfPresent(products, 'totalLiters'),
            totalKgs:    sumIfPresent(products, 'totalKgs'),
          };
        })
        .sort((a, b) => a.displayOrder - b.displayOrder || a.categoryName.localeCompare(b.categoryName));

      return {
        brandName, displayOrder: brand.displayOrder,
        categories,
        totalQty:    categories.reduce((s, c) => s + c.totalQty,   0),
        totalValue:  categories.reduce((s, c) => s + c.totalValue, 0),
        totalCrates: sumIfPresent(categories, 'totalCrates'),
        totalLiters: sumIfPresent(categories, 'totalLiters'),
        totalKgs:    sumIfPresent(categories, 'totalKgs'),
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder || a.brandName.localeCompare(b.brandName));

  return {
    brands,
    totalQty:    brands.reduce((s, b) => s + b.totalQty,   0),
    totalValue:  brands.reduce((s, b) => s + b.totalValue, 0),
    totalCrates: sumIfPresent(brands, 'totalCrates'),
    totalLiters: sumIfPresent(brands, 'totalLiters'),
    totalKgs:    sumIfPresent(brands, 'totalKgs'),
  };
}
