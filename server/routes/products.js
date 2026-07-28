const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { getIndiaDateStr } = require('../utils/dateUtils');

const router = express.Router();

// GET /products?brandId=&date=YYYY-MM-DD
// When ?date= is supplied, costPrice on each product reflects the price effective on that date.
// Always returns upcomingCostPrice / upcomingSellingPrice (+ their dates) for any
// future-scheduled change, so the UI can render the "Upcoming" columns.
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

  // Fetch any future-scheduled price for both cost and selling. Earliest > today
  // wins (the next scheduled change). productIds is empty-safe.
  if (products.length) {
    const productIds = products.map(p => p.id);
    const todayIST = new Date(getIndiaDateStr());
    const [upcomingCostRaw, upcomingSellRaw] = await Promise.all([
      prisma.productCostPrice.findMany({
        where: { productId: { in: productIds }, effectiveFrom: { gt: todayIST } },
        orderBy: { effectiveFrom: 'asc' },
      }),
      prisma.productSellingPrice.findMany({
        where: { productId: { in: productIds }, effectiveFrom: { gt: todayIST } },
        orderBy: { effectiveFrom: 'asc' },
      }),
    ]);
    const upcomingCost = upcomingCostRaw ?? [];
    const upcomingSell = upcomingSellRaw ?? [];
    const upcomingCostMap = {};
    for (const row of upcomingCost) {
      if (!(row.productId in upcomingCostMap)) upcomingCostMap[row.productId] = row;
    }
    const upcomingSellMap = {};
    for (const row of upcomingSell) {
      if (!(row.productId in upcomingSellMap)) upcomingSellMap[row.productId] = row;
    }
    for (const p of products) {
      const uc = upcomingCostMap[p.id];
      const us = upcomingSellMap[p.id];
      p.upcomingCostPrice        = uc ? Number(uc.costPrice)     : null;
      p.upcomingCostPriceFrom    = uc ? uc.effectiveFrom         : null;
      p.upcomingSellingPrice     = us ? Number(us.sellingPrice)  : null;
      p.upcomingSellingPriceFrom = us ? us.effectiveFrom         : null;
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
  const todayIST = new Date(getIndiaDateStr());
  const product = await prisma.$transaction(async (tx) => {
    const { effectiveFrom: effectiveFromStr, sellingPriceEffectiveFrom: spEffectiveFromStr, ...productData } = data;
    // If the cost price's effectiveFrom is in the future, don't seed the
    // denormalized Product.costPrice with that future value — it would
    // immediately become "current" everywhere it's read.
    const costEff = effectiveFromStr ? new Date(effectiveFromStr) : todayIST;
    if (costEff > todayIST && productData.costPrice !== undefined) {
      productData.costPrice = 0; // keep denorm zero until the schedule kicks in
    }
    const sellEff = spEffectiveFromStr ? new Date(spEffectiveFromStr) : todayIST;
    if (sellEff > todayIST && productData.sellingPrice !== undefined) {
      productData.sellingPrice = 0;
    }
    const created = await tx.product.create({
      data:    productData,
      include: { brand: { select: { id: true, name: true } } },
    });
    if (data.costPrice > 0) {
      costEff.setUTCHours(0, 0, 0, 0);
      await tx.productCostPrice.create({
        data: { productId: created.id, costPrice: data.costPrice, effectiveFrom: costEff },
      });
    }
    if (data.sellingPrice > 0) {
      sellEff.setUTCHours(0, 0, 0, 0);
      await tx.productSellingPrice.create({
        data: { productId: created.id, sellingPrice: data.sellingPrice, effectiveFrom: sellEff },
      });
    }
    return created;
  });
  void notifySlack(SLACK_EVENTS.PRODUCT_CREATED, { brandId: product.brandId, name: product.name, category: product.category, costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice) });
  res.status(201).json({ success: true, data: product });
}));

// GET /products/salesperson-global — all products with global salespersonEnabled flag
router.get('/salesperson-global', asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, showInStockReceipt: true, brand: { isActive: true } },
      include: { brand: { select: { id: true, name: true, displayOrder: true } } },
      orderBy: [
        { brand: { displayOrder: 'asc' } },
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    }),
    prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
  ]);

  const catOrderMap = {};
  for (const cat of categories) {
    catOrderMap[`${cat.brandId}|${cat.name}`] = cat.displayOrder;
  }

  res.json({
    success: true,
    data: products.map(p => ({
      productId:               p.id,
      productName:             p.name,
      brandId:                 p.brandId,
      brandName:               p.brand.name,
      category:                p.category,
      categoryDisplayOrder:    catOrderMap[`${p.brandId}|${p.category}`] ?? 999,
      salespersonEnabled:      p.salespersonEnabled,
      salespersonDefaultPrice: Number(p.salespersonDefaultPrice),
      dairyCostPrice:          Number(p.costPrice),
      dairySellingPrice:       Number(p.sellingPrice),
    })),
  });
}));

