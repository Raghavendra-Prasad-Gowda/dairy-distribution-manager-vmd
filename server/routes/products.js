const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /products?brandId=
router.get('/', asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.query.brandId) where.brandId = parseInt(req.query.brandId, 10);
  if (req.query.all === 'true') delete where.isActive;
  const products = await prisma.product.findMany({
    where,
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ brandId: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: products });
}));

// POST /products
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createProduct, req, res);
  if (!data) return;
  const product = await prisma.product.create({
    data,
    include: { brand: { select: { id: true, name: true } } },
  });
  res.status(201).json({ success: true, data: product });
}));

// PUT /products/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  const data = validate(schemas.updateProduct, req, res);
  if (!data) return;
  const product = await prisma.product.update({ where: { id }, data });
  res.json({ success: true, data: product });
}));

// DELETE /products/:id (soft delete)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Product ID');
  await prisma.product.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true, data: { message: 'Product deactivated' } });
}));

module.exports = router;
