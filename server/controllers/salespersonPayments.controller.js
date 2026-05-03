const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateSalespersonBalance } = require('../services/balanceService');
const logger = require('../config/logger');

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createSalespersonPayment, req, res);
  if (!data) return;

  const payment = await prisma.salespersonPayment.create({
    data: { ...data, paymentDate: new Date(data.paymentDate) },
  });
  await recalculateSalespersonBalance(data.salespersonId, data.paymentDate);
  logger.info('Salesperson payment created', { id: payment.id, salespersonId: data.salespersonId, amount: data.amount, date: data.paymentDate });
  res.status(201).json({ success: true, data: payment });
});

const getAll = asyncHandler(async (req, res) => {
  const { salespersonId, from, to } = req.query;
  const where = {};
  if (salespersonId) where.salespersonId = parseId(salespersonId, 'Salesperson ID');
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

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Payment ID');
  const data = validate(schemas.updateSalespersonPayment, req, res);
  if (!data) return;

  const existing = await prisma.salespersonPayment.findUnique({ where: { id } });
  if (!existing) throw new AppError('Payment not found', 404);

  const updated = await prisma.salespersonPayment.update({
    where: { id },
    data: { ...data, paymentDate: new Date(data.paymentDate) },
  });

  const oldDate = existing.paymentDate.toISOString().slice(0, 10);
  const newDate = data.paymentDate;
  await recalculateSalespersonBalance(existing.salespersonId, oldDate);
  if (newDate !== oldDate) await recalculateSalespersonBalance(existing.salespersonId, newDate);
  logger.info('Salesperson payment updated', { id, salespersonId: existing.salespersonId, amount: data.amount, date: newDate });
  res.json({ success: true, data: updated });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Payment ID');
  const payment = await prisma.salespersonPayment.findUnique({ where: { id } });
  if (!payment) throw new AppError('Payment not found', 404);

  await prisma.salespersonPayment.delete({ where: { id } });
  const dateStr = payment.paymentDate.toISOString().slice(0, 10);
  await recalculateSalespersonBalance(payment.salespersonId, dateStr);
  logger.info('Salesperson payment deleted', { id, salespersonId: payment.salespersonId, amount: Number(payment.amount), date: dateStr });
  res.json({ success: true, data: { message: 'Payment deleted' } });
});

module.exports = { create, getAll, update, remove };
