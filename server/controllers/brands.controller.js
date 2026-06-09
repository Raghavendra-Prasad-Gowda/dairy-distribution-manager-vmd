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

module.exports = { getAll, reorder, salespersonReorder, create, update };
