const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');

const getAll = asyncHandler(async (req, res) => {
  const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
  res.json({ success: true, data: brands });
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
  const brand = await prisma.brand.update({ where: { id }, data });
  res.json({ success: true, data: brand });
});

module.exports = { getAll, create, update };
