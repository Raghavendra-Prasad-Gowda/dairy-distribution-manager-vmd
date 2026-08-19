'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { recalculateSalespersonBalance } = require('../../services/balanceService');
const logger = require('../../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../../utils/slack');
const { assertAdmin } = require('../../utils/authz');
const { ADMIN_TIER, resolveActor, assertDispatcherCanToggleLock } = require('./_shared');

// Salesman submits their entry — locks it. Admin may also call this as a
// convenience, but dispatcher is excluded (they use lock/unlock, not submit).
const submit = asyncHandler(async (req, res) => {
  if (req.user.role === 'dispatcher') throw new AppError('Access denied.', 403);

  const id = parseId(req.params.id, 'Dispatch ID');
  // items included so the card can report itemCount — this is now the only
  // notification on the common Save-then-Submit path (the intermediate save's
  // own card is suppressed via `submitting`), so it needs to carry what that
  // card used to show.
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id }, include: { items: true } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  if (req.user.role === 'salesman' && dispatch.salespersonId !== req.user.salespersonId) {
    throw new AppError('Access denied', 403);
  }

  await prisma.stockDispatch.update({
    where: { id },
    data: { isSubmitted: true, isAdminUnlocked: false },
  });

  logger.info('Stock entry submitted', { id, salespersonId: dispatch.salespersonId });
  const dateStr = dispatch.dispatchDate.toISOString().slice(0, 10);
  void notifySlack(SLACK_EVENTS.DISPATCH_SUBMITTED, {
    salespersonId: dispatch.salespersonId,
    date:          dateStr,
    itemCount:     dispatch.items.length,
    totalAmount:   Number(dispatch.totalAmount),
  });
  res.json({ success: true, data: { message: 'Stock entry submitted and locked' } });
});

// Admin locks an entry (regardless of whether salesman submitted). Dispatcher
// can too, but only for today's entries, and only before today is finalized.
const lock = asyncHandler(async (req, res) => {
  if (!ADMIN_TIER.has(req.user.role)) throw new AppError('Admin access required', 403);

  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  if (req.user.role === 'dispatcher') await assertDispatcherCanToggleLock(dispatch);

  await prisma.stockDispatch.update({
    where: { id },
    data: { isSubmitted: true, isAdminUnlocked: false },
  });

  logger.info('Stock entry locked by admin', { id, salespersonId: dispatch.salespersonId });
  const by = await resolveActor(req);
  void notifySlack(SLACK_EVENTS.DISPATCH_LOCK_CHANGED, {
    action:        'locked',
    salespersonId: dispatch.salespersonId,
    date:          dispatch.dispatchDate.toISOString().slice(0, 10),
    by,
  });
  res.json({ success: true, data: { message: 'Stock entry locked' } });
});

// Admin unlocks a submitted or past-date entry so salesman can re-edit.
// Dispatcher can too, but only for today's entries, and only before today is
// finalized — once finalized, only admin/superadmin retains this.
const unlock = asyncHandler(async (req, res) => {
  if (!ADMIN_TIER.has(req.user.role)) throw new AppError('Admin access required', 403);

  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Stock entry not found', 404);

  if (req.user.role === 'dispatcher') await assertDispatcherCanToggleLock(dispatch);

  await prisma.stockDispatch.update({
    where: { id },
    data: { isSubmitted: false, isAdminUnlocked: true },
  });

  logger.info('Stock entry unlocked by admin', { id, salespersonId: dispatch.salespersonId });
  const by = await resolveActor(req);
  void notifySlack(SLACK_EVENTS.DISPATCH_LOCK_CHANGED, {
    action:        'unlocked',
    salespersonId: dispatch.salespersonId,
    date:          dispatch.dispatchDate.toISOString().slice(0, 10),
    by,
  });
  res.json({ success: true, data: { message: 'Stock entry unlocked' } });
});

// Admin opens a specific salesperson + date for entry even when no dispatch
// exists yet — the normal unlock action needs an existing dispatch id, but a
// date the salesperson never touched has none, so there's nothing to unlock.
const openForEntry = asyncHandler(async (req, res) => {
  assertAdmin(req);

  const data = validate(schemas.openDispatchForEntry, req, res);
  if (!data) return;

  const dispatchDate = new Date(data.dispatchDate);

  const dispatch = await prisma.$transaction(async (tx) => {
    const existing = await tx.stockDispatch.findUnique({
      where: { salespersonId_dispatchDate: { salespersonId: data.salespersonId, dispatchDate } },
    });

    const saved = existing
      ? await tx.stockDispatch.update({
          where: { id: existing.id },
          data: { isSubmitted: false, isAdminUnlocked: true },
        })
      : await tx.stockDispatch.create({
          data: {
            salespersonId: data.salespersonId,
            dispatchDate,
            totalAmount:   0,
            isSubmitted:   false,
            isAdminUnlocked: true,
          },
        });

    await recalculateSalespersonBalance(data.salespersonId, data.dispatchDate, tx);
    return saved;
  }, { isolationLevel: 'Serializable' });

  logger.info('Stock entry opened for entry by admin', { id: dispatch.id, salespersonId: data.salespersonId, date: data.dispatchDate });
  const by = await resolveActor(req);
  void notifySlack(SLACK_EVENTS.DISPATCH_LOCK_CHANGED, {
    action:        'opened',
    salespersonId: data.salespersonId,
    date:          data.dispatchDate,
    by,
  });
  res.json({ success: true, data: { message: 'Entry opened', dispatchId: dispatch.id } });
});

module.exports = { submit, lock, unlock, openForEntry };
