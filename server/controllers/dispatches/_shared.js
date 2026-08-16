'use strict';

const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { getIndiaDateStr } = require('../../utils/dateUtils');
const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');

// Admin/superadmin/dispatcher all get lock/unlock in some form — dispatcher's
// is further restricted to today + not-yet-finalized by
// assertDispatcherCanToggleLock below.
const ADMIN_TIER = new Set(['admin', 'superadmin', 'dispatcher']);

// createOrUpdate/remove/lock/unlock/etc are shared by an admin dispatching stock
// to a salesperson and the salesperson self-entering their own day's stock —
// the Slack card needs to say which one actually happened.
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

module.exports = {
  ADMIN_TIER,
  resolveActor,
  assertDispatcherCanToggleLock,
  isEffectivelyLocked,
  resolveSalespersonItemPricing,
};
