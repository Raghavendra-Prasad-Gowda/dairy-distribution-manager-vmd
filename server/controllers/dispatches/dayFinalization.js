'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { getIndiaDateStr } = require('../../utils/dateUtils');
const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
const logger = require('../../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../../utils/slack');
const { assertAdmin } = require('../../utils/authz');
const { resolveActor } = require('./_shared');

// Dispatcher finalizes today: force-locks any salesperson still
// unlocked/unsubmitted, then marks the day finalized. From that point on,
// only admin/superadmin can unlock a salesperson for this date (see
// assertDispatcherCanToggleLock in _shared.js) — dispatcher-only action, not
// available to admin/superadmin even as a manual escape hatch.
const finalizeDay = asyncHandler(async (req, res) => {
  if (req.user.role !== 'dispatcher') throw new AppError('Dispatcher access required', 403);

  const todayStr = getIndiaDateStr();
  if (await isDayFinalizedForDispatcher(todayStr, todayStr)) {
    throw new AppError('Today has already been finalized.', 400);
  }
  const today = new Date(todayStr);

  await prisma.$transaction(async (tx) => {
    await tx.stockDispatch.updateMany({
      where: { dispatchDate: today, isSubmitted: false },
      data:  { isSubmitted: true, isAdminUnlocked: false },
    });
    await tx.dispatchDayFinalization.create({
      data: { date: today, finalizedByAdminUserId: req.user.adminUserId ?? null, isAuto: false },
    });
  }, { isolationLevel: 'Serializable' });

  logger.info('Dispatch day finalized', { date: todayStr, adminUserId: req.user.adminUserId });
  const by = await resolveActor(req);
  void notifySlack(SLACK_EVENTS.DISPATCH_DAY_FINALIZED, { date: todayStr, by });
  res.json({ success: true, data: { message: 'Day finalized', date: todayStr } });
});

// Admin/superadmin only — reverses a dispatcher finalization for today so the
// dispatcher regains lock/unlock access. Does NOT touch the dispatch entries
// themselves (no rows are unlocked — that's a separate admin action per row).
const unfinalizeDay = asyncHandler(async (req, res) => {
  assertAdmin(req);

  const todayStr = getIndiaDateStr();
  // Past dates are auto-finalized by date comparison — there is no DB row to
  // delete, so reversing them is not supported (and would have no effect anyway
  // since isDayFinalizedForDispatcher returns true for any date < today).
  const row = await prisma.dispatchDayFinalization.findUnique({ where: { date: new Date(todayStr) } });
  if (!row) {
    throw new AppError("Today has not been explicitly finalized — nothing to reverse. Past dates are auto-finalized and cannot be reversed.", 400);
  }

  await prisma.dispatchDayFinalization.delete({ where: { date: new Date(todayStr) } });

  logger.info('Dispatch day finalization reversed', { date: todayStr, adminUserId: req.user.adminUserId });
  const by = await resolveActor(req);
  void notifySlack(SLACK_EVENTS.DISPATCH_DAY_UNFINALIZED, { date: todayStr, by });
  res.json({ success: true, data: { message: 'Finalization reversed', date: todayStr } });
});

module.exports = { finalizeDay, unfinalizeDay };
