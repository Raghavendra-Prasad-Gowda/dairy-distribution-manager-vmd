const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

// Salesman can only read their own prices; admin can read any
const getPrices = asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.params.id, 'Salesperson ID');

  if (req.user.role === 'salesman' && req.user.salespersonId !== salespersonId) {
    throw new AppError('Access denied', 403);
  }

  const products = await prisma.product.findMany({
    where: { isActive: true, showInStockReceipt: true },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ brandId: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
  });

  const today = new Date();
  const priceRows = await prisma.salespersonPrice.findMany({
    where: { salespersonId, effectiveFrom: { lte: today } },
    orderBy: { effectiveFrom: 'desc' },
  });

  const priceMap = {};
  for (const row of priceRows) {
    if (!priceMap[row.productId]) priceMap[row.productId] = row;
  }

  const result = products.map((p) => ({
    productId:          p.id,
    productName:        p.name,
    brandId:            p.brandId,
    brandName:          p.brand.name,
    displayOrder:       p.displayOrder,
    category:           p.category,
    unitType:           p.unitType,
    unitSize:           p.unitSize,
    containerType:      p.containerType,
    unitsPerContainer:  p.unitsPerContainer,
    showInStockReceipt: p.showInStockReceipt,
    sellingPrice:       priceMap[p.id] ? Number(priceMap[p.id].sellingPrice) : null,
    effectiveFrom:      priceMap[p.id]?.effectiveFrom ?? null,
  }));

  res.json({ success: true, data: result });
});

// Admin only — sets prices for a salesperson
const bulkSave = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

  const salespersonId = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.bulkSalespersonPrices, req, res);
  if (!data) return;

  const effectiveFrom = new Date(data.effectiveFrom);
  const upserts = data.prices.map((item) =>
    prisma.salespersonPrice.upsert({
      where: { salespersonId_productId_effectiveFrom: { salespersonId, productId: item.productId, effectiveFrom } },
      update: { sellingPrice: item.sellingPrice },
      create: { salespersonId, productId: item.productId, sellingPrice: item.sellingPrice, effectiveFrom },
    })
  );

  await prisma.$transaction(upserts);
  res.json({ success: true, data: { message: `${data.prices.length} prices saved` } });
});

module.exports = { getPrices, bulkSave };
