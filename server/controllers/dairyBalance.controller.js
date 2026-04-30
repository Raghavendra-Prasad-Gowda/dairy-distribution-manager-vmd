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
    amountPaid:     Number(existing.amountPaid),
    closingBalance: Number(existing.closingBalance),
  };

  const prev = await prisma.dairyBalance.findFirst({
    where: { brandId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const receipts = await prisma.stockReceipt.findMany({
    where: { brandId, receiptDate: balanceDate },
    select: { quantity: true, unitPrice: true },
  });
  const paymentAgg = await prisma.dairyPayment.aggregate({
    where: { brandId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);
  const stockValue = receipts.reduce((s, r) => s + Number(r.quantity) * Number(r.unitPrice), 0);
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  return { brandId, balanceDate, openingBalance, stockValue, amountPaid, closingBalance: openingBalance + stockValue - amountPaid };
}

const getAll = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
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

module.exports = { getAll, getByBrand };
