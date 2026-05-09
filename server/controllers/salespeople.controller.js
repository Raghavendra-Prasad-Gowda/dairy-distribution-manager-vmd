const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const getAll = asyncHandler(async (req, res) => {
  const where = req.query.all === 'true' ? {} : { isActive: true };
  const salespeople = await prisma.salesperson.findMany({ where, orderBy: { name: 'asc' } });
  res.json({ success: true, data: salespeople });
});

const getById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);
  res.json({ success: true, data: sp });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createSalesperson, req, res);
  if (!data) return;
  const sp = await prisma.salesperson.create({ data });
  void notifySlack(SLACK_EVENTS.SALESPERSON_CREATED, { name: sp.name, phone: sp.phone, route: sp.route });
  res.status(201).json({ success: true, data: sp });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.updateSalesperson, req, res);
  if (!data) return;
  const sp = await prisma.salesperson.update({ where: { id }, data });
  void notifySlack(SLACK_EVENTS.SALESPERSON_UPDATED, { name: sp.name, phone: sp.phone, route: sp.route, isActive: sp.isActive });
  res.json({ success: true, data: sp });
});

module.exports = { getAll, getById, create, update };
