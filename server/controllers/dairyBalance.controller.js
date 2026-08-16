const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { computeDairyBalance } = require('../services/balanceService');

/** Serialize a persisted DairyBalance row to the numeric snapshot shape. */
function serializeBalance(existing) {
  return {
    ...existing,
    openingBalance: Number(existing.openingBalance),
    stockValue:     Number(existing.stockValue),
    depositValue:   Number(existing.depositValue ?? 0),
    topUpAmount:    Number(existing.topUpAmount ?? 0),
    amountPaid:     Number(existing.amountPaid),
    closingBalance: Number(existing.closingBalance),
  };
}

/**
 * Resolve a brand+date balance snapshot from a (possibly pre-fetched) persisted
 * row, falling back to an on-the-fly compute via balanceService — the SINGLE
 * source of truth for the formula — so the fallback can never disagree with the
 * cascade (top-ups add, deposit rules identical to the writer).
 */
function resolveBalance(brandId, date, existing) {
  return existing ? serializeBalance(existing) : computeDairyBalance(brandId, date);
}

/**
 * Returns the DairyBalance snapshot for a brand+date. Uses the persisted row
 * when one exists; otherwise computes it on the fly.
 */
async function getOrBuildBalance(brandId, date) {
  const balanceDate = new Date(date);
  const existing = await prisma.dairyBalance.findUnique({
    where: { brandId_balanceDate: { brandId, balanceDate } },
  });
  return resolveBalance(brandId, date, existing);
}

const getAll = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const brands = await prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  // Batch-fetch every persisted row for the date in ONE query instead of a
  // findUnique per brand (the common path where rows already exist). Only
  // brands with no cached row fall through to a compute.
  const existingRows = await prisma.dairyBalance.findMany({
    where: { balanceDate: new Date(date), brandId: { in: brands.map(b => b.id) } },
  });
  const existingByBrand = new Map(existingRows.map(r => [r.brandId, r]));

  const balances = await Promise.all(
    brands.map(async (b) => {
      const bal = await resolveBalance(b.id, date, existingByBrand.get(b.id));
      return { brandId: b.id, brandName: b.name, ...bal };
    })
  );
  res.json({ success: true, data: { date, brands: balances } });
});

const getByBrand = asyncHandler(async (req, res) => {
  const brandId = parseId(req.params.brandId, 'Brand ID');
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new AppError('Brand not found', 404);

  const bal = await getOrBuildBalance(brandId, date);
  res.json({ success: true, data: { brandId, brandName: brand.name, ...bal } });
});

const getRouteBreakdown = asyncHandler(async (req, res) => {
  const { brandId, from, to } = req.query;
  const brandIdInt = parseId(brandId, 'Brand ID');
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !dateRe.test(from)) throw new AppError('from date is required (YYYY-MM-DD)', 400);
  if (!to   || !dateRe.test(to))   throw new AppError('to date is required (YYYY-MM-DD)', 400);
  if (from > to) throw new AppError('from must be on or before to', 400);

  const rows = await prisma.$queryRaw`
    SELECT
      sr.route_id                                              AS "routeId",
      r.route_number                                           AS "routeNumber",
      r.display_order                                          AS "displayOrder",
      SUM(sr.quantity * sr.unit_price)::numeric(12,2)          AS "totalAmount",
      SUM(sr.quantity)::numeric(12,2)                          AS "totalQuantity"
    FROM   stock_receipts sr
    LEFT JOIN routes r ON r.id = sr.route_id
    WHERE  sr.brand_id     = ${brandIdInt}
      AND  sr.receipt_date >= ${from}::date
      AND  sr.receipt_date <= ${to}::date
    GROUP BY sr.route_id, r.route_number, r.display_order
    ORDER BY r.display_order, r.route_number
  `;

  // Prisma returns BigInt/Decimal objects from $queryRaw — normalise to numbers
  const data = rows.map(r => ({
    routeId:       Number(r.routeId),
    routeNumber:   r.routeNumber ?? (Number(r.routeId) === 0 ? 'General' : `Route ${r.routeId}`),
    displayOrder:  Number(r.displayOrder ?? 0),
    totalAmount:   Number(r.totalAmount),
    totalQuantity: Number(r.totalQuantity),
  }));

  res.json({ success: true, data });
});

module.exports = { getAll, getByBrand, getRouteBreakdown };
