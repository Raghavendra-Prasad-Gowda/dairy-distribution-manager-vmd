const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

async function buildSalespersonBalance(salespersonId, date) {
  const balanceDate = new Date(date);
  const existing = await prisma.salespersonBalance.findUnique({
    where: { salespersonId_balanceDate: { salespersonId, balanceDate } },
  });
  if (existing) return {
    ...existing,
    openingBalance: Number(existing.openingBalance),
    stockGiven:     Number(existing.stockGiven),
    amountPaid:     Number(existing.amountPaid),
    closingBalance: Number(existing.closingBalance),
  };

  const [prev, dispatchAgg, paymentAgg] = await Promise.all([
    prisma.salespersonBalance.findFirst({
      where: { salespersonId, balanceDate: { lt: balanceDate } },
      orderBy: { balanceDate: 'desc' },
    }),
    prisma.stockDispatch.aggregate({
      where: { salespersonId, dispatchDate: balanceDate },
      _sum: { totalAmount: true },
    }),
    prisma.salespersonPayment.aggregate({
      where: { salespersonId, paymentDate: balanceDate },
      _sum: { amount: true },
    }),
  ]);

  const openingBalance = Number(prev?.closingBalance ?? 0);
  const stockGiven = Number(dispatchAgg._sum.totalAmount ?? 0);
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  return { salespersonId, balanceDate, openingBalance, stockGiven, amountPaid, closingBalance: openingBalance + stockGiven - amountPaid };
}

// Admin only: get all salespeople balances for a date
const getAll = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') throw new AppError('Admin access required', 403);
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const salespeople = await prisma.salesperson.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
  const balances = await Promise.all(
    salespeople.map(async (sp) => {
      const bal = await buildSalespersonBalance(sp.id, date);
      return { salespersonId: sp.id, salespersonName: sp.name, route: sp.route, ...bal };
    })
  );
  res.json({ success: true, data: balances });
});

// Get balance for a specific salesperson — salesman can only access their own
const getById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  if (req.user.role === 'salesman' && req.user.salespersonId !== id) {
    throw new AppError('Access denied', 403);
  }

  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);

  const bal = await buildSalespersonBalance(id, date);
  res.json({ success: true, data: { salespersonId: sp.id, salespersonName: sp.name, ...bal } });
});

// Get balance history for a specific salesperson (last 30 days)
const getHistory = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');

  if (req.user.role === 'salesman' && req.user.salespersonId !== id) {
    throw new AppError('Access denied', 403);
  }

  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);

  // Fetch last 30 days of balance history
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const balances = await prisma.salespersonBalance.findMany({
    where: {
      salespersonId: id,
      balanceDate: { gte: thirtyDaysAgo },
    },
    orderBy: { balanceDate: 'desc' },
  });

  const formatted = balances.map(b => ({
    balanceDate: b.balanceDate,
    openingBalance: Number(b.openingBalance),
    stockGiven: Number(b.stockGiven),
    amountPaid: Number(b.amountPaid),
    closingBalance: Number(b.closingBalance),
  }));

  res.json({ success: true, data: formatted });
});

module.exports = { getAll, getById, getHistory };
