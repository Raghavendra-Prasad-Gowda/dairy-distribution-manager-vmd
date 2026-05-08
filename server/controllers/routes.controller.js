const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const getAll = asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.query.brandId) where.brandId = parseId(req.query.brandId, 'Brand ID');
  const routes = await prisma.route.findMany({
    where,
    orderBy: [{ displayOrder: 'asc' }, { routeNumber: 'asc' }],
  });
  res.json({ success: true, data: routes });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createRoute, req, res);
  if (!data) return;
  const route = await prisma.route.create({ data });
  void notifySlack(SLACK_EVENTS.ROUTE_CREATED, { brandId: route.brandId, routeNumber: route.routeNumber, description: route.description });
  res.status(201).json({ success: true, data: route });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Route ID');
  const data = validate(schemas.updateRoute, req, res);
  if (!data) return;
  const route = await prisma.route.findUnique({ where: { id } });
  if (!route) throw new AppError('Route not found', 404);
  const updated = await prisma.route.update({ where: { id }, data });
  void notifySlack(SLACK_EVENTS.ROUTE_UPDATED, { brandId: updated.brandId, routeNumber: updated.routeNumber, description: updated.description, isActive: updated.isActive });
  res.json({ success: true, data: updated });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Route ID');
  const route = await prisma.route.findUnique({ where: { id } });
  if (!route) throw new AppError('Route not found', 404);
  await prisma.route.delete({ where: { id } });
  void notifySlack(SLACK_EVENTS.ROUTE_DELETED, { brandId: route.brandId, routeNumber: route.routeNumber });
  res.json({ success: true, data: { message: 'Route deleted' } });
});

module.exports = { getAll, create, update, remove };
