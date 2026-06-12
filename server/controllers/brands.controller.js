const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

const getAll = asyncHandler(async (req, res) => {
  // Disabled brands are hidden everywhere; only the Brands setup page
  // requests includeInactive=true so admins can re-enable them.
  const includeInactive = req.query.includeInactive === 'true'
    && (req.user.role === 'admin' || req.user.role === 'superadmin');
  // Archived brands are NEVER returned — archive is permanent from the UI.
  const brands = await prisma.brand.findMany({
    where: includeInactive ? { isArchived: false } : { isActive: true, isArchived: false },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: brands });
});

const reorder = asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderBrands, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.brand.update({ where: { id }, data: { displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} brands reordered` } });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createBrand, req, res);
  if (!data) return;
  const brand = await prisma.brand.create({ data });
  res.status(201).json({ success: true, data: brand });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Brand ID');
  const data = validate(schemas.updateBrand, req, res);
  if (!data) return;
  if (data.name !== undefined && req.user.role !== 'superadmin') {
    throw new AppError('Only super admins can rename brands.', 403);
  }
  if (data.isActive !== undefined && req.user.role !== 'superadmin') {
    throw new AppError('Only super admins can enable or disable brands.', 403);
  }
  if (data.isArchived !== undefined) {
    if (req.user.role !== 'superadmin') {
      throw new AppError('Only super admins can archive brands.', 403);
    }
    if (data.isArchived !== true) {
      throw new AppError('Archived brands cannot be restored from the app.', 400);
    }
    // Archiving also deactivates so every isActive filter excludes it.
    data.isActive = false;
  }
  const brand = await prisma.brand.update({ where: { id }, data });
  res.json({ success: true, data: brand });
});

const salespersonReorder = asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderSalespersonBrands, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.brand.update({ where: { id }, data: { salespersonDisplayOrder: displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} brands reordered` } });
});

const copyProducts = asyncHandler(async (req, res) => {
  const targetBrandId = parseId(req.params.id, 'Brand ID');
  const data = validate(schemas.copyBrandProducts, req, res);
  if (!data) return;
  const { sourceBrandId } = data;

  if (sourceBrandId === targetBrandId) {
    throw new AppError('Source and target brands must be different.', 400);
  }

  const [sourceBrand, targetBrand] = await Promise.all([
    prisma.brand.findUnique({ where: { id: sourceBrandId } }),
    prisma.brand.findUnique({ where: { id: targetBrandId } }),
  ]);
  if (!sourceBrand) throw new AppError('Source brand not found.', 404);
  if (!targetBrand) throw new AppError('Target brand not found.', 404);

  const [sourceCategories, sourceProducts] = await Promise.all([
    prisma.category.findMany({ where: { brandId: sourceBrandId } }),
    prisma.product.findMany({ where: { brandId: sourceBrandId, isActive: true } }),
  ]);

  const { copiedProducts, copiedCategories, copiedSalespersonAssignments, copiedSalespersonPrices } = await prisma.$transaction(async (tx) => {
    const existingCatNames = new Set(
      (await tx.category.findMany({ where: { brandId: targetBrandId }, select: { name: true } }))
        .map(c => c.name)
    );
    const existingProdNames = new Set(
      (await tx.product.findMany({ where: { brandId: targetBrandId }, select: { name: true } }))
        .map(p => p.name)
    );

    const catsToCreate = sourceCategories.filter(c => !existingCatNames.has(c.name));
    const prodsToCreate = sourceProducts.filter(p => !existingProdNames.has(p.name));

    await Promise.all(catsToCreate.map(cat => tx.category.create({
      data: {
        brandId: targetBrandId,
        name: cat.name,
        displayOrder: cat.displayOrder,
        salespersonDisplayOrder: cat.salespersonDisplayOrder,
        depositEnabled: cat.depositEnabled,
      },
    })));

    const createdProds = await Promise.all(prodsToCreate.map(prod => tx.product.create({
      data: {
        brandId: targetBrandId,
        name: prod.name,
        category: prod.category,
        unitType: prod.unitType,
        unitSize: prod.unitSize,
        mlPerCrate: prod.mlPerCrate,
        containerType: prod.containerType,
        unitsPerContainer: prod.unitsPerContainer,
        costPrice: prod.costPrice,
        sellingPrice: prod.sellingPrice,
        isActive: true,
        showInStockReceipt: prod.showInStockReceipt,
        salespersonEnabled: prod.salespersonEnabled,
        depositEnabled: prod.depositEnabled,
        displayOrder: prod.displayOrder,
        salespersonDisplayOrder: prod.salespersonDisplayOrder,
      },
    })));

    // Mirror salesperson product assignments and prices from source to newly created products
    const nameToNewId = Object.fromEntries(createdProds.map(p => [p.name, p.id]));
    const sourceIdToNewId = Object.fromEntries(prodsToCreate.map(p => [p.id, nameToNewId[p.name]]));
    const sourceProductIds = prodsToCreate.map(p => p.id);

    const [sourceSPRows, sourcePriceRows] = await Promise.all([
      tx.salespersonProduct.findMany({
        where: { productId: { in: sourceProductIds }, isEnabled: true },
        select: { salespersonId: true, productId: true },
      }),
      tx.salespersonPrice.findMany({
        where: { productId: { in: sourceProductIds } },
        select: { salespersonId: true, productId: true, sellingPrice: true, effectiveFrom: true },
      }),
    ]);

    await Promise.all([
      ...sourceSPRows.map(row =>
        tx.salespersonProduct.create({
          data: { salespersonId: row.salespersonId, productId: sourceIdToNewId[row.productId], isEnabled: true },
        })
      ),
      ...sourcePriceRows.map(row =>
        tx.salespersonPrice.create({
          data: { salespersonId: row.salespersonId, productId: sourceIdToNewId[row.productId], sellingPrice: row.sellingPrice, effectiveFrom: row.effectiveFrom },
        })
      ),
    ]);

    return { copiedProducts: prodsToCreate.length, copiedCategories: catsToCreate.length, copiedSalespersonAssignments: sourceSPRows.length, copiedSalespersonPrices: sourcePriceRows.length };
  });

  res.json({
    success: true,
    data: { copiedProducts, copiedCategories, copiedSalespersonAssignments, copiedSalespersonPrices, fromBrand: sourceBrand.name, toBrand: targetBrand.name },
  });
});

module.exports = { getAll, reorder, salespersonReorder, create, update, copyProducts };
