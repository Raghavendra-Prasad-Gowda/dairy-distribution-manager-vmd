'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { parseId } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { getIndiaDateStr } = require('../../utils/dateUtils');
const { assertAdmin } = require('../../utils/authz');
const { getPaginationParams, buildPaginationMeta } = require('../../utils/pagination');
const { isEffectivelyLocked } = require('./_shared');

const getAll = asyncHandler(async (req, res) => {
  // Dispatcher accesses dispatch data through /reports/daily-dispatch (formatted
  // matrix view), not the raw list. Blocking here closes an unneeded surface.
  if (req.user.role === 'dispatcher') throw new AppError('Access denied.', 403);

  const { date, salespersonId } = req.query;
  const where = {};
  if (date) where.dispatchDate = new Date(date);

  if (req.user.role === 'salesman') {
    where.salespersonId = req.user.salespersonId;
  } else if (salespersonId) {
    where.salespersonId = parseId(salespersonId, 'Salesperson ID');
  }

  const include = {
    salesperson: { select: { id: true, name: true } },
    items: {
      include: {
        product: { include: { brand: { select: { id: true, name: true } } } },
      },
    },
  };
  const orderBy = { dispatchDate: 'desc' };

  const today = getIndiaDateStr();
  const mapRow = (d) => ({
    ...d,
    totalAmount:    Number(d.totalAmount),
    isLocked:       isEffectivelyLocked(d, today),
    isSubmitted:    d.isSubmitted,
    isAdminUnlocked: d.isAdminUnlocked,
  });

  // Opt-in pagination: engages only when ?page/?limit is supplied, so existing
  // callers keep the flat-array response unchanged.
  const paging = getPaginationParams(req.query);
  if (paging) {
    const [dispatches, total] = await Promise.all([
      prisma.stockDispatch.findMany({ where, include, orderBy, skip: paging.skip, take: paging.limit }),
      prisma.stockDispatch.count({ where }),
    ]);
    return res.json({ success: true, data: { items: dispatches.map(mapRow), pagination: buildPaginationMeta(total, paging.page, paging.limit) } });
  }

  const dispatches = await prisma.stockDispatch.findMany({ where, include, orderBy });
  res.json({ success: true, data: dispatches.map(mapRow) });
});

// Admin only — cross-salesperson report. Salesmen already have their own
// scoped view via getAll (?date=), which filters to req.user.salespersonId.
const getSummary = asyncHandler(async (req, res) => {
  assertAdmin(req);

  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const dispatches = await prisma.stockDispatch.findMany({
    where: { dispatchDate: new Date(date) },
    include: {
      salesperson: { select: { id: true, name: true, route: true } },
      items: {
        include: { product: { include: { brand: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: { salesperson: { name: 'asc' } },
  });
  res.json({ success: true, data: dispatches });
});

module.exports = { getAll, getSummary };
