const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { qualifiesForDeposit, calculateLineDeposit } = require('../services/depositRules');
const { getIndiaDateStr } = require('../utils/dateUtils');
const { isDayFinalizedForDispatcher } = require('../services/dispatchDayFinalization');

// Defense-in-depth: every report endpoint mounts under requireAdmin in app.js,
// but if that middleware is ever moved or misconfigured, the controller still
// refuses. Salespeople have no business reading aggregate reports.
function assertAdmin(req) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    throw new AppError('Admin access required', 403);
  }
}

// dailyDispatch alone is also readable by dispatcher (route-level gate is
// requireAdminOrDispatcher) — same defense-in-depth purpose as assertAdmin.
function assertAdminOrDispatcher(req) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'superadmin' && role !== 'dispatcher') {
    throw new AppError('Admin access required', 403);
  }
}

const dairyStatement = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { brandId, from, to } = req.query;
  if (!brandId || !from || !to) throw new AppError('brandId, from, and to are required', 400);

  const id = parseId(brandId, 'Brand ID');
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const [balances, allReceipts, allPayments, brandRoutes] = await Promise.all([
    prisma.dairyBalance.findMany({
      where: { brandId: id, balanceDate: { gte: fromDate, lte: toDate } },
      include: { brand: { select: { name: true } } },
      orderBy: { balanceDate: 'asc' },
    }),
    prisma.stockReceipt.findMany({
      where: { brandId: id, receiptDate: { gte: fromDate, lte: toDate } },
      include: { product: { select: { name: true } } },
      orderBy: [{ routeId: 'asc' }, { productId: 'asc' }],
    }),
    prisma.dairyPayment.findMany({
      where: { brandId: id, paymentDate: { gte: fromDate, lte: toDate } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.route.findMany({ where: { brandId: id }, select: { id: true, routeNumber: true, displayOrder: true } }),
  ]);
  const routeMap = new Map(brandRoutes.map(r => [r.id, r.routeNumber]));

  const receiptsByDate = new Map();
  for (const r of allReceipts) {
    const key = r.receiptDate.toISOString();
    if (!receiptsByDate.has(key)) receiptsByDate.set(key, []);
    receiptsByDate.get(key).push(r);
  }
  const paymentsByDate = new Map();
  for (const p of allPayments) {
    const key = p.paymentDate.toISOString();
    if (!paymentsByDate.has(key)) paymentsByDate.set(key, []);
    paymentsByDate.get(key).push(p);
  }

  const rows = balances.map((b) => {
    const key = b.balanceDate.toISOString();
    return {
      date:           b.balanceDate,
      openingBalance: Number(b.openingBalance),
      stockValue:     Number(b.stockValue),
      depositValue:   Number(b.depositValue ?? 0),
      amountPaid:     Number(b.amountPaid),
      closingBalance: Number(b.closingBalance),
      receipts: (receiptsByDate.get(key) ?? []).map((r) => ({
        productName: r.product.name,
        quantity:    Number(r.quantity),
        unitPrice:   Number(r.unitPrice),
        amount:      Number(r.quantity) * Number(r.unitPrice),
        routeId:     r.routeId,
        routeNumber: r.routeId !== 0 ? (routeMap.get(r.routeId) ?? null) : null,
      })),
      payments: (paymentsByDate.get(key) ?? []).map((p) => ({
        amount: Number(p.amount),
        mode:   p.paymentMode,
        ref:    p.reference,
      })),
    };
  });

  res.json({ success: true, data: rows });
});

const salespersonStatement = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { salespersonId, from, to } = req.query;
  if (!salespersonId || !from || !to) throw new AppError('salespersonId, from, and to are required', 400);

  const spId = parseId(salespersonId, 'Salesperson ID');
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const [balances, allDispatches, allPayments, allCategories] = await Promise.all([
    prisma.salespersonBalance.findMany({
      where: { salespersonId: spId, balanceDate: { gte: fromDate, lte: toDate } },
      orderBy: { balanceDate: 'asc' },
    }),
    prisma.stockDispatch.findMany({
      where: { salespersonId: spId, dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        items: {
          include: {
            // Include brand.displayOrder so items can be sorted by the dairy layout
            // order (brand → category → product displayOrder → name).
            product: { include: { brand: { select: { name: true, displayOrder: true } } } },
          },
        },
      },
    }),
    prisma.salespersonPayment.findMany({
      where: { salespersonId: spId, paymentDate: { gte: fromDate, lte: toDate } },
    }),
    // Category display orders for the item sort — category is a string column on
    // product (not a relation), so ordering must be done in JS after the query.
    prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
  ]);

  const catOrder = new Map(allCategories.map(c => [`${c.brandId}::${c.name}`, c.displayOrder]));

  const dispatchByDate = new Map(allDispatches.map(d => [d.dispatchDate.toISOString(), d]));
  const paymentsByDate = new Map();
  for (const p of allPayments) {
    const key = p.paymentDate.toISOString();
    if (!paymentsByDate.has(key)) paymentsByDate.set(key, []);
    paymentsByDate.get(key).push(p);
  }

  const rows = balances.map((b) => {
    const key = b.balanceDate.toISOString();
    const dispatch = dispatchByDate.get(key);

    // Sort items by dairy layout order: brand → category → product displayOrder → name.
    const sortedItems = [...(dispatch?.items ?? [])].sort((a, b) =>
      (a.product.brand?.displayOrder ?? 999) - (b.product.brand?.displayOrder ?? 999) ||
      (catOrder.get(`${a.product.brandId}::${a.product.category}`) ?? 999) -
        (catOrder.get(`${b.product.brandId}::${b.product.category}`) ?? 999) ||
      (a.product.displayOrder ?? 999) - (b.product.displayOrder ?? 999) ||
      a.product.name.localeCompare(b.product.name)
    );

    return {
      date:           b.balanceDate,
      openingBalance: Number(b.openingBalance),
      stockGiven:     Number(b.stockGiven),
      amountPaid:     Number(b.amountPaid),
      closingBalance: Number(b.closingBalance),
      items: sortedItems.map((i) => ({
        brandName:   i.product.brand.name,
        productName: i.product.name,
        quantity:    Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
        totalAmount: Number(i.totalAmount),
      })),
      payments: (paymentsByDate.get(key) ?? []).map((p) => ({
        amount: Number(p.amount),
        mode:   p.paymentMode,
        ref:    p.reference,
      })),
    };
  });

  res.json({ success: true, data: rows });
});

