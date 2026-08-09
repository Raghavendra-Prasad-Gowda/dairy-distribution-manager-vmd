'use strict';

const asyncHandler = require('../middleware/asyncHandler');
const AppError     = require('../utils/AppError');
const prisma       = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

/**
 * GET /api/v1/salesperson-statement/me?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Self-service statement: an authenticated salesman sees only their own
 * account statement (balance rows + dispatch items + payments).
 * Admin users are blocked — they must use /reports/salesperson-statement.
 */
const myStatement = asyncHandler(async (req, res) => {
  if (req.user.role !== 'salesman') {
    throw new AppError('This endpoint is for salespeople only', 403);
  }

  const spId = req.user.salespersonId;
  if (!spId) throw new AppError('Salesperson account not linked to this user', 400);

  const { from, to } = req.query;
  if (!from || !to) throw new AppError('from and to query params are required', 400);

  const fromDate = new Date(from);
  const toDate   = new Date(to);

  const [balances, allDispatches, allPayments] = await Promise.all([
    prisma.salespersonBalance.findMany({
      where:   { salespersonId: spId, balanceDate: { gte: fromDate, lte: toDate } },
      orderBy: { balanceDate: 'asc' },
    }),
    prisma.stockDispatch.findMany({
      where:   { salespersonId: spId, dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        items: {
          include: {
            product: {
              select: {
                name:              true,
                unitType:          true,
                unitSize:          true,
                unitsPerContainer: true,
                brand:             { select: { name: true } },
              },
            },
          },
        },
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
    const key      = b.balanceDate.toISOString();
    const dispatch = dispatchByDate.get(key);
    return {
      date:           b.balanceDate,
      openingBalance: Number(b.openingBalance),
      stockGiven:     Number(b.stockGiven),
      amountPaid:     Number(b.amountPaid),
      closingBalance: Number(b.closingBalance),
      items: dispatch?.items.map((i) => ({
        brandName:         i.product.brand.name,
        productName:       i.product.name,
        quantity:          Number(i.quantity),
        unitPrice:         Number(i.unitPrice),
        totalAmount:       Number(i.totalAmount),
        unitType:          i.product.unitType,
        unitSize:          i.product.unitSize != null ? Number(i.product.unitSize) : null,
        unitsPerContainer: i.product.unitsPerContainer,
      })) ?? [],
      // Top-ups are admin-loaded pre-existing dues — they add to what the
      // salesman owes, so they are kept out of "payments made" and surfaced
      // separately (with the admin who recorded them).
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

  // This handler already 403s for anyone but a salesman above, and is called
  // from exactly one place client-side (MyStatement.jsx) — safe to notify
  // unconditionally, no extra role gate needed.
  void notifySlack(SLACK_EVENTS.SALESPERSON_STATEMENT_VIEWED, { salespersonId: spId, from, to });

  res.json({ success: true, data: rows });
});

module.exports = { myStatement };
