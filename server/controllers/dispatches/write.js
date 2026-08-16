'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { recalculateSalespersonBalance } = require('../../services/balanceService');
const { getIndiaDateStr } = require('../../utils/dateUtils');
const logger = require('../../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../../utils/slack');
const { resolveActor, isEffectivelyLocked, resolveSalespersonItemPricing } = require('./_shared');

// ACCEPTED RISK (deliberate, not a TODO): stockGuard.validateDispatchStock exists
// and is fully implemented, but is NOT called here. The dairy owner reviewed
// enabling a hard oversell block on 2026-08-16 and chose to keep dispatches
// unconstrained by received-stock quantity for now — dispatchers/admins may
// still enter more than was received, and the app will not reject it. This is
// an intentional product decision, not an oversight. If it's ever revisited,
// services/stockGuard.js is ready to wire in at the point marked below.

const createOrUpdate = asyncHandler(async (req, res) => {
  const data = validate(schemas.createDispatch, req, res);
  if (!data) return;

  // Dispatcher is a viewer/finalizer — they never create or edit stock entries.
  // Salesman enter their own; admin enters on behalf of a salesman.
  if (req.user.role === 'dispatcher') throw new AppError('Dispatchers cannot modify stock entries.', 403);

  let salespersonId;
  if (req.user.role === 'salesman') {
    salespersonId = req.user.salespersonId;
  } else {
    if (!data.salespersonId) throw new AppError('salespersonId is required', 400);
    salespersonId = data.salespersonId;
  }

  const by = await resolveActor(req);
  const dispatchDate = new Date(data.dispatchDate);
  const today = getIndiaDateStr();

  const existing = await prisma.stockDispatch.findUnique({
    where: { salespersonId_dispatchDate: { salespersonId, dispatchDate } },
  });

  // Block salesman from editing a locked dispatch — checked BEFORE price
  // resolution / any write, so an unauthorized request fails fast without
  // doing extra work. A record already existing is checked via
  // isEffectivelyLocked as before — but a past date with NO record yet must
  // be blocked too, otherwise a salesman could POST a brand new dispatch
  // straight into a date they never touched, bypassing the lock entirely
  // (the UI hides this, but nothing stopped a direct API call). Admin
  // explicitly opening a date for entry (openForEntry) always creates the
  // row first, so existing is only null here for dates admin never opened —
  // safe to treat as locked.
  if (req.user.role === 'salesman') {
    if (existing) {
      if (isEffectivelyLocked(existing, today)) {
        throw new AppError('This stock entry is locked. Contact your admin to unlock it.', 403);
      }
    } else if (data.dispatchDate < today) {
      throw new AppError('This date is locked. Contact your admin to unlock it.', 403);
    }
  }

  // A salesman's own request body must never dictate their billed price —
  // overwrite whatever unitPrice was submitted with the server-resolved one.
  if (req.user.role === 'salesman' && data.items.length > 0) {
    data.items = await resolveSalespersonItemPricing(salespersonId, data.items, dispatchDate);
  }

  const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  // Empty items → clear the existing dispatch. No-op if nothing exists.
  if (data.items.length === 0) {
    if (!existing) {
      return res.json({ success: true, data: { message: 'Nothing to save' } });
    }

    // An admin-unlocked entry must stay unlocked even when cleared to zero —
    // deleting the row would lose isAdminUnlocked along with it, and a past
    // date with no dispatch row at all defaults back to locked, silently
    // undoing the admin's unlock. Zero it out in place instead.
    if (existing.isAdminUnlocked) {
      await prisma.$transaction(async (tx) => {
        await tx.stockDispatchItem.deleteMany({ where: { dispatchId: existing.id } });
        await tx.stockDispatch.update({
          where: { id: existing.id },
          data: { totalAmount: 0, notes: data.notes ?? null },
        });
        await recalculateSalespersonBalance(salespersonId, data.dispatchDate, tx);
      }, { isolationLevel: 'Serializable' });
      logger.info('Stock entry cleared (kept unlocked)', { id: existing.id, salespersonId, date: data.dispatchDate });
      return res.json({ success: true, data: { message: 'Stock entry cleared' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockDispatch.delete({ where: { id: existing.id } });
      await recalculateSalespersonBalance(salespersonId, data.dispatchDate, tx);
    }, { isolationLevel: 'Serializable' });
    logger.info('Stock entry cleared', { id: existing.id, salespersonId, date: data.dispatchDate });
    if (!data.submitting) {
      void notifySlack(SLACK_EVENTS.DISPATCH_DELETED, {
        salespersonId,
        date:        data.dispatchDate,
        totalAmount: Number(existing.totalAmount),
        by,
      });
    }
    return res.json({ success: true, data: { message: 'Stock entry cleared' } });
  }

  // Stock-availability guard: see the ACCEPTED RISK note at the top of this
  // file — deliberately not wired in. services/stockGuard.js#validateDispatchStock
  // is fully implemented and ready to call here if this is revisited.

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
  // Skipped when this save is the internal re-save inside Save-and-Submit —
  // the DISPATCH_SUBMITTED card that follows immediately already reports the
  // same item count and total, so this card would just be redundant noise.
  if (!data.submitting) {
    void notifySlack(SLACK_EVENTS.DISPATCH_SAVED, {
      salespersonId,
      date:      data.dispatchDate,
      itemCount: data.items.length,
      totalAmount,
      isUpdate:  !!existing,
      by,
    });
  }
  res.status(existing ? 200 : 201).json({ success: true, data: { ...dispatch, totalAmount: Number(dispatch.totalAmount), isLocked: false } });
});

const remove = asyncHandler(async (req, res) => {
  // Dispatcher has no delete capability — they may only lock/unlock entries
  // or finalize the day. Deletion is an admin-tier action.
  if (req.user.role === 'dispatcher') throw new AppError('Dispatchers cannot delete stock entries.', 403);

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
  const by = await resolveActor(req);
  void notifySlack(SLACK_EVENTS.DISPATCH_DELETED, {
    salespersonId: dispatch.salespersonId,
    date:          dateStr,
    totalAmount:   Number(dispatch.totalAmount),
    by,
  });
  res.json({ success: true, data: { message: 'Stock entry deleted' } });
});

module.exports = { createOrUpdate, remove };
