const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { getIndiaDateStr } = require('../utils/dateUtils');

// GET /salespeople/:id/prices
// - Salesman: only enabled products with their allocated prices
// - Admin: all active products with prices + isEnabled status (for price management)
const getPrices = asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.params.id, 'Salesperson ID');

  if (req.user.role === 'salesman' && req.user.salespersonId !== salespersonId) {
    throw new AppError('Access denied', 403);
  }

  const isSalesman = req.user.role === 'salesman';

  const todayIST = new Date(getIndiaDateStr());

  const [products, enabledRows, priceRows, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, showInStockReceipt: true, brand: { isActive: true } },
      include: {
        brand: {
          select: { id: true, name: true, displayOrder: true },
        },
      },
      // Salesman product layout mirrors the stock-receipt layout, so order by
      // the same stock-receipt display fields (brand → product).
      orderBy: [
        { brand: { displayOrder: 'asc' } },
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    }),
    prisma.salespersonProduct.findMany({
      where: { salespersonId },
      select: { productId: true, isEnabled: true },
    }),
    // Fetch ALL price rows for this salesperson — we split into "current"
    // (latest with effectiveFrom <= today IST) and "upcoming" (earliest with
    // effectiveFrom > today IST) below. Past/today rows live in priceMap;
    // future rows live in upcomingMap.
    prisma.salespersonPrice.findMany({
      where: { salespersonId },
      orderBy: { effectiveFrom: 'desc' },
    }),
    prisma.category.findMany({
      select: { brandId: true, name: true, displayOrder: true },
    }),
  ]);

  const enabledMap = Object.fromEntries(enabledRows.map(r => [r.productId, r.isEnabled]));

  // priceMap: current effective (latest with effectiveFrom <= today)
  // upcomingMap: earliest future-scheduled (effectiveFrom > today)
  const priceMap = {};
  const upcomingMap = {};
  for (const row of priceRows) {
    if (row.effectiveFrom > todayIST) {
      // priceRows is desc-ordered, so the LAST one we see for a product is
      // the earliest upcoming. Just overwrite — final value wins.
      upcomingMap[row.productId] = row;
    } else {
      // First we see (desc order) is the latest current.
      if (!priceMap[row.productId]) priceMap[row.productId] = row;
    }
  }

  // Build category display-order lookup keyed by "brandId|categoryName"
  const catOrderMap = {};
  for (const cat of categories) {
    catOrderMap[`${cat.brandId}|${cat.name}`] = cat.displayOrder;
  }

  // Salesman: only show products that are globally enabled AND enabled for them.
  // salespersonEnabled=false acts as a kill switch regardless of per-salesman rows.
  const visibleProducts = isSalesman
    ? products.filter(p => p.salespersonEnabled && (enabledMap[p.id] ?? false))
    : products;

  const result = visibleProducts.map((p) => ({
    productId:               p.id,
    productName:             p.name,
    brandId:                 p.brandId,
    brandName:               p.brand.name,
    brandDisplayOrder:       p.brand.displayOrder,
    displayOrder:            p.displayOrder,
    category:                p.category,
    categoryDisplayOrder:    catOrderMap[`${p.brandId}|${p.category}`] ?? 999,
    unitType:                p.unitType,
    unitSize:                p.unitSize,
    containerType:           p.containerType,
    unitsPerContainer:       p.unitsPerContainer,
    showInStockReceipt:      p.showInStockReceipt,
    salespersonEnabled:      p.salespersonEnabled,
    isEnabled:               p.salespersonEnabled && (enabledMap[p.id] ?? true),
    dairyCostPrice:          Number(p.costPrice),
    dairySellingPrice:       Number(p.sellingPrice),
    sellingPrice:            priceMap[p.id] ? Number(priceMap[p.id].sellingPrice) : Number(p.salespersonDefaultPrice),
    effectiveFrom:           priceMap[p.id]?.effectiveFrom ?? null,
    upcomingSellingPrice:    upcomingMap[p.id] ? Number(upcomingMap[p.id].sellingPrice) : null,
    upcomingEffectiveFrom:   upcomingMap[p.id]?.effectiveFrom ?? null,
  }));

  res.json({ success: true, data: result });
});

