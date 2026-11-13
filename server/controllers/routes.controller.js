const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { getIndiaDayEnd } = require('../utils/dateUtils');

// GET /routes?brandId=&date=YYYY-MM-DD
// With ?date= (the stock receipt screen) the list follows that day, because isActive only describes a
// route TODAY: a route that had stock received on the date is listed even if it has been deactivated
// since, so a past day keeps showing what came in on it; an active route is listed only from the (IST)
// day it was created. Without a date (setup screens) it is the active routes, as before.
const getAll = asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.query.brandId) where.brandId = parseId(req.query.brandId, 'Brand ID');

  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date ?? '') ? req.query.date : null;
  let listWhere = where;
  if (dateStr) {
    const receiptRows = await prisma.stockReceipt.findMany({
      where: { receiptDate: new Date(dateStr), routeId: { not: 0 }, ...(where.brandId ? { brandId: where.brandId } : {}) },
      select: { routeId: true },
      distinct: ['routeId'],
    });
    listWhere = {
      ...(where.brandId ? { brandId: where.brandId } : {}),
      OR: [
        { isActive: true, createdAt: { lte: getIndiaDayEnd(dateStr) } },
        { id: { in: (receiptRows ?? []).map(r => r.routeId) } },
      ],
    };
  }

  const routes = await prisma.route.findMany({
    where: listWhere,
    orderBy: [{ displayOrder: 'asc' }, { routeNumber: 'asc' }],
  });
  res.json({ success: true, data: routes });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createRoute, req, res);
  if (!data) return;
  const route = await prisma.route.create({ data });
  void notifySlack(SLACK_EVENTS.ROUTE_CREATED, { brandId: route.brandId, routeNumber: route.routeNumber });
  res.status(201).json({ success: true, data: route });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Route ID');
  const data = validate(schemas.updateRoute, req, res);
  if (!data) return;
  const route = await prisma.route.findUnique({ where: { id } });
  if (!route) throw new AppError('Route not found', 404);
  const updated = await prisma.route.update({ where: { id }, data });
  void notifySlack(SLACK_EVENTS.ROUTE_UPDATED, { brandId: updated.brandId, routeNumber: updated.routeNumber, isActive: updated.isActive });
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
