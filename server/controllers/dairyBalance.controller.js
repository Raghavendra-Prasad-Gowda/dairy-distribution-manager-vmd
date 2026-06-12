const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

async function getOrBuildBalance(brandId, date) {
  const balanceDate = new Date(date);
  const existing = await prisma.dairyBalance.findUnique({
    where: { brandId_balanceDate: { brandId, balanceDate } },
  });
  if (existing) return {
    ...existing,
    openingBalance: Number(existing.openingBalance),
    stockValue:     Number(existing.stockValue),
    depositValue:   Number(existing.depositValue ?? 0),
    amountPaid:     Number(existing.amountPaid),
    closingBalance: Number(existing.closingBalance),
  };

  // No saved balance — compute on the fly (same logic as balanceService)
  const prev = await prisma.dairyBalance.findFirst({
    where: { brandId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const receipts = await prisma.stockReceipt.findMany({
    where: { brandId, receiptDate: balanceDate },
    select: { quantity: true, unitPrice: true, product: { select: { unitType: true, unitSize: true, containerType: true, category: true, depositEnabled: true } } },
  });
  const paymentAgg = await prisma.dairyPayment.aggregate({
    where: { brandId, paymentDate: balanceDate },
    _sum: { amount: true },
  });

  const openingBalance = Number(prev?.closingBalance ?? 0);
  const stockValue = receipts.reduce((s, r) => s + Number(r.quantity) * Number(r.unitPrice), 0);
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);

  // Deposit — mirrors balanceService._calcDairyBalance
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { depositEnabled: true, depositPerLitre: true },
  });
  let depositValue = 0;
  if (brand?.depositEnabled && Number(brand.depositPerLitre) > 0) {
    const depositPerLitre = Number(brand.depositPerLitre);
    const categories = await prisma.category.findMany({
      where: { brandId },
      select: { name: true, depositEnabled: true },
    });
    const enabledCategories = new Set(categories.filter(c => c.depositEnabled).map(c => c.name));
    depositValue = receipts.reduce((sum, r) => {
      const { unitType, unitSize, containerType, depositEnabled, category } = r.product;
      if (
        (unitType === 'ml' || unitType === 'gram') &&
        containerType === 'crate' &&
        unitSize &&
        depositEnabled &&
        enabledCategories.has(category ?? '')
      ) {
        return sum + Number(r.quantity) * (Number(unitSize) / 1000) * depositPerLitre;
      }
      return sum;
    }, 0);
  }

  const closingBalance = openingBalance + stockValue + depositValue - amountPaid;
  return { brandId, balanceDate, openingBalance, stockValue, depositValue, amountPaid, closingBalance };
}

const getAll = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const brands = await prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const balances = await Promise.all(
    brands.map(async (b) => {
      const bal = await getOrBuildBalance(b.id, date);
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
