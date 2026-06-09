const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

const getAll = asyncHandler(async (req, res) => {
  const brands = await prisma.brand.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] });
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
  if (data.salespersonPrimaryBrandId != null) {
    if (data.salespersonPrimaryBrandId === id) {
      throw new AppError('A brand cannot be merged with itself.', 400);
    }
    const target = await prisma.brand.findUnique({
      where: { id: data.salespersonPrimaryBrandId },
      select: { salespersonPrimaryBrandId: true },
    });
    if (!target) throw new AppError('Target brand not found.', 404);
    if (target.salespersonPrimaryBrandId != null) {
      throw new AppError('Cannot chain brand merges — target brand is already merged under another brand.', 400);
    }
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

  const { copiedProducts, copiedCategories } = await prisma.$transaction(async (tx) => {
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

    await Promise.all(prodsToCreate.map(prod => tx.product.create({
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

    return { copiedProducts: prodsToCreate.length, copiedCategories: catsToCreate.length };
  });

  res.json({
    success: true,
    data: { copiedProducts, copiedCategories, fromBrand: sourceBrand.name, toBrand: targetBrand.name },
  });
});

module.exports = { getAll, reorder, salespersonReorder, create, update, copyProducts };
