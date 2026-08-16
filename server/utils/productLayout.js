'use strict';

/**
 * Canonical product "layout order" helpers.
 *
 * The dairy layout sorts products by:
 *   brand.displayOrder → category.displayOrder → product.displayOrder → name
 *
 * Because `Product.category` is a plain String (not a relation), Prisma can't
 * ORDER BY the category's displayOrder in one query. Every list therefore builds
 * a lookup map from a separate `category.findMany` and sorts in JS. That map +
 * comparator was copy-pasted across reports/salespersonPrices/salespersonProducts/
 * products — with an inconsistent key delimiter (`::` vs `|`) that was a latent
 * mismatch bug. This module is the single source of truth; key delimiter is `::`.
 */

const DEFAULT_ORDER = 999;
const SEP = '::';

/**
 * @param {Array<{brandId:number, name:string, displayOrder:number}>} categories
 * @returns {Map<string, number>} keyed `${brandId}::${categoryName}` → displayOrder
 */
function buildCategoryOrderMap(categories) {
  const map = new Map();
  for (const c of categories) map.set(`${c.brandId}${SEP}${c.name}`, c.displayOrder);
  return map;
}

/**
 * Look up a category's display order, defaulting to DEFAULT_ORDER (999) when the
 * product has no category or the category isn't found.
 */
function getCategoryOrder(catOrderMap, brandId, category) {
  return catOrderMap.get(`${brandId}${SEP}${category}`) ?? DEFAULT_ORDER;
}

/**
 * Comparator for product-shaped rows that expose `brand.displayOrder` (or a
 * precomputed `brandDisplayOrder`), `brandId`, `category`, `displayOrder`, `name`.
 * Pass the map from buildCategoryOrderMap().
 */
function compareProductsByLayout(catOrderMap) {
  return (a, b) =>
    (a.brand?.displayOrder ?? a.brandDisplayOrder ?? DEFAULT_ORDER) -
      (b.brand?.displayOrder ?? b.brandDisplayOrder ?? DEFAULT_ORDER) ||
    getCategoryOrder(catOrderMap, a.brandId, a.category) -
      getCategoryOrder(catOrderMap, b.brandId, b.category) ||
    (a.displayOrder ?? DEFAULT_ORDER) - (b.displayOrder ?? DEFAULT_ORDER) ||
    (a.name ?? '').localeCompare(b.name ?? '');
}

module.exports = { buildCategoryOrderMap, getCategoryOrder, compareProductsByLayout, DEFAULT_ORDER };
