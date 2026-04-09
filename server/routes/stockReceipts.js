const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateDairyBalance } = require('../services/balanceService');

const router = express.Router();

// GET /stock-receipts?date=YYYY-MM-DD&brandId=
router.get('/', asyncHandler(async (req, res) => {
  const { date, brandId } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const where = { receiptDate: new Date(date) };
  if (brandId) where.brandId = parseId(brandId, 'Brand ID');

  const receipts = await prisma.stockReceipt.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, dairyPrice: true } },
      brand:   { select: { id: true, name: true } },
    },
    orderBy: [{ brandId: 'asc' }, { productId: 'asc' }],
  });
  res.json({ success: true, data: receipts });
}));

// GET /stock-receipts/availability?date=YYYY-MM-DD
// Returns availableQty per active product (received − dispatched)
router.get('/availability', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const receiptDate = new Date(date);

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ brandId: 'asc' }, { name: 'asc' }],
  });

  // Aggregate received qty per product
  const receipts = await prisma.stockReceipt.groupBy({
    by: ['productId'],
    where: { receiptDate },
    _sum: { quantity: true },
  });
  const receivedMap = {};
  receipts.forEach((r) => { receivedMap[r.productId] = Number(r._sum.quantity ?? 0); });

  // Aggregate dispatched qty per product
  const dispatched = await prisma.stockDispatchItem.groupBy({
    by: ['productId'],
    where: { dispatch: { dispatchDate: receiptDate } },
    _sum: { quantity: true },
  });
  const dispatchedMap = {};
  dispatched.forEach((d) => { dispatchedMap[d.productId] = Number(d._sum.quantity ?? 0); });

  const result = products.map((p) => ({
    productId:     p.id,
    productName:   p.name,
    brandId:       p.brandId,
    brandName:     p.brand.name,
    received:      receivedMap[p.id] ?? 0,
    dispatched:    dispatchedMap[p.id] ?? 0,
    available:     (receivedMap[p.id] ?? 0) - (dispatchedMap[p.id] ?? 0),
    dairyPrice:    Number(p.dairyPrice),
  }));

  res.json({ success: true, data: result });
}));

// POST /stock-receipts/bulk
router.post('/bulk', asyncHandler(async (req, res) => {
  const data = validate(schemas.bulkStockReceipt, req, res);
  if (!data) return;

  const receiptDate = new Date(data.date);

  // Upsert each product's receipt
  const upserts = data.items.map((item) =>
    prisma.stockReceipt.upsert({
      where: { productId_receiptDate: { productId: item.productId, receiptDate } },
      update: { quantity: item.quantity, unitPrice: item.unitPrice, brandId: data.brandId },
      create: {
        brandId:  data.brandId,
        productId: item.productId,
        receiptDate,
        quantity:  item.quantity,
        unitPrice: item.unitPrice,
      },
    })
  );

  const results = await prisma.$transaction(upserts);

  // Recalculate dairy balance after saving receipts
  await recalculateDairyBalance(data.brandId, data.date);

  res.json({ success: true, data: results });
}));

module.exports = router;
