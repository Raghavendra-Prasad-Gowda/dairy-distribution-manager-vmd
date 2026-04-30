const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateDairyBalance } = require('../services/balanceService');

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

  const upserts = data.items.map((item) =>
    prisma.stockReceipt.upsert({
      where: { productId_receiptDate_routeId: { productId: item.productId, receiptDate, routeId } },
      update: { quantity: item.quantity, unitPrice: item.unitPrice, brandId: data.brandId },
      create: { brandId: data.brandId, productId: item.productId, routeId, receiptDate, quantity: item.quantity, unitPrice: item.unitPrice },
    })
  );

  const results = await prisma.$transaction(upserts);
  await recalculateDairyBalance(data.brandId, data.date);

  res.json({ success: true, data: results });
});

module.exports = { getAll, getAvailability, bulkCreate };
