const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const dairyStatement = asyncHandler(async (req, res) => {
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
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const receiptDate = new Date(date);
  const [receipts, dispatches, allRoutes] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: { receiptDate },
      include: { product: { select: { name: true } }, brand: { select: { name: true } } },
      orderBy: [{ brandId: 'asc' }, { routeId: 'asc' }, { productId: 'asc' }],
    }),
    prisma.stockDispatch.findMany({
      where: { dispatchDate: receiptDate },
      include: {
        salesperson: { select: { name: true } },
        items: { include: { product: { include: { brand: { select: { name: true } } } } } },
      },
    }),
    prisma.route.findMany({ select: { id: true, routeNumber: true } }),
  ]);
  const routeMap = new Map(allRoutes.map(r => [r.id, r.routeNumber]));

  res.json({
    success: true,
    data: {
      date,
      receipts: receipts.map((r) => ({
        brandName:   r.brand.name,
        productName: r.product.name,
        quantity:    Number(r.quantity),
        unitPrice:   Number(r.unitPrice),
        amount:      Number(r.quantity) * Number(r.unitPrice),
        routeId:     r.routeId,
        routeNumber: r.routeId !== 0 ? (routeMap.get(r.routeId) ?? null) : null,
      })),
      dispatches: dispatches.map((d) => ({
        salespersonName: d.salesperson.name,
        totalAmount:     Number(d.totalAmount),
        items: d.items.map((i) => ({
          brandName:   i.product.brand.name,
          productName: i.product.name,
          quantity:    Number(i.quantity),
          unitPrice:   Number(i.unitPrice),
          totalAmount: Number(i.totalAmount),
        })),
      })),
    },
  });
});

const outstanding = asyncHandler(async (req, res) => {
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

module.exports = { dairyStatement, salespersonStatement, stockSummary, outstanding };
