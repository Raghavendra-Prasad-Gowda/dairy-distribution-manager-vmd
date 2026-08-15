const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateSalespersonBalance } = require('../services/balanceService');
const { validateDispatchStock } = require('../services/stockGuard');
const { isDayFinalizedForDispatcher } = require('../services/dispatchDayFinalization');
const { getIndiaDateStr } = require('../utils/dateUtils');
const logger = require('../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

// Admin/superadmin/dispatcher all get lock/unlock in some form — dispatcher's
// is further restricted to today + not-yet-finalized by
// assertDispatcherCanToggleLock below.
const ADMIN_TIER = new Set(['admin', 'superadmin', 'dispatcher']);

// createOrUpdate/remove are shared by an admin dispatching stock to a
// salesperson and the salesperson self-entering their own day's stock — the
// Slack card needs to say which one actually happened.
async function resolveActor(req) {
  if (req.user.role === 'salesman') return 'Salesperson (self)';
  const admin = await prisma.adminUser.findUnique({
    where:  { id: req.user.adminUserId },
    select: { username: true, role: true },
  });
  const roleLabel = admin?.role === 'superadmin' ? 'Super Admin' : admin?.role === 'dispatcher' ? 'Dispatcher' : 'Admin';
  return `${roleLabel} (${admin?.username ?? 'admin'})`;
}

// Dispatcher's lock/unlock is scoped to today, and only before today has been
// finalized — admin/superadmin bypass this entirely (unchanged, unrestricted).
async function assertDispatcherCanToggleLock(dispatch) {
  const todayStr = getIndiaDateStr();
  const dateStr = dispatch.dispatchDate.toISOString().slice(0, 10);
  if (dateStr !== todayStr) {
    throw new AppError("Dispatchers can only lock/unlock today's entries.", 403);
  }
  if (await isDayFinalizedForDispatcher(todayStr, todayStr)) {
    throw new AppError('Today has been finalized. Contact an admin to make changes.', 403);
  }
}

// Returns true when the dispatch cannot be edited by the salesman
function isEffectivelyLocked(dispatch, todayStr) {
  const dateStr = dispatch.dispatchDate.toISOString().slice(0, 10);
  const isPastDate = dateStr < todayStr;
  return (dispatch.isSubmitted || isPastDate) && !dispatch.isAdminUnlocked;
}

// SECURITY: a salesman's own client never gets to decide what they're billed.
// Re-derive each item's unitPrice server-side from the same source the price
// screen uses (SalespersonPrice effective on dispatchDate, else the
// product's global salespersonDefaultPrice) and reject any product that
// isn't enabled for them — whatever the request body claims is discarded.
async function resolveSalespersonItemPricing(salespersonId, items, dispatchDate) {
  const productIds = items.map((i) => i.productId);

  const [products, enabledRows, priceRows] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, isActive: true, salespersonEnabled: true, salespersonDefaultPrice: true },
    }),
    prisma.salespersonProduct.findMany({
      where: { salespersonId, productId: { in: productIds } },
      select: { productId: true, isEnabled: true },
    }),
    prisma.salespersonPrice.findMany({
      where: { salespersonId, productId: { in: productIds }, effectiveFrom: { lte: dispatchDate } },
      orderBy: { effectiveFrom: 'desc' },
    }),
  ]);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const enabledMap  = Object.fromEntries(enabledRows.map((r) => [r.productId, r.isEnabled]));

  // priceRows is effectiveFrom-desc, so the first row seen per product is the
  // latest one effective on or before dispatchDate.
  const priceMap = {};
  for (const row of priceRows) {
    if (!(row.productId in priceMap)) priceMap[row.productId] = row;
  }

  return items.map((item) => {
    const product = productMap[item.productId];
    if (!product || !product.isActive) {
      throw new AppError(`Product ${item.productId} is not available`, 400);
    }
    // Per-salesperson override wins; fall back to global flag when no row exists.
    // This lets Exception Manager enable a globally-disabled product for a subset
    // of salespeople (salespersonProduct.isEnabled=true overrides salespersonEnabled=false).
    const isEnabled = enabledMap[item.productId] ?? product.salespersonEnabled;
    if (!isEnabled) {
      throw new AppError(`Product ${item.productId} is not enabled for your account`, 403);
    }
    const resolvedPrice = priceMap[item.productId]
      ? Number(priceMap[item.productId].sellingPrice)
      : Number(product.salespersonDefaultPrice);
    return { ...item, unitPrice: resolvedPrice };
  });
}

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

// Admin only — cross-salesperson report. Salesmen already have their own
// scoped view via getAll (?date=), which filters to req.user.salespersonId.
const getSummary = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

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
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);

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

// Dispatcher finalizes today: force-locks any salesperson still
// unlocked/unsubmitted, then marks the day finalized. From that point on,
// only admin/superadmin can unlock a salesperson for this date (see
// assertDispatcherCanToggleLock above) — dispatcher-only action, not
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
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    throw new AppError('Admin access required', 403);
  }

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

module.exports = { getAll, getSummary, createOrUpdate, submit, lock, unlock, openForEntry, finalizeDay, unfinalizeDay, remove };
