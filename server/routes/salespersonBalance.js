const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

async function buildSalespersonBalance(salespersonId, date) {
  const balanceDate = new Date(date);
  const existing = await prisma.salespersonBalance.findUnique({
    where: { salespersonId_balanceDate: { salespersonId, balanceDate } },
  });
  if (existing) return {
    ...existing,
    openingBalance: Number(existing.openingBalance),
    stockGiven: Number(existing.stockGiven),
    amountPaid: Number(existing.amountPaid),
    closingBalance: Number(existing.closingBalance),
  };

  const prev = await prisma.salespersonBalance.findFirst({
    where: { salespersonId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const dispatchAgg = await prisma.stockDispatch.aggregate({
    where: { salespersonId, dispatchDate: balanceDate },
    _sum: { totalAmount: true },
  });
  const paymentAgg = await prisma.salespersonPayment.aggregate({
    where: { salespersonId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);
  const stockGiven = Number(dispatchAgg._sum.totalAmount ?? 0);
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  return { salespersonId, balanceDate, openingBalance, stockGiven, amountPaid, closingBalance: openingBalance + stockGiven - amountPaid };
}

// GET /salesperson-balance?date=
router.get('/', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const salespeople = await prisma.salesperson.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  const balances = await Promise.all(
    salespeople.map(async (sp) => {
      const bal = await buildSalespersonBalance(sp.id, date);
      return { salespersonId: sp.id, salespersonName: sp.name, route: sp.route, ...bal };
    })
  );
  res.json({ success: true, data: balances });
}));

// GET /salesperson-balance/:id?date=
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);

  const bal = await buildSalespersonBalance(id, date);
  res.json({ success: true, data: { salespersonId: sp.id, salespersonName: sp.name, ...bal } });
}));

module.exports = router;
