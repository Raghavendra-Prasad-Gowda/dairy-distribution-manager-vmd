const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateSalespersonBalance } = require('../services/balanceService');
const logger = require('../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { assertAdmin } = require('../utils/authz');

// Admin only — records payment received from salesperson
const create = asyncHandler(async (req, res) => {
  assertAdmin(req);

  const data = validate(schemas.createSalespersonPayment, req, res);
  if (!data) return;

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.salespersonPayment.create({
      data: { ...data, paymentDate: new Date(data.paymentDate) },
    });
    await recalculateSalespersonBalance(data.salespersonId, data.paymentDate, tx);
    return created;
  }, { isolationLevel: 'Serializable' });
  logger.info('Salesperson payment created', { id: payment.id, salespersonId: data.salespersonId, amount: data.amount, date: data.paymentDate });
  void notifySlack(SLACK_EVENTS.SALESPERSON_PAYMENT_RECORDED, {
    salespersonId: data.salespersonId,
    date:          data.paymentDate,
    amount:        data.amount,
    paymentMode:   data.paymentMode,
    reference:     data.reference,
  });
  res.status(201).json({ success: true, data: payment });
});

// Admin (or superadmin) — bulk "top-up": loads each salesman's pre-existing
// dues so they carry forward as opening balance. A top-up ADDS to what the
// salesman owes (unlike a normal payment, which reduces it) — see
// balanceService. Unlike the dairy/deposit top-ups and ledger reset (which
// stay superadmin-only), a plain admin can run this one.
const bulkTopUp = asyncHandler(async (req, res) => {
  // Route already gates this with requireAdmin; repeated here so the guard
  // survives the handler being remounted somewhere less strict.
  assertAdmin(req);

  const data = validate(schemas.bulkSalespersonTopUp, req, res);
  if (!data) return;

  const ids = data.entries.map(e => e.salespersonId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError('Each salesperson can only appear once', 400);
  }

  const found = await prisma.salesperson.findMany({
    where:  { id: { in: ids } },
    select: { id: true, name: true },
  });
  if (found.length !== ids.length) {
    const missing = ids.filter(id => !found.some(s => s.id === id));
    throw new AppError(`Salesperson not found: ${missing.join(', ')}`, 404);
  }

  // Stamped on every row so the salesman can see who loaded the amount.
  const admin = await prisma.adminUser.findUnique({
    where:  { id: req.user.adminUserId },
    select: { username: true },
  });
  const createdBy = admin?.username ?? 'admin';

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const entry of data.entries) {
      rows.push(await tx.salespersonPayment.create({
        data: {
          salespersonId: entry.salespersonId,
          paymentDate:   new Date(data.paymentDate),
          amount:        entry.amount,
          paymentMode:   'Top-up',
          notes:         data.notes ?? null,
          isTopUp:       true,
          createdBy,
        },
      }));
      await recalculateSalespersonBalance(entry.salespersonId, data.paymentDate, tx);
    }
    return rows;
  }, { isolationLevel: 'Serializable' });

  const total = data.entries.reduce((s, e) => s + e.amount, 0);
  logger.info('Salesperson bulk top-up recorded', {
    count: created.length, total, date: data.paymentDate, createdBy,
  });
  void notifySlack(SLACK_EVENTS.SALESPERSON_TOPUP_RECORDED, {
    date:              data.paymentDate,
    count:             created.length,
    total,
    createdBy,
    notes:             data.notes,
    salespersonNames:  found.map(s => s.name),
  });

  res.status(201).json({
    success: true,
    data: { count: created.length, total, createdBy, payments: created },
  });
});

// Salesman sees only their own payments; admin sees all; dispatcher blocked
const getAll = asyncHandler(async (req, res) => {
  if (req.user.role === 'dispatcher') throw new AppError('Access denied.', 403);

  const { salespersonId, from, to } = req.query;
  const where = {};

  if (req.user.role === 'salesman') {
    where.salespersonId = req.user.salespersonId;
  } else if (salespersonId) {
    where.salespersonId = parseId(salespersonId, 'Salesperson ID');
  }

  if (from || to) {
    where.paymentDate = {};
    if (from) where.paymentDate.gte = new Date(from);
    if (to)   where.paymentDate.lte = new Date(to);
  }

  const payments = await prisma.salespersonPayment.findMany({
    where,
    include: { salesperson: { select: { id: true, name: true } } },
    orderBy: { paymentDate: 'desc' },
  });
  res.json({ success: true, data: payments });
});

// Admin only
const update = asyncHandler(async (req, res) => {
  assertAdmin(req);

  const id = parseId(req.params.id, 'Payment ID');
  const data = validate(schemas.updateSalespersonPayment, req, res);
  if (!data) return;

  const existing = await prisma.salespersonPayment.findUnique({ where: { id } });
  if (!existing) throw new AppError('Payment not found', 404);

  const oldDate = existing.paymentDate.toISOString().slice(0, 10);
  const newDate = data.paymentDate;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.salespersonPayment.update({
      where: { id },
      data: { ...data, paymentDate: new Date(data.paymentDate) },
    });
    const earliest = oldDate < newDate ? oldDate : newDate;
    await recalculateSalespersonBalance(existing.salespersonId, earliest, tx);
    if (newDate !== oldDate) {
      const later = oldDate < newDate ? newDate : oldDate;
      await recalculateSalespersonBalance(existing.salespersonId, later, tx);
    }
    return u;
  }, { isolationLevel: 'Serializable' });
  logger.info('Salesperson payment updated', { id, salespersonId: existing.salespersonId, amount: data.amount, date: newDate });
  void notifySlack(SLACK_EVENTS.SALESPERSON_PAYMENT_UPDATED, {
    salespersonId: existing.salespersonId,
    date:          newDate,
    amount:        data.amount,
    paymentMode:   data.paymentMode,
    reference:     data.reference,
  });
  res.json({ success: true, data: updated });
});

// Admin only
const remove = asyncHandler(async (req, res) => {
  assertAdmin(req);

  const id = parseId(req.params.id, 'Payment ID');
  const payment = await prisma.salespersonPayment.findUnique({ where: { id } });
  if (!payment) throw new AppError('Payment not found', 404);

  const dateStr = payment.paymentDate.toISOString().slice(0, 10);
  await prisma.$transaction(async (tx) => {
    await tx.salespersonPayment.delete({ where: { id } });
    await recalculateSalespersonBalance(payment.salespersonId, dateStr, tx);
  }, { isolationLevel: 'Serializable' });
  logger.info('Salesperson payment deleted', { id, salespersonId: payment.salespersonId, amount: Number(payment.amount), date: dateStr });
  void notifySlack(SLACK_EVENTS.SALESPERSON_PAYMENT_DELETED, {
    salespersonId: payment.salespersonId,
    date:          dateStr,
    amount:        Number(payment.amount),
  });
  res.json({ success: true, data: { message: 'Payment deleted' } });
});

module.exports = { create, bulkTopUp, getAll, update, remove };
