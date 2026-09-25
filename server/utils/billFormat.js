'use strict';

/**
 * Bill line-item aggregation — Brand → Product. Products are still ordered
 * by the canonical dairy layout (CLAUDE.md §9) — brand.displayOrder →
 * categoryDisplayOrder → product.displayOrder → name — so items still cluster
 * sensibly (all the milk together, then curd, …) even though the bill no
 * longer prints a category header row; category is purely a sort key here,
 * not a grouping level.
 *
 * The bill used to fold every dispatch into six pre-printed pad rows (MILK /
 * CURD / GHEE / …), mirroring the physical stationery. That generalized real
 * products away — a bill listing "MILK ₹1,72,900" doesn't say which of the
 * salesperson's several milk SKUs that covers. This version lists each
 * product actually dispatched under its brand, so the bill reads like an
 * itemized invoice instead of a lump-sum slip.
 *
 * @typedef {{
 *   brandName: string, brandDisplayOrder?: number,
 *   categoryDisplayOrder?: number,
 *   productName: string, displayOrder?: number,
 *   quantity: number, totalAmount: number,
 *   unitType?: string|null, unitSize?: number|null,
 *   unitsPerContainer?: number|null, containerType?: string|null,
 * }} BillItem
 */

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
 * Groups dispatch line items into Brand → Product, each product summed
 * across the whole billed period with a derived rate.
 *
 * Rate is amount ÷ quantity — read-only and never invented, so a product
 * supplied at more than one price over the period bills at the weighted
 * average actually charged.
 *
 * @param {BillItem[]} items
 * @returns {{
 *   brands: Array<{
 *     brandName: string,
 *     products: Array<{
 *       productName: string, unit: string,
 *       quantity: number, rate: number|null, amount: number,
 *     }>,
 *     amount: number,
 *   }>,
 *   totalAmount: number,
 * }}
 */
function buildBillLines(items = []) {
  // brandName -> { displayOrder, products: Map(productName -> {...}) }
  const brandMap = new Map();

  const ensureProduct = (brandName, brandDisplayOrder, categoryDisplayOrder, productName, displayOrder, unit) => {
    if (!brandMap.has(brandName)) {
      brandMap.set(brandName, { displayOrder: brandDisplayOrder, products: new Map() });
    }
    const brand = brandMap.get(brandName);
    if (!brand.products.has(productName)) {
      brand.products.set(productName, { displayOrder, categoryOrder: categoryDisplayOrder, unit, quantity: 0, amount: 0 });
    }
    return brand.products.get(productName);
  };

  for (const item of items) {
    const product = ensureProduct(
      item.brandName, item.brandDisplayOrder ?? DEFAULT_ORDER,
      item.categoryDisplayOrder ?? DEFAULT_ORDER,
      item.productName, item.displayOrder ?? DEFAULT_ORDER,
      unitLabel(item.unitType),
    );
    product.quantity += measureOf(item);
    product.amount   += Number(item.totalAmount ?? 0);
  }

  const brands = Array.from(brandMap.entries())
    .map(([brandName, brand]) => {
      const products = Array.from(brand.products.entries())
        .map(([productName, p]) => {
          const quantity = round2(p.quantity);
          const amount   = round2(p.amount);
          return {
            productName, _categoryOrder: p.categoryOrder, _displayOrder: p.displayOrder,
            unit: p.unit, quantity,
            rate: quantity ? round2(amount / quantity) : null,
            amount,
          };
        })
        // Category order is still the primary tiebreak, even though it's
        // never shown — otherwise curd could print ahead of milk just
        // because its product name sorts earlier.
        .sort((a, b) => a._categoryOrder - b._categoryOrder || a._displayOrder - b._displayOrder || a.productName.localeCompare(b.productName))
        .map(({ _categoryOrder, _displayOrder, ...rest }) => rest);

      return {
        brandName, _displayOrder: brand.displayOrder, products,
        amount: round2(products.reduce((s, p) => s + p.amount, 0)),
      };
    })
    .sort((a, b) => a._displayOrder - b._displayOrder || a.brandName.localeCompare(b.brandName))
    .map(({ _displayOrder, ...rest }) => rest);

  const totalAmount = round2(brands.reduce((s, b) => s + b.amount, 0));
  return { brands, totalAmount };
}

module.exports = { buildBillLines, unitLabel, measureOf };
