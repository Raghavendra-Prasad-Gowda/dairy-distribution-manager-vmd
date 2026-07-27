const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

// Admin only — returns all active products with isEnabled status for a salesperson
const getProducts = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const salespersonId = parseId(req.params.id, 'Salesperson ID');

  const [products, enabledRows] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, showInStockReceipt: true, brand: { isActive: true } },
      include: { brand: { select: { id: true, name: true } } },
      orderBy: [{ brand: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.salespersonProduct.findMany({
      where: { salespersonId },
      select: { productId: true, isEnabled: true },
    }),
  ]);

  const enabledMap = Object.fromEntries(enabledRows.map(r => [r.productId, r.isEnabled]));

  const result = products.map(p => ({
    productId:         p.id,
    productName:       p.name,
    brandId:           p.brandId,
    brandName:         p.brand.name,
    category:          p.category,
    displayOrder:      p.displayOrder,
    unitType:          p.unitType,
    unitSize:          p.unitSize,
    containerType:     p.containerType,
    unitsPerContainer: p.unitsPerContainer,
    isEnabled:         enabledMap[p.id] ?? false,
  }));

  res.json({ success: true, data: result });
});

// Admin only — bulk enable/disable products for a salesperson
const bulkUpdate = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const salespersonId = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.bulkSalespersonProducts, req, res);
  if (!data) return;

  const upserts = data.products.map(item =>
    prisma.salespersonProduct.upsert({
      where: { salespersonId_productId: { salespersonId, productId: item.productId } },
      update: { isEnabled: item.isEnabled },
      create: { salespersonId, productId: item.productId, isEnabled: item.isEnabled },
    })
  );

  await prisma.$transaction(upserts);
  res.json({ success: true, data: { message: `${data.products.length} products updated` } });
});

// Admin only — bulk enable/disable products for multiple salespeople
const bulkUpdateMultipleSalesmen = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const data = validate(schemas.bulkUpdateMultipleSalespersonProducts, req, res);
  if (!data) return;

  // Create upsert for all (salespersonId × productId) combinations
  const upserts = [];
  for (const salespersonId of data.salespersonIds) {
    for (const product of data.products) {
      upserts.push(
        prisma.salespersonProduct.upsert({
          where: { salespersonId_productId: { salespersonId, productId: product.productId } },
          update: { isEnabled: product.isEnabled },
          create: { salespersonId, productId: product.productId, isEnabled: product.isEnabled },
        })
      );
    }
  }

  await prisma.$transaction(upserts);
  res.json({
    success: true,
    data: {
      message: `${data.products.length} products updated for ${data.salespersonIds.length} salesman(men)`,
    },
  });
});

module.exports = { getProducts, bulkUpdate, bulkUpdateMultipleSalesmen };
