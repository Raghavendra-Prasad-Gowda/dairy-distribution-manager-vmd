const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /salespeople
router.get('/', asyncHandler(async (req, res) => {
  const where = req.query.all === 'true' ? {} : { isActive: true };
  const salespeople = await prisma.salesperson.findMany({
    where,
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: salespeople });
}));

// GET /salespeople/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);
  res.json({ success: true, data: sp });
}));

// POST /salespeople
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createSalesperson, req, res);
  if (!data) return;
  const sp = await prisma.salesperson.create({ data });
  res.status(201).json({ success: true, data: sp });
}));

// PUT /salespeople/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.updateSalesperson, req, res);
  if (!data) return;
  const sp = await prisma.salesperson.update({ where: { id }, data });
  res.json({ success: true, data: sp });
}));

module.exports = router;
