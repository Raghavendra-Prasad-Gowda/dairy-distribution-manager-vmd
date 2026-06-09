const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateSalespersonBalance } = require('../services/balanceService');
const { validateDispatchStock } = require('../services/stockGuard');
const { getIndiaDateStr } = require('../utils/dateUtils');
const logger = require('../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

// Returns true when the dispatch cannot be edited by the salesman
function isEffectivelyLocked(dispatch, todayStr) {
  const dateStr = dispatch.dispatchDate.toISOString().slice(0, 10);
  const isPastDate = dateStr < todayStr;
  return (dispatch.isSubmitted || isPastDate) && !dispatch.isAdminUnlocked;
}

const getAll = asyncHandler(async (req, res) => {
  const { date, salespersonId } = req.query;
  const where = {};
  if (date) where.dispatchDate = new Date(date);

  if (req.user.role === 'salesman') {
    where.salespersonId = req.user.salespersonId;
  } else if (salespersonId) {
    where.salespersonId = parseId(salespersonId, 'Salesperson ID');
  }

  const dispatches = await prisma.stockDispatch.findMany({
    where,
    include: {
      salesperson: { select: { id: true, name: true } },
      items: {
        include: {
          product: { include: { brand: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { dispatchDate: 'desc' },
  });

  const today = getIndiaDateStr();
  const result = dispatches.map(d => ({
    ...d,
    totalAmount:    Number(d.totalAmount),
    isLocked:       isEffectivelyLocked(d, today),
    isSubmitted:    d.isSubmitted,
    isAdminUnlocked: d.isAdminUnlocked,
  }));

  res.json({ success: true, data: result });
});

const getSummary = asyncHandler(async (req, res) => {
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

const createOrUpdate = asyncHandler(async (req, res) => {
  const data = validate(schemas.createDispatch, req, res);
  if (!data) return;

  let salespersonId;
  if (req.user.role === 'salesman') {
    salespersonId = req.user.salespersonId;
  } else {
    if (!data.salespersonId) throw new AppError('salespersonId is required', 400);
    salespersonId = data.salespersonId;
  }

  const dispatchDate = new Date(data.dispatchDate);
  const today = getIndiaDateStr();

  const existing = await prisma.stockDispatch.findUnique({
    where: { salespersonId_dispatchDate: { salespersonId, dispatchDate } },
  });

  const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  // Block salesman from editing a locked dispatch
  if (existing && req.user.role === 'salesman' && isEffectivelyLocked(existing, today)) {
    throw new AppError('This stock entry is locked. Contact your admin to unlock it.', 403);
  }

  // Empty items → clear the existing dispatch (delete + cascade). No-op if nothing exists.
  if (data.items.length === 0) {
    if (!existing) {
      return res.json({ success: true, data: { message: 'Nothing to save' } });
    }
    await prisma.$transaction(async (tx) => {
      await tx.stockDispatch.delete({ where: { id: existing.id } });
      await recalculateSalespersonBalance(salespersonId, data.dispatchDate, tx);
    }, { isolationLevel: 'Serializable' });
    logger.info('Stock entry cleared', { id: existing.id, salespersonId, date: data.dispatchDate });
    void notifySlack(SLACK_EVENTS.DISPATCH_DELETED, {
      salespersonId,
      date:        data.dispatchDate,
      totalAmount: Number(existing.totalAmount),
    });
    return res.json({ success: true, data: { message: 'Stock entry cleared' } });
  }

  // Stock-availability guard temporarily disabled — re-enable once entries,
  // calculations, and balance carry-forwards are verified in production.
  // const stockErrors = await validateDispatchStock(data.items, data.dispatchDate, existing?.id ?? null);
  // if (stockErrors.length) {
  //   const detail = stockErrors
  //     .map(e => `${e.productName} (need ${e.requested}, have ${e.available})`)
  //     .join('; ');
  //   throw new AppError(`Insufficient stock: ${detail}`, 400);
  // }

  const dispatch = await prisma.$transaction(async (tx) => {
    let saved;
    if (existing) {
      await tx.stockDispatchItem.deleteMany({ where: { dispatchId: existing.id } });
      await tx.stockDispatch.update({
        where: { id: existing.id },
        data: { totalAmount, notes: data.notes ?? null, isSubmitted: false },
      });
      await tx.stockDispatchItem.createMany({
        data: data.items.map((item) => ({
          dispatchId:  existing.id,
          productId:   item.productId,
          quantity:    item.quantity,
          unitPrice:   item.unitPrice,
          totalAmount: item.quantity * item.unitPrice,
        })),
      });
      saved = await tx.stockDispatch.findUnique({ where: { id: existing.id }, include: { items: true } });
    } else {
      saved = await tx.stockDispatch.create({
        data: {
          salespersonId,
          dispatchDate,
          totalAmount,
          notes: data.notes ?? null,
          items: {
            create: data.items.map((item) => ({
              productId:   item.productId,
              quantity:    item.quantity,
              unitPrice:   item.unitPrice,
              totalAmount: item.quantity * item.unitPrice,
            })),
          },
        },
        include: { items: true },
      });
    }
    // Cascade balance recalculation inside the same transaction so concurrent
    // edits can't interleave dispatch writes with balance reads.
    await recalculateSalespersonBalance(salespersonId, data.dispatchDate, tx);
    return saved;
  }, { isolationLevel: 'Serializable' });

  logger.info('Stock entry saved', { id: dispatch.id, salespersonId, date: data.dispatchDate, total: totalAmount, action: existing ? 'update' : 'create' });
  void notifySlack(SLACK_EVENTS.DISPATCH_SAVED, {
    salespersonId,
    date:      data.dispatchDate,
    itemCount: data.items.length,
    totalAmount,
    isUpdate:  !!existing,
  });
  res.status(existing ? 200 : 201).json({ success: true, data: { ...dispatch, totalAmount: Number(dispatch.totalAmount), isLocked: false } });
});

// Salesman submits their entry — locks it
const submit = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  if (req.user.role === 'salesman' && dispatch.salespersonId !== req.user.salespersonId) {
    throw new AppError('Access denied', 403);
  }

  await prisma.stockDispatch.update({
    where: { id },
    data: { isSubmitted: true, isAdminUnlocked: false },
  });

  logger.info('Stock entry submitted', { id, salespersonId: dispatch.salespersonId });
  res.json({ success: true, data: { message: 'Stock entry submitted and locked' } });
});

// Admin locks an entry (regardless of whether salesman submitted)
const lock = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  await prisma.stockDispatch.update({
    where: { id },
    data: { isSubmitted: true, isAdminUnlocked: false },
  });

  logger.info('Stock entry locked by admin', { id, salespersonId: dispatch.salespersonId });
  res.json({ success: true, data: { message: 'Stock entry locked' } });
});

// Admin unlocks a submitted or past-date entry so salesman can re-edit
const unlock = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  await prisma.stockDispatch.update({
    where: { id },
    data: { isSubmitted: false, isAdminUnlocked: true },
  });

  logger.info('Stock entry unlocked by admin', { id, salespersonId: dispatch.salespersonId });
  res.json({ success: true, data: { message: 'Stock entry unlocked' } });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  if (req.user.role === 'salesman' && dispatch.salespersonId !== req.user.salespersonId) {
    throw new AppError('Access denied', 403);
  }

  const today = getIndiaDateStr();
  if (req.user.role === 'salesman' && isEffectivelyLocked(dispatch, today)) {
    throw new AppError('This stock entry is locked. Contact admin to unlock.', 403);
  }

  const dateStr = dispatch.dispatchDate.toISOString().slice(0, 10);
  await prisma.$transaction(async (tx) => {
    await tx.stockDispatch.delete({ where: { id } });
    await recalculateSalespersonBalance(dispatch.salespersonId, dateStr, tx);
  }, { isolationLevel: 'Serializable' });
  logger.info('Stock entry deleted', { id, salespersonId: dispatch.salespersonId, date: dateStr });
  void notifySlack(SLACK_EVENTS.DISPATCH_DELETED, {
    salespersonId: dispatch.salespersonId,
    date:          dateStr,
    totalAmount:   Number(dispatch.totalAmount),
  });
  res.json({ success: true, data: { message: 'Stock entry deleted' } });
});

// Returns { productId: totalReceivedQty } for a given date — used by salesman
// dispatch UI to split quantities across merged brands proportionally.
const getStockReceived = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const receipts = await prisma.stockReceipt.groupBy({
    by: ['productId'],
    where: { receiptDate: new Date(date) },
    _sum: { quantity: true },
  });

  const data = Object.fromEntries(
    receipts.map(r => [r.productId, Number(r._sum.quantity ?? 0)])
  );

  res.json({ success: true, data });
});

module.exports = { getAll, getSummary, createOrUpdate, submit, lock, unlock, remove, getStockReceived };