const stockSummary = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { from, to, brandId, date, routeId } = req.query;

  // Support legacy single-date param
  const fromStr = from ?? date;
  const toStr   = to   ?? date;
  if (!fromStr) throw new AppError('from (or date) query param is required', 400);

  const fromDate    = new Date(fromStr);
  const toDate      = new Date(toStr);
  const brandFilter = brandId ? parseId(brandId, 'Brand ID') : null;
  const routeFilter = routeId != null && routeId !== '' ? parseId(routeId, 'Route ID') : null;

  const [receipts, dispatches, allRoutes, allCategories] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: {
        receiptDate: { gte: fromDate, lte: toDate },
        ...(brandFilter ? { brandId: brandFilter } : {}),
        ...(routeFilter !== null ? { routeId: routeFilter } : {}),
      },
      include: {
        product: { select: { name: true, category: true, unitsPerContainer: true, costPrice: true, displayOrder: true, unitSize: true, unitType: true, containerType: true } },
        brand:   { select: { name: true, displayOrder: true } },
      },
      orderBy: [{ receiptDate: 'asc' }, { brandId: 'asc' }, { routeId: 'asc' }, { productId: 'asc' }],
    }),
    prisma.stockDispatch.findMany({
      where: { dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        salesperson: { select: { name: true } },
        items: {
          where: brandFilter ? { product: { brandId: brandFilter } } : {},
          include: { product: { include: { brand: { select: { name: true } } } } },
        },
      },
      orderBy: [{ dispatchDate: 'asc' }, { salesperson: { name: 'asc' } }],
    }),
    prisma.route.findMany({ select: { id: true, routeNumber: true } }),
    prisma.category.findMany({
      where: brandFilter ? { brandId: brandFilter } : {},
      select: { brandId: true, name: true, displayOrder: true },
    }),
  ]);
  const routeMap   = new Map(allRoutes.map(r => [r.id, r.routeNumber]));
  const catOrderMap = new Map(allCategories.map(c => [`${c.brandId}::${c.name}`, c.displayOrder]));

  // Build date-keyed map
  const dateMap = new Map();
  const ensureDay = (key) => {
    if (!dateMap.has(key)) dateMap.set(key, { date: key, receipts: [], dispatches: [] });
    return dateMap.get(key);
  };

  for (const r of receipts) {
    const key = r.receiptDate.toISOString().slice(0, 10);
    ensureDay(key).receipts.push({
      brandName:            r.brand.name,
      brandDisplayOrder:    r.brand.displayOrder ?? 0,
      productName:          r.product.name,
      category:             r.product.category ?? null,
      categoryDisplayOrder: catOrderMap.get(`${r.brandId}::${r.product.category}`) ?? 999,
      quantity:             Number(r.quantity),
      unitPrice:            Number(r.unitPrice),
      amount:               Number(r.quantity) * Number(r.unitPrice),
      routeNumber:          r.routeId !== 0 ? (routeMap.get(r.routeId) ?? null) : null,
      unitsPerContainer:    r.product.unitsPerContainer ?? null,
      containerType:        r.product.containerType ?? null,
      unitSize:             r.product.unitType === 'ml'   ? (r.product.unitSize ?? null) : null,
      unitSizeGrams:        r.product.unitType === 'gram' ? (r.product.unitSize ?? null) : null,
      costPrice:            Number(r.product.costPrice ?? 0),
      displayOrder:         r.product.displayOrder ?? 0,
    });
  }

  const filteredDispatches = brandFilter
    ? dispatches.filter(d => d.items.length > 0)
    : dispatches;

  for (const d of filteredDispatches) {
    const key = d.dispatchDate.toISOString().slice(0, 10);
    ensureDay(key).dispatches.push({
      salespersonName: d.salesperson.name,
      totalAmount:     d.items.reduce((s, i) => s + Number(i.totalAmount), 0),
      items: d.items.map((i) => ({
        brandName:   i.product.brand.name,
        productName: i.product.name,
        quantity:    Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
        totalAmount: Number(i.totalAmount),
      })),
    });
  }

  const rows = [...dateMap.keys()].sort().map(key => {
    const day = dateMap.get(key);
    return {
      ...day,
      totalReceived:   day.receipts.reduce((s, r) => s + r.amount, 0),
      totalDispatched: day.dispatches.reduce((s, d) => s + d.totalAmount, 0),
    };
  });

  res.json({
    success: true,
    data: {
      from: fromStr,
      to:   toStr,
      grandTotalReceived:   rows.reduce((s, r) => s + r.totalReceived,   0),
      grandTotalDispatched: rows.reduce((s, r) => s + r.totalDispatched, 0),
      rows,
    },
  });
});

