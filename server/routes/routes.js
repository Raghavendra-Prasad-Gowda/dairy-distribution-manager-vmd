const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /routes?brandId=
router.get('/', asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.query.brandId) where.brandId = parseId(req.query.brandId, 'Brand ID');
  const routes = await prisma.route.findMany({
    where,
    orderBy: [{ displayOrder: 'asc' }, { routeNumber: 'asc' }],
  });
  res.json({ success: true, data: routes });
}));

// POST /routes
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createRoute, req, res);
  if (!data) return;
  const route = await prisma.route.create({ data });
  res.status(201).json({ success: true, data: route });
}));

// PUT /routes/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Route ID');
  const data = validate(schemas.updateRoute, req, res);
  if (!data) return;
  const route = await prisma.route.findUnique({ where: { id } });
  if (!route) throw new AppError('Route not found', 404);
  const updated = await prisma.route.update({ where: { id }, data });
  res.json({ success: true, data: updated });
}));

// DELETE /routes/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Route ID');
  const route = await prisma.route.findUnique({ where: { id } });
  if (!route) throw new AppError('Route not found', 404);
  await prisma.route.delete({ where: { id } });
  res.json({ success: true, data: { message: 'Route deleted' } });
}));

module.exports = router;
