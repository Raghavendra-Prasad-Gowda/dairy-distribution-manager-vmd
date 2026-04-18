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

// DELETE /categories/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Category ID');
  await prisma.category.delete({ where: { id } });
  res.json({ success: true, data: { message: 'Category deleted' } });
}));

module.exports = router;