// Admin only — sets prices for a salesperson
const bulkSave = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const salespersonId = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.bulkSalespersonPrices, req, res);
  if (!data) return;

  const globalDate = new Date(data.effectiveFrom);
  const todayIST   = new Date(getIndiaDateStr());
  // Save semantics (past dates already rejected by schema validation):
  //   - newDate == today: just upsert (any existing today row is the target).
  //     Future-scheduled rows are PRESERVED — independent of today's change.
  //   - newDate >  today: scheduling a future. Replace any OTHER future-dated
  //     row for the same (sp, product) so the invariant "at most one upcoming"
  //     holds. The today row (if any) stays untouched.
  const ops = data.prices.flatMap((item) => {
    const effectiveFrom = item.effectiveFrom ? new Date(item.effectiveFrom) : globalDate;
    const isFuture = effectiveFrom > todayIST;
    const before = isFuture
      ? [prisma.salespersonPrice.deleteMany({
          where: {
            salespersonId,
            productId:     item.productId,
            effectiveFrom: { gt: todayIST, not: effectiveFrom },
          },
        })]
      : [];
    return [
      ...before,
      prisma.salespersonPrice.upsert({
        where: { salespersonId_productId_effectiveFrom: { salespersonId, productId: item.productId, effectiveFrom } },
        update: { sellingPrice: item.sellingPrice },
        create: { salespersonId, productId: item.productId, sellingPrice: item.sellingPrice, effectiveFrom },
      }),
    ];
  });

  await prisma.$transaction(ops);
  res.json({ success: true, data: { message: `${data.prices.length} prices saved` } });
});

// Admin only — copy prices from one salesman to another for a specific brand
const copyFromSalesman = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const targetSpId = parseId(req.params.id, 'Target Salesperson ID');
  const sourceSpId = parseId(req.params.sourceId, 'Source Salesperson ID');
  const brandId = parseId(req.query.brandId, 'Brand ID');

  if (targetSpId === sourceSpId) {
    throw new AppError('Source and target salesperson must be different', 400);
  }

  // Fetch all products for this brand
  const brandProducts = await prisma.product.findMany({
    where: { brandId, isActive: true, showInStockReceipt: true },
    select: { id: true },
  });

  if (!brandProducts.length) {
    return res.json({ success: true, data: { message: 'No products to copy for this brand' } });
  }

  const productIds = brandProducts.map(p => p.id);

  // Fetch all prices from source salesman for these products
  const sourcePrices = await prisma.salespersonPrice.findMany({
    where: {
      salespersonId: sourceSpId,
      productId: { in: productIds },
    },
  });

  if (!sourcePrices.length) {
    return res.json({ success: true, data: { message: 'No prices to copy from source salesman' } });
  }

  // Batch upsert to target — for each source price, create or update the same price row
  // for the target salesman (keyed by productId + effectiveFrom)
  const upsertOps = sourcePrices.map(sp =>
    prisma.salespersonPrice.upsert({
      where: {
        salespersonId_productId_effectiveFrom: {
          salespersonId: targetSpId,
          productId: sp.productId,
          effectiveFrom: sp.effectiveFrom,
        },
      },
      update: { sellingPrice: sp.sellingPrice },
      create: {
        salespersonId: targetSpId,
        productId: sp.productId,
        sellingPrice: sp.sellingPrice,
        effectiveFrom: sp.effectiveFrom,
      },
    })
  );

  await prisma.$transaction(upsertOps);
  res.json({ success: true, data: { message: `${sourcePrices.length} prices copied` } });
});

// Admin only — bulk update same price for multiple salesmen
const bulkUpdateMultipleSalesmen = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const data = validate(schemas.bulkUpdateSalespersonPrices, req, res);
  if (!data) return;

  const { salespersonIds, productId, sellingPrice, effectiveFrom } = data;
  const effectiveFromDate = new Date(effectiveFrom);
  const todayIST = new Date(getIndiaDateStr());

  // For each salesman, update or delete future prices and upsert the new one
  const ops = salespersonIds.flatMap((spId) => {
    const isFuture = effectiveFromDate > todayIST;
    const before = isFuture
      ? [prisma.salespersonPrice.deleteMany({
          where: {
            salespersonId: spId,
            productId,
            effectiveFrom: { gt: todayIST, not: effectiveFromDate },
          },
        })]
      : [];
    return [
      ...before,
      prisma.salespersonPrice.upsert({
        where: { salespersonId_productId_effectiveFrom: { salespersonId: spId, productId, effectiveFrom: effectiveFromDate } },
        update: { sellingPrice },
        create: { salespersonId: spId, productId, sellingPrice, effectiveFrom: effectiveFromDate },
      }),
    ];
  });

  await prisma.$transaction(ops);
  res.json({ success: true, data: { message: `Price updated for ${salespersonIds.length} salesmen` } });
});

module.exports = { getPrices, bulkSave, copyFromSalesman, bulkUpdateMultipleSalesmen };
