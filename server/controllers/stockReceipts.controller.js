const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateDairyBalance } = require('../services/balanceService');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const getAll = asyncHandler(async (req, res) => {
  const { date, brandId } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const where = { receiptDate: new Date(date) };
  if (brandId) where.brandId = parseId(brandId, 'Brand ID');

  const receipts = await prisma.stockReceipt.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, costPrice: true } },
      brand:   { select: { id: true, name: true } },
    },
    orderBy: [{ brandId: 'asc' }, { productId: 'asc' }],
  });
  res.json({ success: true, data: receipts });
});

const getAvailability = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const receiptDate = new Date(date);

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ brandId: 'asc' }, { name: 'asc' }],
  });

  const [receipts, dispatched] = await Promise.all([
    prisma.stockReceipt.groupBy({
      by: ['productId'],
      where: { receiptDate },
      _sum: { quantity: true },
    }),
    prisma.stockDispatchItem.groupBy({
      by: ['productId'],
      where: { dispatch: { dispatchDate: receiptDate } },
      _sum: { quantity: true },
    }),
  ]);

  const receivedMap = Object.fromEntries(receipts.map(r => [r.productId, Number(r._sum.quantity ?? 0)]));
  const dispatchedMap = Object.fromEntries(dispatched.map(d => [d.productId, Number(d._sum.quantity ?? 0)]));

  const result = products.map((p) => ({
    productId:   p.id,
    productName: p.name,
    brandId:     p.brandId,
    brandName:   p.brand.name,
    received:    receivedMap[p.id] ?? 0,
    dispatched:  dispatchedMap[p.id] ?? 0,
    available:   (receivedMap[p.id] ?? 0) - (dispatchedMap[p.id] ?? 0),
    costPrice:   Number(p.costPrice),
  }));

  res.json({ success: true, data: result });
});

const bulkCreate = asyncHandler(async (req, res) => {
  const data = validate(schemas.bulkStockReceipt, req, res);
  if (!data) return;

  const receiptDate = new Date(data.date);
  const routeId = data.routeId ?? 0;
  const nonZeroItems = data.items.filter(item => item.quantity > 0);

  // Full replace: delete all existing receipts for this brand+date+route, then insert non-zero
  await prisma.$transaction([
    prisma.stockReceipt.deleteMany({
      where: { brandId: data.brandId, receiptDate, routeId },
    }),
    ...nonZeroItems.map(item =>
      prisma.stockReceipt.create({
        data: { brandId: data.brandId, productId: item.productId, routeId, receiptDate, quantity: item.quantity, unitPrice: item.unitPrice },
      })
    ),
  ]);

  await recalculateDairyBalance(data.brandId, data.date);

  const totalValue = nonZeroItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalUnits = nonZeroItems.reduce((s, i) => s + i.quantity, 0);

  const [routeRow, products, balance, brandRow] = await Promise.all([
    routeId !== 0
      ? prisma.route.findUnique({ where: { id: routeId }, select: { routeNumber: true } })
      : Promise.resolve(null),
    prisma.product.findMany({
      where: { id: { in: nonZeroItems.map(i => i.productId) } },
      select: { id: true, unitsPerContainer: true },
    }),
    prisma.dairyBalance.findUnique({
      where: { brandId_balanceDate: { brandId: data.brandId, balanceDate: receiptDate } },
      select: { openingBalance: true, stockValue: true, depositValue: true, amountPaid: true, closingBalance: true },
    }),
    prisma.brand.findUnique({
      where: { id: data.brandId },
      select: { depositEnabled: true },
    }),
  ]);
  const routeNumber = routeRow?.routeNumber ?? null;
  const upcMap = Object.fromEntries(products.map(p => [p.id, p.unitsPerContainer]));
  const totalCrates = nonZeroItems.reduce((s, i) => {
    const upc = upcMap[i.productId];
    return upc ? s + i.quantity / upc : s;
  }, 0);

  void notifySlack(SLACK_EVENTS.STOCK_RECEIPT_SAVED, {
    brandId:        data.brandId,
    date:           data.date,
    routeNumber,
    savedCount:     nonZeroItems.length,
    totalUnits,
    totalCrates:    Math.round(totalCrates * 100) / 100,
    totalValue,
    depositEnabled: brandRow?.depositEnabled ?? false,
    openingBalance: Number(balance?.openingBalance ?? 0),
    stockValue:     Number(balance?.stockValue ?? 0),
    depositValue:   Number(balance?.depositValue ?? 0),
    amountPaid:     Number(balance?.amountPaid ?? 0),
    closingBalance: Number(balance?.closingBalance ?? 0),
  });

  res.json({ success: true, data: { saved: nonZeroItems.length } });
});

module.exports = { getAll, getAvailability, bulkCreate };