const outstanding = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const [dairyBalances, spBalances] = await Promise.all([
    prisma.dairyBalance.findMany({
      where: { brand: { isActive: true } },
      orderBy: { balanceDate: 'desc' },
      distinct: ['brandId'],
      include: { brand: { select: { id: true, name: true } } },
    }),
    prisma.salespersonBalance.findMany({
      where: { salesperson: { isActive: true } },
      orderBy: { balanceDate: 'desc' },
      distinct: ['salespersonId'],
      include: { salesperson: { select: { id: true, name: true } } },
    }),
  ]);

  res.json({
    success: true,
    data: {
      dairy: dairyBalances.map((b) => ({
        brandId:     b.brand.id,
        brandName:   b.brand.name,
        outstanding: Number(b.closingBalance),
      })),
      salespeople: spBalances.map((b) => ({
        salespersonId:   b.salesperson.id,
        salespersonName: b.salesperson.name,
        outstanding:     Number(b.closingBalance),
      })),
    },
  });
});

const depositSummary = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { brandId, from, to } = req.query;
  if (!brandId || !from || !to) throw new AppError('brandId, from, and to are required', 400);

  const id = parseId(brandId, 'Brand ID');
  const fromDate = new Date(from);
  const toDate   = new Date(to);

  const [brand, categories, receipts, topUps, priorTopUpAgg] = await Promise.all([
    prisma.brand.findUnique({
      where:  { id },
      select: { name: true, depositEnabled: true, depositPerLitre: true },
    }),
    prisma.category.findMany({
      where:  { brandId: id },
      select: { name: true, depositEnabled: true, displayOrder: true },
    }),
    prisma.stockReceipt.findMany({
      where:   { brandId: id, receiptDate: { gte: fromDate, lte: toDate } },
      include: { product: { select: { name: true, category: true, unitType: true, unitSize: true, containerType: true, depositEnabled: true, displayOrder: true } } },
      orderBy: { receiptDate: 'asc' },
    }),
    // Manual deposit top-ups (DairyDepositTopUp) — a standalone ledger, never
    // a DairyPayment. Merged into the same rows below so the report reads as
    // one continuous deposit ledger instead of two disconnected numbers.
    prisma.dairyDepositTopUp.findMany({
      where:   { brandId: id, topUpDate: { gte: fromDate, lte: toDate } },
      orderBy: { topUpDate: 'asc' },
    }),
    // A top-up represents a deposit balance from before the app — it must
    // count toward the running total even when `from` is set after it was
    // recorded. (Receipt-based accrual needs no such carry-forward: it's
    // fully re-derivable for any range just by widening `from`.)
    prisma.dairyDepositTopUp.aggregate({
      where: { brandId: id, topUpDate: { lt: fromDate } },
      _sum:  { amount: true },
    }),
  ]);

  if (!brand) throw new AppError('Brand not found', 404);

  const depositPerLitre   = Number(brand.depositPerLitre ?? 0);
  const enabledCategories = new Set(categories.filter(c => c.depositEnabled).map(c => c.name));
  const categoryOrderMap  = new Map(categories.map(c => [c.name, c.displayOrder ?? 0]));

  const openingDeposit = Number(priorTopUpAgg?._sum?.amount ?? 0);

  // Group by date — receipts first, then merge in top-ups for the same dates
  // (or new date entries if a top-up landed on a day with no receipts).
  const byDate = new Map();
  for (const r of receipts) {
    const key = r.receiptDate.toISOString();
    if (!byDate.has(key)) byDate.set(key, { date: r.receiptDate, items: [], topUps: [] });
    byDate.get(key).items.push(r);
  }
  for (const t of (topUps ?? [])) {
    const key = t.topUpDate.toISOString();
    if (!byDate.has(key)) byDate.set(key, { date: t.topUpDate, items: [], topUps: [] });
    byDate.get(key).topUps.push(t);
  }
  const sortedDates = [...byDate.values()].sort((a, b) => a.date - b.date);

  let runningTotal = openingDeposit;
  const rows = [];

  for (const { date, items, topUps: dayTopUps } of sortedDates) {
    const depositItems = [];
    let dailyDeposit = 0;

    for (const r of items) {
      const { name, category, unitType, unitSize, displayOrder } = r.product;
      if (!qualifiesForDeposit(r.product, brand, enabledCategories)) continue;

      const qty            = Number(r.quantity);
      const volumeOrWeight = qty * (Number(unitSize) / 1000);
      const depositAmount  = calculateLineDeposit(qty, unitSize, depositPerLitre);

      // Accumulate per product (multiple routes → single line). Keep full
      // precision during accumulation — round only at the response boundary.
      const existing = depositItems.find(i => i.productName === name);
      if (existing) {
        existing.quantity       += qty;
        existing.volumeOrWeight += volumeOrWeight;
        existing.depositAmount  += depositAmount;
      } else {
        depositItems.push({
          productName:          name,
          category:             category ?? 'Other',
          categoryDisplayOrder: categoryOrderMap.get(category ?? '') ?? 9999,
          productDisplayOrder:  displayOrder ?? 0,
          unitType,
          quantity:             qty,
          unitSize:             Number(unitSize),
          volumeOrWeight,
          depositPerLitre,
          depositAmount,
        });
      }
    }

    depositItems.sort((a, b) =>
      a.categoryDisplayOrder !== b.categoryDisplayOrder
        ? a.categoryDisplayOrder - b.categoryDisplayOrder
        : a.productDisplayOrder - b.productDisplayOrder
    );

    dailyDeposit = depositItems.reduce((s, i) => s + i.depositAmount, 0);

    // Manual top-ups render as their own line items — no qty/volume, just an
    // amount and who/why — appended after the day's regular receipt items.
    const topUpItems = dayTopUps.map(t => ({
      id:                   t.id,
      isTopUp:              true,
      productName:          'Manual Deposit Top-up',
      category:             'Top-up',
      categoryDisplayOrder: -1,
      productDisplayOrder:  0,
      depositAmount:        Number(t.amount),
      notes:                t.notes,
      createdBy:            t.createdBy,
    }));
    dailyDeposit += topUpItems.reduce((s, t) => s + t.depositAmount, 0);

    runningTotal += dailyDeposit;
    rows.push({
      date,
      dailyDeposit:  round2(dailyDeposit),
      runningTotal:  round2(runningTotal),
      items: [
        ...topUpItems.map(t => ({ ...t, depositAmount: round2(t.depositAmount) })),
        ...depositItems.map(i => ({
          ...i,
          volumeOrWeight: round3(i.volumeOrWeight),
          depositAmount:  round2(i.depositAmount),
        })),
      ],
    });
  }

  res.json({
    success: true,
    data: {
      brandName:      brand.name,
      depositEnabled: brand.depositEnabled,
      depositPerLitre,
      from,
      to,
      openingDeposit: round2(openingDeposit),
      totalDeposit:   round2(runningTotal),
      rows,
    },
  });
});

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

