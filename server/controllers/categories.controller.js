const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const getAll = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.brandId) where.brandId = parseId(req.query.brandId, 'Brand ID');
  const categories = await prisma.category.findMany({
    where,
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: categories });
});

const reorder = asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderCategories, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.category.update({ where: { id }, data: { displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} categories reordered` } });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createCategory, req, res);
  if (!data) return;
  const category = await prisma.category.create({ data });
  res.status(201).json({ success: true, data: category });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  const { name } = req.body;
  if (!name || !name.trim()) throw new AppError('Category name is required', 400);
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError('Category not found', 404);
  const oldName = category.name;
  const newName = name.trim();

  const [updated] = await prisma.$transaction([
    prisma.category.update({ where: { id }, data: { name: newName } }),
    prisma.product.updateMany({ where: { brandId: category.brandId, category: oldName }, data: { category: newName } }),
  ]);
  res.json({ success: true, data: updated });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError('Category not found', 404);
  await prisma.category.delete({ where: { id } });
  res.json({ success: true, data: { message: 'Category deleted' } });
});

module.exports = { getAll, reorder, create, update, remove };
