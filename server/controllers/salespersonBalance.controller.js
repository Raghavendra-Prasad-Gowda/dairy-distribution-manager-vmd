const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { computeSalespersonBalance } = require('../services/balanceService');

/**
 * Returns the SalespersonBalance snapshot for a salesperson+date. Uses the
 * persisted row when one exists; otherwise computes it on the fly via
 * balanceService — the SINGLE source of truth — so the fallback matches the
 * cascade exactly (top-ups ADD, and only real payments subtract).
 */
async function buildSalespersonBalance(salespersonId, date) {
  const balanceDate = new Date(date);
  const existing = await prisma.salespersonBalance.findUnique({
    where: { salespersonId_balanceDate: { salespersonId, balanceDate } },
  });
  if (existing) return {
    ...existing,
    openingBalance: Number(existing.openingBalance),
    stockGiven:     Number(existing.stockGiven),
    topUpAmount:    Number(existing.topUpAmount ?? 0),
    amountPaid:     Number(existing.amountPaid),
    closingBalance: Number(existing.closingBalance),
  };

  return computeSalespersonBalance(salespersonId, date);
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

  if (req.user.role === 'dispatcher') throw new AppError('Access denied.', 403);
  if (req.user.role === 'salesman' && req.user.salespersonId !== id) {
    throw new AppError('Access denied', 403);
  }

  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);

  const bal = await buildSalespersonBalance(id, date);
  res.json({ success: true, data: { salespersonId: sp.id, salespersonName: sp.name, ...bal } });
});

// Get balance history for a specific salesperson with pagination and date range filtering
const getHistory = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const { page = '1', limit = '20', from, to } = req.query;

  if (req.user.role === 'dispatcher') throw new AppError('Access denied.', 403);
  if (req.user.role === 'salesman' && req.user.salespersonId !== id) {
    throw new AppError('Access denied', 403);
  }

  const sp = await prisma.salesperson.findUnique({ where: { id } });
  if (!sp) throw new AppError('Salesperson not found', 404);

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Build date filter
  const where = { salespersonId: id };
  if (from || to) {
    where.balanceDate = {};
    if (from) where.balanceDate.gte = new Date(from);
    if (to) where.balanceDate.lte = new Date(to);
  } else {
    // Default: last 90 days if no range specified
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    where.balanceDate = { gte: ninetyDaysAgo };
  }

  // Fetch paginated results and total count
  const [balances, total] = await Promise.all([
    prisma.salespersonBalance.findMany({
      where,
      orderBy: { balanceDate: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.salespersonBalance.count({ where }),
  ]);

  // Attach the admin-recorded top-ups behind each date, so the salesman can see
  // who loaded a pre-existing due rather than just an unexplained balance jump.
  const hasTopUps = balances.some(b => Number(b.topUpAmount ?? 0) !== 0);
  const topUps = hasTopUps
    ? (await prisma.salespersonPayment.findMany({
        where: {
          salespersonId: id,
          isTopUp:       true,
          paymentDate:   { in: balances.map(b => b.balanceDate) },
        },
        select: { paymentDate: true, amount: true, notes: true, createdBy: true },
      })) ?? []
    : [];

  const topUpsByDate = new Map();
  for (const t of topUps) {
    const key = t.paymentDate.toISOString();
    if (!topUpsByDate.has(key)) topUpsByDate.set(key, []);
    topUpsByDate.get(key).push({
      amount:    Number(t.amount),
      notes:     t.notes,
      createdBy: t.createdBy,
    });
  }

  const formatted = balances.map(b => ({
    balanceDate: b.balanceDate,
    openingBalance: Number(b.openingBalance),
    stockGiven: Number(b.stockGiven),
    topUpAmount: Number(b.topUpAmount ?? 0),
    amountPaid: Number(b.amountPaid),
    closingBalance: Number(b.closingBalance),
    topUps: topUpsByDate.get(b.balanceDate.toISOString()) ?? [],
  }));

  // This endpoint is only ever called from the salesman's own "My Balance"
  // page (StockEntry.jsx and the admin Collections page both use the plain
  // getById balance lookup instead) — gated on role for symmetry with the
  // access check above, even though nothing else reaches this handler.
  if (req.user.role === 'salesman') {
    void notifySlack(SLACK_EVENTS.SALESPERSON_BALANCE_VIEWED, { salespersonId: id, from, to });
  }

  res.json({
    success: true,
    data: {
      items: formatted,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasMore: pageNum < Math.ceil(total / limitNum),
      },
    },
  });
});

module.exports = { getAll, getById, getHistory };
