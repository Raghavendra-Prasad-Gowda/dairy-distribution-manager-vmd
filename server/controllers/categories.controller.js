const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

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
  void notifySlack(SLACK_EVENTS.CATEGORY_CREATED, { brandId: category.brandId, name: category.name });
  res.status(201).json({ success: true, data: category });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  const { name, depositEnabled } = req.body;

  // Validate name early — before hitting DB — so empty-name returns 400 not 404
  if (name !== undefined && !name.trim()) throw new AppError('Category name is required', 400);
  if (!name?.trim() && depositEnabled === undefined) throw new AppError('Category name is required', 400);

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError('Category not found', 404);

  // depositEnabled-only update (no name change)
  if (depositEnabled !== undefined && !name?.trim()) {
    const updated = await prisma.category.update({ where: { id }, data: { depositEnabled } });
    void notifySlack(SLACK_EVENTS.CATEGORY_UPDATED, { brandId: category.brandId, name: category.name, depositEnabled: updated.depositEnabled });
    return res.json({ success: true, data: updated });
  }

  const oldName = category.name;
  const newName = name.trim();
  const data = { name: newName, ...(depositEnabled !== undefined ? { depositEnabled } : {}) };

  const [updated] = await prisma.$transaction([
    prisma.category.update({ where: { id }, data }),
    prisma.product.updateMany({ where: { brandId: category.brandId, category: oldName }, data: { category: newName } }),
  ]);
  void notifySlack(SLACK_EVENTS.CATEGORY_UPDATED, { brandId: category.brandId, name: newName, depositEnabled: updated.depositEnabled });
  res.json({ success: true, data: updated });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError('Category not found', 404);
  await prisma.category.delete({ where: { id } });
  void notifySlack(SLACK_EVENTS.CATEGORY_DELETED, { brandId: category.brandId, name: category.name });
  res.json({ success: true, data: { message: 'Category deleted' } });
});

const salespersonReorder = asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderSalespersonCategories, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.category.update({ where: { id }, data: { salespersonDisplayOrder: displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} categories reordered` } });
});

module.exports = { getAll, reorder, salespersonReorder, create, update, remove };
