const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /products?brandId=&date=YYYY-MM-DD
// When ?date= is supplied, costPrice on each product reflects the price effective on that date.
router.get('/', asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.query.brandId) where.brandId = parseId(req.query.brandId, 'Brand ID');
  if (req.query.all === 'true') delete where.isActive;
  const products = await prisma.product.findMany({
    where,
    include: {
      brand:      { select: { id: true, name: true } },
      costPrices: { orderBy: { effectiveFrom: 'desc' }, take: 1, select: { effectiveFrom: true } },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });

  if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    const targetDate = new Date(req.query.date);
    const priceRows = await prisma.productCostPrice.findMany({
      where: {
        productId:     { in: products.map(p => p.id) },
        effectiveFrom: { lte: targetDate },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    const priceMap = {};
    for (const row of priceRows) {
      if (!(row.productId in priceMap)) priceMap[row.productId] = row.costPrice;
    }
    for (const p of products) {
      if (p.id in priceMap) p.costPrice = priceMap[p.id];
    }
  }

  res.json({ success: true, data: products });
}));

// PATCH /products/reorder
router.patch('/reorder', asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderProducts, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.product.update({ where: { id }, data: { displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} products reordered` } });
}));

// POST /products
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createProduct, req, res);
  if (!data) return;
  const product = await prisma.$transaction(async (tx) => {
    const { effectiveFrom: effectiveFromStr, ...productData } = data;
    const created = await tx.product.create({
      data:    productData,
      include: { brand: { select: { id: true, name: true } } },
    });
    if (productData.costPrice > 0) {
      const effectiveFrom = effectiveFromStr ? new Date(effectiveFromStr) : new Date();
      effectiveFrom.setUTCHours(0, 0, 0, 0);
      await tx.productCostPrice.create({
        data: { productId: created.id, costPrice: productData.costPrice, effectiveFrom },
      });
    }
    return created;
  });
  res.status(201).json({ success: true, data: product });
}));

// PUT /products/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  const data = validate(schemas.updateProduct, req, res);
  if (!data) return;

  const { effectiveFrom: effectiveFromStr, ...productData } = data;

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id }, data: productData });

    if (productData.costPrice !== undefined) {
      const effectiveFrom = effectiveFromStr ? new Date(effectiveFromStr) : new Date();
      effectiveFrom.setUTCHours(0, 0, 0, 0);

      await tx.productCostPrice.upsert({
        where:  { productId_effectiveFrom: { productId: id, effectiveFrom } },
        update: { costPrice: productData.costPrice },
        create: { productId: id, costPrice: productData.costPrice, effectiveFrom },
      });

      // Keep Product.costPrice in sync with the latest history entry
      const latest = await tx.productCostPrice.findFirst({
        where:   { productId: id },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (latest) {
        return tx.product.update({ where: { id }, data: { costPrice: latest.costPrice } });
      }
    }

    return updated;
  });

  res.json({ success: true, data: product });
}));

// DELETE /products/:id (soft delete)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  await prisma.product.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true, data: { message: 'Product deactivated' } });
}));

module.exports = router;
