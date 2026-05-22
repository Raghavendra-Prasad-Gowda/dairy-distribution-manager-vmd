const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { qualifiesForDeposit, calculateLineDeposit } = require('../services/depositRules');
const { getIndiaDateStr } = require('../utils/dateUtils');

// Defense-in-depth: every report endpoint mounts under requireAdmin in app.js,
// but if that middleware is ever moved or misconfigured, the controller still
// refuses. Salespeople have no business reading aggregate reports.
function assertAdmin(req) {
  if (req.user?.role !== 'admin') {
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

  const [balances, allDispatches, allPayments] = await Promise.all([
    prisma.salespersonBalance.findMany({
      where: { salespersonId: spId, balanceDate: { gte: fromDate, lte: toDate } },
      orderBy: { balanceDate: 'asc' },
    }),
    prisma.stockDispatch.findMany({
      where: { salespersonId: spId, dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        items: { include: { product: { include: { brand: { select: { name: true } } } } } },
      },
    }),
    prisma.salespersonPayment.findMany({
      where: { salespersonId: spId, paymentDate: { gte: fromDate, lte: toDate } },
    }),
  ]);

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
    return {
      date:           b.balanceDate,
      openingBalance: Number(b.openingBalance),
      stockGiven:     Number(b.stockGiven),
      amountPaid:     Number(b.amountPaid),
      closingBalance: Number(b.closingBalance),
      items: dispatch?.items.map((i) => ({
        brandName:   i.product.brand.name,
        productName: i.product.name,
        quantity:    Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
        totalAmount: Number(i.totalAmount),
      })) ?? [],
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
  const { from, to, brandId, date } = req.query;

  // Support legacy single-date param
  const fromStr = from ?? date;
  const toStr   = to   ?? date;
  if (!fromStr) throw new AppError('from (or date) query param is required', 400);

  const fromDate   = new Date(fromStr);
  const toDate     = new Date(toStr);
  const brandFilter = brandId ? parseId(brandId, 'Brand ID') : null;

  const [receipts, dispatches, allRoutes] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: {
        receiptDate: { gte: fromDate, lte: toDate },
        ...(brandFilter ? { brandId: brandFilter } : {}),
      },
      include: { product: { select: { name: true, unitsPerContainer: true, costPrice: true, displayOrder: true } }, brand: { select: { name: true } } },
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
  ]);
  const routeMap = new Map(allRoutes.map(r => [r.id, r.routeNumber]));

  // Build date-keyed map
  const dateMap = new Map();
  const ensureDay = (key) => {
    if (!dateMap.has(key)) dateMap.set(key, { date: key, receipts: [], dispatches: [] });
    return dateMap.get(key);
  };

  for (const r of receipts) {
    const key = r.receiptDate.toISOString().slice(0, 10);
    ensureDay(key).receipts.push({
      brandName:        r.brand.name,
      productName:      r.product.name,
      quantity:         Number(r.quantity),
      unitPrice:        Number(r.unitPrice),
      amount:           Number(r.quantity) * Number(r.unitPrice),
      routeNumber:      r.routeId !== 0 ? (routeMap.get(r.routeId) ?? null) : null,
      unitsPerContainer: r.product.unitsPerContainer ?? null,
      costPrice:         Number(r.product.costPrice ?? 0),
      displayOrder:      r.product.displayOrder ?? 0,
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

  const [brand, categories, receipts] = await Promise.all([
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
  ]);

  if (!brand) throw new AppError('Brand not found', 404);

  const depositPerLitre   = Number(brand.depositPerLitre ?? 0);
  const enabledCategories = new Set(categories.filter(c => c.depositEnabled).map(c => c.name));
  const categoryOrderMap  = new Map(categories.map(c => [c.name, c.displayOrder ?? 0]));

  // Group by date
  const byDate = new Map();
  for (const r of receipts) {
    const key = r.receiptDate.toISOString();
    if (!byDate.has(key)) byDate.set(key, { date: r.receiptDate, items: [] });
    byDate.get(key).items.push(r);
  }

  let runningTotal = 0;
  const rows = [];

  for (const { date, items } of byDate.values()) {
    const depositItems = [];
    let dailyDeposit = 0;

    for (const r of items) {
      const { name, category, unitType, unitSize, containerType, displayOrder } = r.product;
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
    runningTotal += dailyDeposit;
    rows.push({
      date,
      dailyDeposit:  round2(dailyDeposit),
      runningTotal:  round2(runningTotal),
      items: depositItems.map(i => ({
        ...i,
        volumeOrWeight: round3(i.volumeOrWeight),
        depositAmount:  round2(i.depositAmount),
      })),
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
      totalDeposit:   round2(runningTotal),
      rows,
    },
  });
});

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

const dailyDispatch = asyncHandler(async (req, res) => {
  assertAdmin(req);
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

  const [dispatches, allProducts] = await Promise.all([
    prisma.stockDispatch.findMany({
      where: dispatchWhere,
      include: {
        salesperson: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, brandId: true } } },
        },
      },
      orderBy: { salesperson: { name: 'asc' } },
    }),
    prisma.product.findMany({
      where: { isActive: true, showInStockReceipt: true, salespersonEnabled: true },
      include: { brand: { select: { id: true, name: true, salespersonDisplayOrder: true } } },
      orderBy: [
        { brand: { salespersonDisplayOrder: 'asc' } },
        { salespersonDisplayOrder: 'asc' },
      ],
    }),
  ]);

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

  res.json({ success: true, data: { date, brands, rows, totals: productTotals } });
});

module.exports = { dairyStatement, salespersonStatement, stockSummary, outstanding, depositSummary, dailyDispatch };
