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
      where: { isActive: true, showInStockReceipt: true, ...(isSalesman ? { salespersonEnabled: true } : {}) },
      include: {
        brand: {
          select: { id: true, name: true, salespersonDisplayOrder: true },
        },
      },
      orderBy: [
        { brand: { salespersonDisplayOrder: 'asc' } },
        { salespersonDisplayOrder: 'asc' },
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
      select: { brandId: true, name: true, salespersonDisplayOrder: true },
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
    catOrderMap[`${cat.brandId}|${cat.name}`] = cat.salespersonDisplayOrder;
  }

  // Salesman: only show products explicitly enabled for them (isEnabled=true).
  // No SalespersonProduct row defaults to hidden (false) for salesmen.
  const visibleProducts = isSalesman
    ? products.filter(p => enabledMap[p.id] ?? false)
    : products;

  const result = visibleProducts.map((p) => ({
    productId:               p.id,
    productName:             p.name,
    brandId:                 p.brandId,
    brandName:               p.brand.name,
    brandDisplayOrder:       p.brand.salespersonDisplayOrder,
    displayOrder:            p.salespersonDisplayOrder,
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
    sellingPrice:            priceMap[p.id] ? Number(priceMap[p.id].sellingPrice) : null,
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

module.exports = { getPrices, bulkSave };
