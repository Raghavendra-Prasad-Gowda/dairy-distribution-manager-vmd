/**
 * Single source of truth for deposit qualification + line-amount calculation.
 *
 * Used by both balanceService (ledger writes) and reports.controller (display).
 * If these ever drift, the ledger and the report will disagree to the paisa.
 */

/**
 * @param {Object} product   { unitType, unitSize, containerType, depositEnabled, category }
 * @param {Object} brand     { depositEnabled, depositPerLitre }
 * @param {Set<string>} enabledCategoryNames
 */
function qualifiesForDeposit(product, brand, enabledCategoryNames) {
  if (!brand?.depositEnabled) return false;
  if (Number(brand.depositPerLitre ?? 0) <= 0) return false;
  if (!product?.depositEnabled) return false;
  if (product.unitType !== 'ml' && product.unitType !== 'gram') return false;
  if (product.containerType !== 'crate') return false;
  if (!product.unitSize) return false;
  return enabledCategoryNames.has(product.category ?? '');
}

/**
 * Returns the deposit amount in rupees for a single qualifying receipt line,
 * rounded to 2 decimal places (paisa). Callers should sum these without
 * re-rounding to avoid drift.
 *
 * @param {number} quantity      Whole units (e.g., bottles or pouches).
 * @param {number} unitSizeMlOrG Pack size in ml or grams.
 * @param {number} depositPerLitre Rupees per litre/kg of deposit.
 */
function calculateLineDeposit(quantity, unitSizeMlOrG, depositPerLitre) {
  const litres = Number(unitSizeMlOrG) / 1000;
  return Math.round(Number(quantity) * litres * Number(depositPerLitre) * 100) / 100;
}

module.exports = { qualifiesForDeposit, calculateLineDeposit };
