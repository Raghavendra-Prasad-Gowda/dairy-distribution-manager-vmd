const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

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
      brand:         { select: { id: true, name: true } },
      costPrices:    { orderBy: { effectiveFrom: 'desc' }, take: 1, select: { effectiveFrom: true, updatedAt: true } },
      sellingPrices: { orderBy: { effectiveFrom: 'desc' }, take: 1, select: { effectiveFrom: true, updatedAt: true } },
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

// PATCH /products/salesperson-reorder
router.patch('/salesperson-reorder', asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderSalespersonProducts, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.product.update({ where: { id }, data: { salespersonDisplayOrder: displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} products reordered` } });
}));

// POST /products
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createProduct, req, res);
  if (!data) return;
  const product = await prisma.$transaction(async (tx) => {
    const { effectiveFrom: effectiveFromStr, sellingPriceEffectiveFrom: spEffectiveFromStr, ...productData } = data;
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
    if (productData.sellingPrice > 0) {
      const effectiveFrom = spEffectiveFromStr ? new Date(spEffectiveFromStr) : new Date();
      effectiveFrom.setUTCHours(0, 0, 0, 0);
      await tx.productSellingPrice.create({
        data: { productId: created.id, sellingPrice: productData.sellingPrice, effectiveFrom },
      });
    }
    return created;
  });
  void notifySlack(SLACK_EVENTS.PRODUCT_CREATED, { brandId: product.brandId, name: product.name, category: product.category, costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice) });
  res.status(201).json({ success: true, data: product });
}));

// GET /products/salesperson-global — all products with global salespersonEnabled flag
router.get('/salesperson-global', asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, showInStockReceipt: true },
      include: { brand: { select: { id: true, name: true, salespersonDisplayOrder: true } } },
      orderBy: [
        { brand: { salespersonDisplayOrder: 'asc' } },
        { salespersonDisplayOrder: 'asc' },
        { name: 'asc' },
      ],
    }),
    prisma.category.findMany({ select: { brandId: true, name: true, salespersonDisplayOrder: true } }),
  ]);

  const catOrderMap = {};
  for (const cat of categories) {
    catOrderMap[`${cat.brandId}|${cat.name}`] = cat.salespersonDisplayOrder;
  }

  res.json({
    success: true,
    data: products.map(p => ({
      productId:            p.id,
      productName:          p.name,
      brandId:              p.brandId,
      brandName:            p.brand.name,
      category:             p.category,
      categoryDisplayOrder: catOrderMap[`${p.brandId}|${p.category}`] ?? 999,
      salespersonEnabled:   p.salespersonEnabled,
      dairyCostPrice:       Number(p.costPrice),
      dairySellingPrice:    Number(p.sellingPrice),
    })),
  });
}));

// PATCH /products/salesperson-global — bulk update salespersonEnabled flag
router.patch('/salesperson-global', asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

  const { products } = req.body;
  if (!Array.isArray(products) || !products.length) throw new AppError('products array is required', 400);

  const enablingIds = products.filter(p => p.isEnabled).map(p => p.productId);

  await prisma.$transaction([
    ...products.map(({ productId, isEnabled }) =>
      prisma.product.update({ where: { id: productId }, data: { salespersonEnabled: isEnabled } })
    ),
    // Clear per-person disabled overrides so the product shows for all salespeople by default
    ...(enablingIds.length ? [
      prisma.salespersonProduct.deleteMany({
        where: { productId: { in: enablingIds }, isEnabled: false },
      }),
    ] : []),
  ]);
  res.json({ success: true, data: { message: `${products.length} products updated` } });
}));

// PUT /products/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  const data = validate(schemas.updateProduct, req, res);
  if (!data) return;

  const { effectiveFrom: effectiveFromStr, sellingPriceEffectiveFrom: spEffectiveFromStr, ...productData } = data;

  const product = await prisma.$transaction(async (tx) => {
    let updated = await tx.product.update({ where: { id }, data: productData });

    if (productData.costPrice !== undefined) {
      const effectiveFrom = effectiveFromStr ? new Date(effectiveFromStr) : new Date();
      effectiveFrom.setUTCHours(0, 0, 0, 0);
      await tx.productCostPrice.upsert({
        where:  { productId_effectiveFrom: { productId: id, effectiveFrom } },
        update: { costPrice: productData.costPrice },
        create: { productId: id, costPrice: productData.costPrice, effectiveFrom },
      });
      const latestCost = await tx.productCostPrice.findFirst({
        where: { productId: id }, orderBy: { effectiveFrom: 'desc' },
      });
      if (latestCost) {
        updated = await tx.product.update({ where: { id }, data: { costPrice: latestCost.costPrice } });
      }
    }

    if (productData.sellingPrice !== undefined) {
      const effectiveFrom = spEffectiveFromStr ? new Date(spEffectiveFromStr) : new Date();
      effectiveFrom.setUTCHours(0, 0, 0, 0);
      await tx.productSellingPrice.upsert({
        where:  { productId_effectiveFrom: { productId: id, effectiveFrom } },
        update: { sellingPrice: productData.sellingPrice },
        create: { productId: id, sellingPrice: productData.sellingPrice, effectiveFrom },
      });
      const latestSelling = await tx.productSellingPrice.findFirst({
        where: { productId: id }, orderBy: { effectiveFrom: 'desc' },
      });
      if (latestSelling) {
        updated = await tx.product.update({ where: { id }, data: { sellingPrice: latestSelling.sellingPrice } });
      }
    }

    return updated;
  });
  void notifySlack(SLACK_EVENTS.PRODUCT_UPDATED, { brandId: product.brandId, name: product.name, category: product.category, costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice), isActive: product.isActive });
  res.json({ success: true, data: product });
}));

// DELETE /products/:id (soft delete)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  const product = await prisma.product.update({ where: { id }, data: { isActive: false }, include: { brand: { select: { name: true } } } });
  void notifySlack(SLACK_EVENTS.PRODUCT_DELETED, { brandId: product.brandId, brandName: product.brand.name, name: product.name, category: product.category });
  res.json({ success: true, data: { message: 'Product deactivated' } });
}));

module.exports = router;
