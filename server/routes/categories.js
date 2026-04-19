const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /categories?brandId=
router.get('/', asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.brandId) where.brandId = parseId(req.query.brandId, 'Brand ID');
  const categories = await prisma.category.findMany({
    where,
    orderBy: [{ brandId: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: categories });
}));

// POST /categories
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createCategory, req, res);
  if (!data) return;
  const category = await prisma.category.create({ data });
  res.status(201).json({ success: true, data: category });
}));

// PUT /categories/:id — rename and cascade to all products using this category name
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Category name is required' });
  }
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ success: false, error: 'Category not found' });
  }
  const oldName = category.name;
  const newName = name.trim();

  const [updated] = await prisma.$transaction([
    prisma.category.update({ where: { id }, data: { name: newName } }),
    prisma.product.updateMany({ where: { brandId: category.brandId, category: oldName }, data: { category: newName } }),
  ]);
  res.json({ success: true, data: updated });
}));

// DELETE /categories/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  await prisma.category.delete({ where: { id } });
  res.json({ success: true, data: { message: 'Category deleted' } });
}));

module.exports = router;
