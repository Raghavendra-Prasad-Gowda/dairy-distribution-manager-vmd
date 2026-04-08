const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /brands
router.get('/', asyncHandler(async (req, res) => {
  const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, data: brands });
}));

// POST /brands
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createBrand, req, res);
  if (!data) return;
  const brand = await prisma.brand.create({ data });
  res.status(201).json({ success: true, data: brand });
}));

// PUT /brands/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Brand ID');
  const data = validate(schemas.updateBrand, req, res);
  if (!data) return;
  const brand = await prisma.brand.update({ where: { id }, data });
  res.json({ success: true, data: brand });
}));

module.exports = router;
