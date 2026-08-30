'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { getIndiaDateStr } = require('../../utils/dateUtils');
const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
const { buildCategoryOrderMap, getCategoryOrder } = require('../../utils/productLayout');
const { assertAdminOrDispatcher } = require('./_shared');

const dailyDispatch = asyncHandler(async (req, res) => {
  assertAdminOrDispatcher(req);
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const dispatchDate = new Date(date);
  const today = getIndiaDateStr();
  const isPastDate = date < today;

  // Scope-by-role: even though the route mounts under requireAdmin, if a
  // salesman ever lands here we still must not leak other salespeople's data.
  const dispatchWhere = { dispatchDate };
  if (req.user.role === 'salesman') {
    dispatchWhere.salespersonId = req.user.salespersonId;
  }

  // The Stock Balance view (includeReceipts=1) must surface EVERY product that
  // had stock received that day — not only salesperson-dispatchable ones —
  // otherwise its "Received" total silently drops products that were received
  // but aren't salespersonEnabled, disagreeing with the Stock Summary report.
  const includeReceipts = req.query.includeReceipts === '1' || req.query.includeReceipts === 'true';
  const productWhere = includeReceipts
    ? {
        isActive: true,
        brand: { isActive: true },
        OR: [
          { showInStockReceipt: true, salespersonEnabled: true },
          { stockReceipts: { some: { receiptDate: dispatchDate } } },
        ],
      }
    : { isActive: true, showInStockReceipt: true, salespersonEnabled: true, brand: { isActive: true } };

  // Salespeople with no dispatch row for this date need to surface as blank
  // "No entry" rows so the sidebar reflects who is still pending — for every
  // role that can see the sheet, not just admin. This used to be assembled
  // client-side from a separate /salespeople call, but that endpoint is
  // admin-only and 403s for a dispatcher, so a dispatcher never saw the
  // no-entry names. Resolving it here instead means both roles get the same
  // list from the one endpoint they already share.
  const [dispatches, allProducts, allCategories, allSalespeople] = await Promise.all([
    prisma.stockDispatch.findMany({
      where: dispatchWhere,
      include: {
        salesperson: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, brandId: true } } },
        },
      },
      orderBy: [{ salesperson: { displayOrder: 'asc' } }, { salesperson: { name: 'asc' } }],
    }),
    prisma.product.findMany({
      where: productWhere,
      include: { brand: { select: { id: true, name: true, displayOrder: true } } },
      // Category is a string column, not a relation, so Prisma cannot sort by
      // categoryDisplayOrder here. A JS sort below applies the full ordering.
      orderBy: [{ brand: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
    req.user.role === 'salesman'
      ? Promise.resolve([])
      : prisma.salesperson.findMany({
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true },
        }),
  ]);

  // Always sort by brand → category → product displayOrder → name.
  // Category is a string field on the product model (not a relation), so the
  // category tier must be resolved here in JS using the categories table.
  // This applies to both the dispatch sheet and the Stock Balance view so that
  // products appear in the same order as the dairy layout settings.
  {
    const catOrder = buildCategoryOrderMap(allCategories);
    allProducts.sort((a, b) =>
      (a.brand.displayOrder - b.brand.displayOrder) ||
      (getCategoryOrder(catOrder, a.brandId, a.category) - getCategoryOrder(catOrder, b.brandId, b.category)) ||
      (a.displayOrder - b.displayOrder) ||
      a.name.localeCompare(b.name)
    );
  }

  // Build brand → products column map
  const brandMap = new Map();
  for (const p of allProducts) {
    if (!brandMap.has(p.brandId)) {
      brandMap.set(p.brandId, {
        brandId:   p.brandId,
        brandName: p.brand.name,
        products:  [],
      });
    }
    brandMap.get(p.brandId).products.push({ productId: p.id, productName: p.name, unitsPerContainer: p.unitsPerContainer ?? 0, category: p.category ?? null });
  }
  const brands = Array.from(brandMap.values());
  const productIdSet = new Set(allProducts.map(p => p.id));

  const productTotals = {};
  const rows = dispatches.map(d => {
    const items = {};
    for (const item of d.items) {
      if (!productIdSet.has(item.productId)) continue;
      items[item.productId] = {
        qty:       Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      };
      productTotals[item.productId] = (productTotals[item.productId] ?? 0) + Number(item.quantity);
    }
    const isLocked = (d.isSubmitted || isPastDate) && !d.isAdminUnlocked;
    return {
      salespersonId:    d.salesperson.id,
      salespersonName:  d.salesperson.name,
      items,
      totalAmount:      Number(d.totalAmount),
      dispatchId:       d.id,
      isSubmitted:      d.isSubmitted,
      isAdminUnlocked:  d.isAdminUnlocked,
      isLocked,
    };
  });

  // Append blank rows for active salespeople who have no dispatch this date —
  // after the entered rows, in the same displayOrder/name ordering as the
  // /salespeople list they used to be assembled from client-side.
  const dispatchedIds = new Set(rows.map(r => r.salespersonId));
  const blankRows = allSalespeople
    .filter(s => !dispatchedIds.has(s.id))
    .map(s => ({
      salespersonId:   s.id,
      salespersonName: s.name,
      items:           {},
      totalAmount:     0,
      dispatchId:      null,
      isSubmitted:     false,
      isAdminUnlocked: false,
      isLocked:        isPastDate,
    }));

  const isDayFinalized = await isDayFinalizedForDispatcher(date, getIndiaDateStr());

  res.json({ success: true, data: { date, brands, rows: [...rows, ...blankRows], totals: productTotals, isDayFinalized } });
});

module.exports = { dailyDispatch };