/** profit ÷ revenue as a percentage; 0 when nothing was dispatched. */
function marginPct(profit, revenue) {
  return revenue === 0 ? 0 : round2((profit / revenue) * 100);
}

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
 * retroactively rewrite last month's profit. Products with no price-history row
 * fall back to the denormalised Product.costPrice.
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
      where:   { isActive: true },
      select:  { id: true, name: true, route: true, displayOrder: true },
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
  const catOrderMap = new Map(allCategories.map(c => [`${c.brandId}::${c.name}`, c.displayOrder]));

  // Cost-price history for just the products actually dispatched in range.
  const productIds = [...new Set(
    dispatches.flatMap(d => d.items.map(i => i.productId))
  )];
  const costRows = productIds.length
    ? await prisma.productCostPrice.findMany({
        where:   { productId: { in: productIds }, effectiveFrom: { lte: toDate } },
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
  const costOn = (product, date) => {
    const rows = costHistory.get(product.id);
    const hit  = rows?.find(r => r.effectiveFrom <= date);
    return Number(hit ? hit.costPrice : product.costPrice);
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
          categoryDisplayOrder: catOrderMap.get(`${item.product.brand?.id}::${item.product.category}`) ?? 999,
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
  // the full roster the way Collections does.
  const rows = salespeople.map((s) => {
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
      salespeople: rows,
    },
  });
});

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

  const [dispatches, allProducts, allCategories] = await Promise.all([
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
  ]);

  // Always sort by brand → category → product displayOrder → name.
  // Category is a string field on the product model (not a relation), so the
  // category tier must be resolved here in JS using the categories table.
  // This applies to both the dispatch sheet and the Stock Balance view so that
  // products appear in the same order as the dairy layout settings.
  {
    const catOrder = new Map(allCategories.map(c => [`${c.brandId}::${c.name}`, c.displayOrder]));
    allProducts.sort((a, b) =>
      (a.brand.displayOrder - b.brand.displayOrder) ||
      ((catOrder.get(`${a.brandId}::${a.category}`) ?? 999) - (catOrder.get(`${b.brandId}::${b.category}`) ?? 999)) ||
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

  const isDayFinalized = await isDayFinalizedForDispatcher(date, getIndiaDateStr());

  res.json({ success: true, data: { date, brands, rows, totals: productTotals, isDayFinalized } });
});

module.exports = { dairyStatement, salespersonStatement, stockSummary, outstanding, depositSummary, dailyDispatch, profitLoss };
