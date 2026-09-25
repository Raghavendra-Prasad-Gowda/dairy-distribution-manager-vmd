'use strict';

/**
 * Bill line-item aggregation — Brand → Category → Product, the same
 * canonical dairy layout order as everywhere else (CLAUDE.md §9):
 * brand.displayOrder → categoryDisplayOrder → product.displayOrder → name.
 *
 * The bill used to fold every dispatch into six pre-printed pad rows (MILK /
 * CURD / GHEE / …), mirroring the physical stationery. That generalized real
 * products away — a bill listing "MILK ₹1,72,900" doesn't say which of the
 * salesperson's several milk SKUs that covers. This version lists each
 * product actually dispatched, grouped under its category and brand, so the
 * bill reads like an itemized invoice instead of a lump-sum slip.
 *
 * @typedef {{
 *   brandName: string, brandDisplayOrder?: number,
 *   category?: string|null, categoryDisplayOrder?: number,
 *   productName: string, displayOrder?: number,
 *   quantity: number, totalAmount: number,
 *   unitType?: string|null, unitSize?: number|null,
 *   unitsPerContainer?: number|null, containerType?: string|null,
 * }} BillItem
 */

const UNCATEGORIZED = 'Uncategorized';
const DEFAULT_ORDER = 999;

/** Rounds to 2dp, collapsing float noise from summing quantities/amounts. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The billable unit label for a product: ml products bill per litre, gram
 * products per kg, everything else per piece. Mirrors the crate/litre/kg
 * conversion the Stock Summary and Dispatch Stock Summary reports use.
 */
function unitLabel(unitType) {
  if (unitType === 'ml')   return 'ltr';
  if (unitType === 'gram') return 'kg';
  return 'pcs';
}

/** A dispatch line's quantity converted into its billable unit. */
function measureOf(item) {
  const qty      = Number(item.quantity ?? 0);
  const unitSize = item.unitSize != null ? Number(item.unitSize) : null;
  if (item.unitType === 'ml'   && unitSize) return (qty * unitSize) / 1000;
  if (item.unitType === 'gram' && unitSize) return (qty * unitSize) / 1000;
  return qty;
}

/**
 * Groups dispatch line items into Brand → Category → Product, each product
 * summed across the whole billed period with a derived rate.
 *
 * Rate is amount ÷ quantity — read-only and never invented, so a product
 * supplied at more than one price over the period bills at the weighted
 * average actually charged.
 *
 * @param {BillItem[]} items
 * @returns {{
 *   brands: Array<{
 *     brandName: string,
 *     categories: Array<{
 *       categoryName: string,
 *       products: Array<{
 *         productName: string, unit: string,
 *         quantity: number, rate: number|null, amount: number,
 *       }>,
 *       amount: number,
 *     }>,
 *     amount: number,
 *   }>,
 *   totalAmount: number,
 * }}
 */
function buildBillLines(items = []) {
  // brandName -> { displayOrder, categories: Map(categoryName -> {...}) }
  const brandMap = new Map();

  const ensureProduct = (brandName, brandDisplayOrder, categoryName, categoryDisplayOrder, productName, displayOrder, unit) => {
    if (!brandMap.has(brandName)) {
      brandMap.set(brandName, { displayOrder: brandDisplayOrder, categories: new Map() });
    }
    const brand = brandMap.get(brandName);
    if (!brand.categories.has(categoryName)) {
      brand.categories.set(categoryName, { displayOrder: categoryDisplayOrder, products: new Map() });
    }
    const category = brand.categories.get(categoryName);
    if (!category.products.has(productName)) {
      category.products.set(productName, { displayOrder, unit, quantity: 0, amount: 0 });
    }
    return category.products.get(productName);
  };

  for (const item of items) {
    const categoryName = item.category ?? UNCATEGORIZED;
    const product = ensureProduct(
      item.brandName, item.brandDisplayOrder ?? DEFAULT_ORDER,
      categoryName, item.categoryDisplayOrder ?? DEFAULT_ORDER,
      item.productName, item.displayOrder ?? DEFAULT_ORDER,
      unitLabel(item.unitType),
    );
    product.quantity += measureOf(item);
    product.amount   += Number(item.totalAmount ?? 0);
  }

  const brands = Array.from(brandMap.entries())
    .map(([brandName, brand]) => {
      const categories = Array.from(brand.categories.entries())
        .map(([categoryName, category]) => {
          const products = Array.from(category.products.entries())
            .map(([productName, p]) => {
              const quantity = round2(p.quantity);
              const amount   = round2(p.amount);
              return {
                productName, _displayOrder: p.displayOrder,
                unit: p.unit, quantity,
                rate: quantity ? round2(amount / quantity) : null,
                amount,
              };
            })
            .sort((a, b) => a._displayOrder - b._displayOrder || a.productName.localeCompare(b.productName))
            .map(({ _displayOrder, ...rest }) => rest);

          return {
            categoryName, _displayOrder: category.displayOrder, products,
            amount: round2(products.reduce((s, p) => s + p.amount, 0)),
          };
        })
        .sort((a, b) => a._displayOrder - b._displayOrder || a.categoryName.localeCompare(b.categoryName))
        .map(({ _displayOrder, ...rest }) => rest); // internal sort key only — array order already carries it

      return {
        brandName, _displayOrder: brand.displayOrder, categories,
        amount: round2(categories.reduce((s, c) => s + c.amount, 0)),
      };
    })
    .sort((a, b) => a._displayOrder - b._displayOrder || a.brandName.localeCompare(b.brandName))
    .map(({ _displayOrder, ...rest }) => rest);

  const totalAmount = round2(brands.reduce((s, b) => s + b.amount, 0));
  return { brands, totalAmount };
}

module.exports = { buildBillLines, unitLabel, measureOf };
