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

  const [products, enabledRows, priceRows, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, showInStockReceipt: true, ...(isSalesman ? { salespersonEnabled: true } : {}) },
      include: { brand: { select: { id: true, name: true, salespersonDisplayOrder: true } } },
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
    // Compare in IST date space, not UTC instant. effective_from is a DATE
    // column; a price saved today (IST) stores as today's UTC midnight. Between
    // 00:00–05:30 IST the UTC clock is still on yesterday, so a naive
    // `lte: new Date()` would silently exclude prices the admin just saved.
    prisma.salespersonPrice.findMany({
      where: { salespersonId, effectiveFrom: { lte: new Date(getIndiaDateStr()) } },
      orderBy: { effectiveFrom: 'desc' },
    }),
    prisma.category.findMany({
      select: { brandId: true, name: true, salespersonDisplayOrder: true },
    }),
  ]);

  const enabledMap = Object.fromEntries(enabledRows.map(r => [r.productId, r.isEnabled]));

  const priceMap = {};
  for (const row of priceRows) {
    if (!priceMap[row.productId]) priceMap[row.productId] = row;
  }

  // Build category display-order lookup keyed by "brandId|categoryName"
  const catOrderMap = {};
  for (const cat of categories) {
    catOrderMap[`${cat.brandId}|${cat.name}`] = cat.salespersonDisplayOrder;
  }

  // Salesman: DB already filters salespersonEnabled=true; no extra JS filter needed
  const visibleProducts = products;

  const result = visibleProducts.map((p) => ({
    productId:            p.id,
    productName:          p.name,
    brandId:              p.brandId,
    brandName:            p.brand.name,
    brandDisplayOrder:    p.brand.salespersonDisplayOrder,
    displayOrder:         p.salespersonDisplayOrder,
    category:             p.category,
    categoryDisplayOrder: catOrderMap[`${p.brandId}|${p.category}`] ?? 999,
    unitType:             p.unitType,
    unitSize:             p.unitSize,
    containerType:        p.containerType,
    unitsPerContainer:    p.unitsPerContainer,
    showInStockReceipt:   p.showInStockReceipt,
    salespersonEnabled:   p.salespersonEnabled,
    isEnabled:            p.salespersonEnabled && (enabledMap[p.id] ?? true),
    dairyCostPrice:       Number(p.costPrice),
    dairySellingPrice:    Number(p.sellingPrice),
    sellingPrice:         priceMap[p.id] ? Number(priceMap[p.id].sellingPrice) : null,
    effectiveFrom:        priceMap[p.id]?.effectiveFrom ?? null,
  }));

  res.json({ success: true, data: result });
});

// Admin only — sets prices for a salesperson
const bulkSave = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

  const salespersonId = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.bulkSalespersonPrices, req, res);
  if (!data) return;

  const globalDate = new Date(data.effectiveFrom);
  // For each price, also delete any later-dated rows for the same (salesperson,
  // product). Without this, picking an EARLIER effective date leaves the
  // existing later-dated row as the "latest" — so the admin's change
  // (yesterday) is invisible because today's row still wins the desc ordering.
  // Earlier rows are preserved (historical record of "this price was active
  // starting on X").
  const ops = data.prices.flatMap((item) => {
    const effectiveFrom = item.effectiveFrom ? new Date(item.effectiveFrom) : globalDate;
    return [
      prisma.salespersonPrice.deleteMany({
        where: {
          salespersonId,
          productId: item.productId,
          effectiveFrom: { gt: effectiveFrom },
        },
      }),
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
