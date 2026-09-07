'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { buildCategoryOrderMap, getCategoryOrder } = require('../../utils/productLayout');
const { assertAdmin, round2, round3, marginPct } = require('./_shared');

/**
 * Profit & loss per salesman over a date range.
 *
 * Profit on a dispatched line = quantity × (what the salesman was billed −
 * what the dairy paid for it). Revenue is StockDispatchItem.unitPrice, which
 * dispatches.controller.js froze server-side at dispatch time, so it already
 * reflects the salesman price effective that day and can't drift.
 *
 * Cost is deliberately the ProductCostPrice effective on each line's OWN
 * dispatchDate, not the product's current costPrice — a cost change must never
 * retroactively rewrite last month's profit. When nothing is effective yet on
 * that date the EARLIEST known cost row is used rather than the denormalised
 * Product.costPrice: the denorm is deliberately held at 0 while a future-dated
 * price is pending (products.controller.js), and costing a line at 0 books its
 * whole revenue as profit. Lines whose cost still can't be resolved are counted
 * and reported in `unpriced` instead of being passed off as pure margin.
 *
 * Every salesperson who was dispatched to in the range is listed, active or
 * not, so the per-salesman rows always add up to the totals — an inactive
 * salesman's dispatches used to sit in the totals with no row to explain them.
 *
 * A negative result is a real loss (salesman billed below the dairy's cost) and
 * is reported as-is, never clamped. Outstanding dues are intentionally NOT part
 * of this — it's trading margin, not collection performance.
 */
