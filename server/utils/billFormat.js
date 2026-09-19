'use strict';

/**
 * Bill line formatting — the six fixed rows of Vikas Milk Dairy's printed
 * cash/credit bill pad.
 *
 * The pad the dairy hands to salespeople has a pre-printed six-row table
 * (MILK, CURD, GHEE, PANNEER / KOVA, BUTTER, OTHERS), so the generated PDF
 * prints all six every time — blank where there was no supply — instead of one
 * row per category. That is why this file does NOT apply the canonical
 * brand → category → product sort from CLAUDE.md §9: the row order here is the
 * stationery's, fixed, and not a product listing at all.
 *
 * Every product category in the system is mapped onto one of those rows;
 * anything that doesn't match a known alias falls into OTHERS so no supply can
 * ever go unbilled.
 */

/** The six printed rows, in the order they appear on the pad. */
const BILL_ROWS = ['MILK', 'CURD', 'GHEE', 'PANNEER / KOVA', 'BUTTER', 'OTHERS'];

const OTHERS = 'OTHERS';

/**
 * Category-name aliases → printed row. Matching is done on a normalized form
 * (uppercased, non-alphanumerics stripped) so "Panneer/Kova", "paneer & kova"
 * and "PANNEER  KOVA" all land on the same row.
 */
const ROW_ALIASES = {
  MILK: 'MILK',
  MILKS: 'MILK',
  TONEDMILK: 'MILK',
  CURD: 'CURD',
  CURDS: 'CURD',
  DAHI: 'CURD',
  GHEE: 'GHEE',
  PANNEER: 'PANNEER / KOVA',
  PANEER: 'PANNEER / KOVA',
  KOVA: 'PANNEER / KOVA',
  KHOVA: 'PANNEER / KOVA',
  PANNEERKOVA: 'PANNEER / KOVA',
  PANEERKOVA: 'PANNEER / KOVA',
  BUTTER: 'BUTTER',
};

function normalize(name) {
  return String(name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Rounds to 2dp, collapsing float noise from summing litres/kgs. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Maps a product category name onto one of the six printed rows.
 * Unknown / missing categories go to OTHERS.
 */
function resolveBillRow(categoryName) {
  const key = normalize(categoryName);
  if (!key) return OTHERS;
  if (ROW_ALIASES[key]) return ROW_ALIASES[key];
  // Substring fallback: "Milk 500ml Pouches" still bills as MILK.
  for (const [alias, row] of Object.entries(ROW_ALIASES)) {
    if (key.includes(alias)) return row;
  }
  return OTHERS;
}

/**
 * The billable measure of one dispatch line, in the unit the pad quotes rates
 * in: ml products bill per litre, gram products per kg, everything else per
 * piece. Mirrors the crate/litre/kg conversion the Stock Summary reports use.
 */
function measureOf(item) {
  const qty      = Number(item.quantity ?? 0);
  const unitSize = item.unitSize != null ? Number(item.unitSize) : null;
  if (item.unitType === 'ml'   && unitSize) return { unit: 'ltr', value: (qty * unitSize) / 1000 };
  if (item.unitType === 'gram' && unitSize) return { unit: 'kg',  value: (qty * unitSize) / 1000 };
  return { unit: 'pcs', value: qty };
}

/**
 * Aggregates dispatch line items into the six printed bill rows.
 *
 * Rate is derived read-only as amount ÷ quantity — the bill quotes one rate per
 * row (e.g. "52/ltr"), so when a row's products were supplied at several rates
 * this reports the weighted average actually charged, never an invented figure.
 *
 * When a single row mixes units (a category holding both litre- and kg-priced
 * products), quantity and rate are reported as null and only the amount is
 * printed: summing litres and kilograms into one number would make the rate
 * meaningless, and a bill must not show a figure that doesn't reconcile.
 *
 * @param {Array<{ category?: string|null, quantity: number, totalAmount: number,
 *   unitType?: string|null, unitSize?: number|null }>} items
 * @returns {{
 *   lines: Array<{ label: string, unit: string|null, quantity: number|null,
 *                  rate: number|null, amount: number }>,
 *   totalAmount: number,
 * }}
 */
function buildBillLines(items = []) {
  // row label -> { amount, byUnit: { ltr: n, kg: n, pcs: n } }
  const rows = new Map(BILL_ROWS.map((label) => [label, { amount: 0, byUnit: {} }]));

  for (const item of items) {
    const row = rows.get(resolveBillRow(item.category));
    const { unit, value } = measureOf(item);
    row.amount += Number(item.totalAmount ?? 0);
    row.byUnit[unit] = (row.byUnit[unit] ?? 0) + value;
  }

  const lines = BILL_ROWS.map((label) => {
    const row = rows.get(label);
    const amount = round2(row.amount);
    const used = Object.entries(row.byUnit).filter(([, v]) => round2(v) !== 0);

    if (used.length !== 1) {
      // Nothing supplied (blank row), or several units in one row — see above.
      return { label, unit: null, quantity: null, rate: null, amount };
    }

    const [unit, rawQty] = used[0];
    const quantity = round2(rawQty);
    return { label, unit, quantity, rate: quantity ? round2(amount / quantity) : null, amount };
  });

  return { lines, totalAmount: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

module.exports = { BILL_ROWS, resolveBillRow, buildBillLines, measureOf };
