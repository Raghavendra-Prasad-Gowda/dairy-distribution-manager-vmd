'use strict';

const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const SAFE_SELECT = {
  id: true, name: true, phone: true, address: true, isActive: true, createdAt: true,
};

const getAll = asyncHandler(async (req, res) => {
  const dairies = await prisma.dairy.findMany({
    select: SAFE_SELECT,
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: dairies });
});

const getById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Dairy ID');
  const dairy = await prisma.dairy.findUnique({ where: { id }, select: SAFE_SELECT });
  if (!dairy) throw new AppError('Dairy not found', 404);
  res.json({ success: true, data: dairy });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createDairy, req, res);
  if (!data) return;

  const dairy = await prisma.dairy.create({ data, select: SAFE_SELECT });
  res.status(201).json({ success: true, data: dairy });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Dairy ID');
  const data = validate(schemas.updateDairy, req, res);
  if (!data) return;

  const dairy = await prisma.dairy.update({ where: { id }, data, select: SAFE_SELECT });
  res.json({ success: true, data: dairy });
});

module.exports = { getAll, getById, create, update };
