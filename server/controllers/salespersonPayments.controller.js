const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateSalespersonBalance } = require('../services/balanceService');
const logger = require('../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

// Admin only — records payment received from salesperson
const create = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

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

// Salesman sees only their own payments; admin sees all
const getAll = asyncHandler(async (req, res) => {
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
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

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
  if (req.user.role !== 'admin') throw new AppError('Admin access required', 403);

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

module.exports = { create, getAll, update, remove };