// PATCH /products/salesperson-global — bulk update salespersonEnabled flag and/or default price
// Also cascades enable/disable to all salesmen automatically
router.patch('/salesperson-global', asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const { products } = req.body;
  if (!Array.isArray(products) || !products.length) throw new AppError('products array is required', 400);

  // Validate: if enabling (isEnabled=true), defaultPrice must be set and > 0
  for (const p of products) {
    if (p.isEnabled === true) {
      const defaultPrice = p.defaultPrice !== undefined ? p.defaultPrice : null;
      if (defaultPrice === null || defaultPrice === undefined || defaultPrice <= 0) {
        throw new AppError('Default price must be set and greater than 0 to enable a product for salespeople', 400);
      }
    }
  }

  // Separate enabling and disabling products
  const enablingIds = products.filter(p => p.isEnabled === true).map(p => p.productId);
  const disablingIds = products.filter(p => p.isEnabled === false).map(p => p.productId);

  // Fetch all active salespeople
  const allSalespeople = await prisma.salesperson.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const salesmanIds = allSalespeople.map(sp => sp.id);

  // Build transaction ops
  const txOps = [
    // Update global product settings
    ...products.map(({ productId, isEnabled, defaultPrice }) => {
      const updateData = {};
      if (isEnabled !== undefined) updateData.salespersonEnabled = isEnabled;
      if (defaultPrice !== undefined) updateData.salespersonDefaultPrice = defaultPrice;
      return prisma.product.update({ where: { id: productId }, data: updateData });
    }),
  ];

  // When enabling: delete any records (defaults to enabled)
  if (enablingIds.length) {
    txOps.push(
      prisma.salespersonProduct.deleteMany({
        where: { productId: { in: enablingIds } },
      })
    );
  }

  // When disabling: delete existing records and recreate with isEnabled=false for ALL salesmen
  if (disablingIds.length) {
    txOps.push(
      // First delete all existing records
      prisma.salespersonProduct.deleteMany({
        where: { productId: { in: disablingIds } },
      })
    );

    // Then create new records with isEnabled=false for all salesmen
    const disableRecords = [];
    for (const productId of disablingIds) {
      for (const salespersonId of salesmanIds) {
        disableRecords.push({ salespersonId, productId, isEnabled: false });
      }
    }

    if (disableRecords.length) {
      txOps.push(
        prisma.salespersonProduct.createMany({
          data: disableRecords,
          skipDuplicates: true,
        })
      );
    }
  }

  await prisma.$transaction(txOps);
  res.json({ success: true, data: { message: `${products.length} products updated` } });
}));

// DELETE /products/:id/salesperson-prices — clear all custom prices for a product (admin-only)
router.delete('/:id/salesperson-prices', asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const productId = parseId(req.params.id, 'Product ID');

  // Verify product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);

  // Query salesperson IDs that will be deleted
  const salespersonPrices = await prisma.salespersonPrice.findMany({
    where: { productId },
    select: { salespersonId: true },
  });

  const clearedSalespersonIds = salespersonPrices.map(sp => sp.salespersonId);

  // Delete all custom SalespersonPrice records for this product
  const result = await prisma.salespersonPrice.deleteMany({
    where: { productId },
  });

  res.json({
    success: true,
    data: {
      message: `Cleared custom prices for ${result.count} salespeople. All will now use the global default of ₹${Number(product.salespersonDefaultPrice)}.`,
      clearedCount: result.count,
      clearedSalespersonIds: clearedSalespersonIds,
    },
  });
}));

// PUT /products/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  const data = validate(schemas.updateProduct, req, res);
  if (!data) return;

  const { effectiveFrom: effectiveFromStr, sellingPriceEffectiveFrom: spEffectiveFromStr, ...productData } = data;
  const todayIST = new Date(getIndiaDateStr());

  // Drop costPrice / sellingPrice from the immediate Product update — we set
  // them below from the latest <= today price-history row. Otherwise a
  // future-dated PUT would land the future price on Product.costPrice for an
  // instant before being reverted.
  const denormCost    = productData.costPrice;
  const denormSelling = productData.sellingPrice;
  delete productData.costPrice;
  delete productData.sellingPrice;

  const product = await prisma.$transaction(async (tx) => {
    let updated = await tx.product.update({ where: { id }, data: productData });

    if (denormCost !== undefined) {
      const effectiveFrom = effectiveFromStr ? new Date(effectiveFromStr) : todayIST;
      effectiveFrom.setUTCHours(0, 0, 0, 0);
      await tx.productCostPrice.upsert({
        where:  { productId_effectiveFrom: { productId: id, effectiveFrom } },
        update: { costPrice: denormCost },
        create: { productId: id, costPrice: denormCost, effectiveFrom },
      });
      // Pick the latest price whose effectiveFrom is today or earlier — NEVER
      // promote a future-scheduled price into Product.costPrice.
      const latestCost = await tx.productCostPrice.findFirst({
        where: { productId: id, effectiveFrom: { lte: todayIST } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (latestCost) {
        updated = await tx.product.update({ where: { id }, data: { costPrice: latestCost.costPrice } });
      }
    }

    if (denormSelling !== undefined) {
      const effectiveFrom = spEffectiveFromStr ? new Date(spEffectiveFromStr) : todayIST;
      effectiveFrom.setUTCHours(0, 0, 0, 0);
      await tx.productSellingPrice.upsert({
        where:  { productId_effectiveFrom: { productId: id, effectiveFrom } },
        update: { sellingPrice: denormSelling },
        create: { productId: id, sellingPrice: denormSelling, effectiveFrom },
      });
      const latestSelling = await tx.productSellingPrice.findFirst({
        where: { productId: id, effectiveFrom: { lte: todayIST } },
        orderBy: { effectiveFrom: 'desc' },
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
