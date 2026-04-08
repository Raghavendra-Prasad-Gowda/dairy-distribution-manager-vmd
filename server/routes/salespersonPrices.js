const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /salespeople/:id/prices
router.get('/:id/prices', asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.params.id, 'Salesperson ID');

  // For each active product, return the currently effective price (most recent effectiveFrom <= today)
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ brandId: 'asc' }, { name: 'asc' }],
  });

  const today = new Date();
  const priceRows = await prisma.salespersonPrice.findMany({
    where: {
      salespersonId,
      effectiveFrom: { lte: today },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  // Map: productId → latest price
  const priceMap = {};
  for (const row of priceRows) {
    if (!priceMap[row.productId]) priceMap[row.productId] = row;
  }

  const result = products.map((p) => ({
    productId: p.id,
    productName: p.name,
    brandId: p.brandId,
    brandName: p.brand.name,
    sellingPrice: priceMap[p.id] ? Number(priceMap[p.id].sellingPrice) : null,
    effectiveFrom: priceMap[p.id]?.effectiveFrom ?? null,
  }));

  res.json({ success: true, data: result });
}));

// POST /salespeople/:id/prices/bulk
router.post('/:id/prices/bulk', asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.bulkSalespersonPrices, req, res);
  if (!data) return;

  const effectiveFrom = new Date(data.effectiveFrom);

  // Upsert each price
  const upserts = data.prices.map((item) =>
    prisma.salespersonPrice.upsert({
      where: {
        salespersonId_productId_effectiveFrom: {
          salespersonId,
          productId: item.productId,
          effectiveFrom,
        },
      },
      update: { sellingPrice: item.sellingPrice },
      create: {
        salespersonId,
        productId: item.productId,
        sellingPrice: item.sellingPrice,
        effectiveFrom,
      },
    })
  );

  await prisma.$transaction(upserts);
  res.json({ success: true, data: { message: `${data.prices.length} prices saved` } });
}));

module.exports = router;