const profitLoss = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { from, to } = req.query;
  if (!from || !to) throw new AppError('from and to are required', 400);

  const fromDate = new Date(from);
  const toDate   = new Date(to);

  const [salespeople, dispatches, allCategories] = await Promise.all([
    prisma.salesperson.findMany({
      select:  { id: true, name: true, route: true, displayOrder: true, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.stockDispatch.findMany({
      where:   { dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true, name: true, category: true, costPrice: true, displayOrder: true,
                brand: { select: { id: true, name: true, displayOrder: true } },
              },
            },
          },
        },
      },
      orderBy: { dispatchDate: 'asc' },
    }),
    prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
  ]);
  const catOrderMap = buildCategoryOrderMap(allCategories);

  // Cost-price history for just the products actually dispatched in range.
  const productIds = [...new Set(
    dispatches.flatMap(d => d.items.map(i => i.productId))
  )];
  // No effectiveFrom filter: a product whose only row is future-dated would
  // otherwise return nothing here and fall through to a denorm that is 0 by
  // design while that schedule is pending.
  const costRows = productIds.length
    ? await prisma.productCostPrice.findMany({
        where:   { productId: { in: productIds } },
        orderBy: { effectiveFrom: 'desc' },
        select:  { productId: true, costPrice: true, effectiveFrom: true },
      })
    : [];

  // productId → rows already newest-first, so the first entry at or before a
  // given date is the one in force on that date.
  const costHistory = new Map();
  for (const row of costRows) {
    if (!costHistory.has(row.productId)) costHistory.set(row.productId, []);
    costHistory.get(row.productId).push(row);
  }
  // Products dispatched at a cost we could not establish. Reported rather than
  // silently costed at 0, which would show the line at a 100% margin.
  const unpriced = new Map();

  const costOn = (product, date) => {
    const rows = costHistory.get(product.id);
    // rows are newest-first, so the first at or before `date` is the one in
    // force; with none yet in force, the last entry is the earliest known cost
    // — a far better estimate of what the dairy charged than a 0 denorm.
    const hit  = rows?.find(r => r.effectiveFrom <= date) ?? rows?.[rows.length - 1];
    const cost = Number(hit ? hit.costPrice : product.costPrice);

    if (!(cost > 0) && !unpriced.has(product.id)) {
      unpriced.set(product.id, {
        productId:   product.id,
        productName: product.name,
        brandName:   product.brand?.name ?? null,
      });
    }
    return cost;
  };

  // Accumulate per salesperson (and per product within), plus an overall
  // per-date series for the range view.
  const bySalesperson = new Map();
  const byDate        = new Map();

  for (const dispatch of dispatches) {
    for (const item of dispatch.items) {
      const qty     = Number(item.quantity);
      const billed  = Number(item.unitPrice);
      const unitCst = costOn(item.product, dispatch.dispatchDate);
      const revenue = qty * billed;
      const cost    = qty * unitCst;

      if (!bySalesperson.has(dispatch.salespersonId)) {
        bySalesperson.set(dispatch.salespersonId, { revenue: 0, cost: 0, products: new Map() });
      }
      const sp = bySalesperson.get(dispatch.salespersonId);
      sp.revenue += revenue;
      sp.cost    += cost;

      if (!sp.products.has(item.productId)) {
        sp.products.set(item.productId, {
          productId:            item.productId,
          productName:          item.product.name,
          brandName:            item.product.brand?.name ?? null,
          brandDisplayOrder:    item.product.brand?.displayOrder ?? 0,
          category:             item.product.category ?? 'Other',
          categoryDisplayOrder: getCategoryOrder(catOrderMap, item.product.brand?.id, item.product.category),
          displayOrder:         item.product.displayOrder ?? 0,
          quantity: 0, revenue: 0, cost: 0,
        });
      }
      const prod = sp.products.get(item.productId);
      prod.quantity += qty;
      prod.revenue  += revenue;
      prod.cost     += cost;

      const key = dispatch.dispatchDate.toISOString();
      if (!byDate.has(key)) byDate.set(key, { date: dispatch.dispatchDate, revenue: 0, cost: 0 });
      const day = byDate.get(key);
      day.revenue += revenue;
      day.cost    += cost;
    }
  }

  // Every active salesperson is listed, dispatches or not, so the sidebar shows
  // the full roster the way Collections does — plus any INACTIVE salesperson
  // who was dispatched to inside the range. Without that second group their
  // revenue and cost still reached the totals below (which sum every dispatch)
  // while no row accounted for it, so the listed rows didn't add up to the
  // summary cards.
  const rows = salespeople
    .filter((s) => s.isActive || bySalesperson.has(s.id))
    .map((s) => {
      const agg     = bySalesperson.get(s.id) ?? { revenue: 0, cost: 0, products: new Map() };
      const profit  = agg.revenue - agg.cost;
      const products = [...agg.products.values()]
        .map(p => ({
          ...p,
          quantity:        round2(p.quantity),
          avgBilledPrice:  p.quantity ? round3(p.revenue / p.quantity) : 0,
          avgCostPrice:    p.quantity ? round3(p.cost / p.quantity)    : 0,
          revenue:         round2(p.revenue),
          cost:            round2(p.cost),
          profit:          round2(p.revenue - p.cost),
        }))
        // Same layout order as the salesman pricing tab and stock-receipt entry
        // (brand → category → product display order → name), so a product sits
        // in the same place here as everywhere else, rather than jumping around
        // by profit rank on every date-range change.
        .sort((a, b) =>
          a.brandDisplayOrder - b.brandDisplayOrder ||
          a.categoryDisplayOrder - b.categoryDisplayOrder ||
          a.displayOrder - b.displayOrder ||
          a.productName.localeCompare(b.productName)
        );

      return {
        salespersonId: s.id,
        name:          s.name,
        route:         s.route,
        isActive:      s.isActive,
        revenue:   round2(agg.revenue),
        cost:      round2(agg.cost),
        profit:    round2(profit),
        marginPct: marginPct(profit, agg.revenue),
        products,
      };
    });

  const totalRevenue = [...bySalesperson.values()].reduce((s, a) => s + a.revenue, 0);
  const totalCost    = [...bySalesperson.values()].reduce((s, a) => s + a.cost, 0);
  const totalProfit  = totalRevenue - totalCost;

  const daily = [...byDate.values()]
    .sort((a, b) => a.date - b.date)
    .map(d => ({
      date:      d.date,
      revenue:   round2(d.revenue),
      cost:      round2(d.cost),
      profit:    round2(d.revenue - d.cost),
      marginPct: marginPct(d.revenue - d.cost, d.revenue),
    }));

  res.json({
    success: true,
    data: {
      from,
      to,
      totals: {
        revenue:   round2(totalRevenue),
        cost:      round2(totalCost),
        profit:    round2(totalProfit),
        marginPct: marginPct(totalProfit, totalRevenue),
      },
      daily,
      // Non-empty means some dispatched lines were costed at 0 because no cost
      // price could be resolved — their revenue is sitting in profit untaxed by
      // any cost, so the figures above read high until these are priced.
      unpriced: [...unpriced.values()],
      salespeople: rows,
    },
  });
});

module.exports = { profitLoss };
