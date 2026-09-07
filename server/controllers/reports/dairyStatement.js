'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { parseId } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { assertAdmin } = require('./_shared');

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
      // Part of the closing formula (opening + stockValue + depositValue +
      // topUpAmount − amountPaid), so it MUST be returned: without it the row
      // cannot be reconciled and "bill − paid" silently misses the top-up.
      topUpAmount:    Number(b.topUpAmount ?? 0),
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
      // Top-ups are admin-loaded pre-existing dues owed to this brand — they
      // ADD to the balance. Listing them among payments made would both
      // overstate what was paid and leave the row unable to add up.
      payments: (paymentsByDate.get(key) ?? [])
        .filter((p) => !p.isTopUp)
        .map((p) => ({
          amount: Number(p.amount),
          mode:   p.paymentMode,
          ref:    p.reference,
        })),
      topUps: (paymentsByDate.get(key) ?? [])
        .filter((p) => p.isTopUp)
        .map((p) => ({
          amount:    Number(p.amount),
          notes:     p.notes,
          createdBy: p.createdBy,
        })),
    };
  });

  res.json({ success: true, data: rows });
});

module.exports = { dairyStatement };
