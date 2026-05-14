const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

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
      where: { isActive: true },
      include: { brand: { select: { id: true, name: true, displayOrder: true } } },
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
    prisma.salespersonPrice.findMany({
      where: { salespersonId, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    }),
    prisma.category.findMany({
      select: { brandId: true, name: true, displayOrder: true },
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
    catOrderMap[`${cat.brandId}|${cat.name}`] = cat.displayOrder;
  }

  // Salesman only sees explicitly enabled products
  const visibleProducts = isSalesman
    ? products.filter(p => enabledMap[p.id] === true)
    : products;

  const result = visibleProducts.map((p) => ({
    productId:            p.id,
    productName:          p.name,
    brandId:              p.brandId,
    brandName:            p.brand.name,
    brandDisplayOrder:    p.brand.displayOrder,
    displayOrder:         p.displayOrder,
    category:             p.category,
    categoryDisplayOrder: catOrderMap[`${p.brandId}|${p.category}`] ?? 999,
    unitType:             p.unitType,
    unitSize:             p.unitSize,
    containerType:        p.containerType,
    unitsPerContainer:    p.unitsPerContainer,
    showInStockReceipt:   p.showInStockReceipt,
    isEnabled:            enabledMap[p.id] ?? false,
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
