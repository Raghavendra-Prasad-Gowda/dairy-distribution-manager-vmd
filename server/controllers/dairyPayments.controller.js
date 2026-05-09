const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateDairyBalance } = require('../services/balanceService');
const logger = require('../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createDairyPayment, req, res);
  if (!data) return;

  const payment = await prisma.dairyPayment.create({
    data: { ...data, paymentDate: new Date(data.paymentDate) },
  });
  await recalculateDairyBalance(data.brandId, data.paymentDate);
  logger.info('Dairy payment created', { id: payment.id, brandId: data.brandId, amount: data.amount, date: data.paymentDate });
  void notifySlack(SLACK_EVENTS.DAIRY_PAYMENT_RECORDED, {
    brandId:     data.brandId,
    date:        data.paymentDate,
    amount:      data.amount,
    paymentMode: data.paymentMode,
    reference:   data.reference,
  });
  res.status(201).json({ success: true, data: payment });
});

const getAll = asyncHandler(async (req, res) => {
  const { brandId, from, to } = req.query;
  const where = {};
  if (brandId) where.brandId = parseId(brandId, 'Brand ID');
  if (from || to) {
    where.paymentDate = {};
    if (from) where.paymentDate.gte = new Date(from);
    if (to)   where.paymentDate.lte = new Date(to);
  }
  const payments = await prisma.dairyPayment.findMany({
    where,
    include: { brand: { select: { id: true, name: true } } },
    orderBy: { paymentDate: 'desc' },
  });
  res.json({ success: true, data: payments });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Payment ID');
  const data = validate(schemas.updateDairyPayment, req, res);
  if (!data) return;

  const existing = await prisma.dairyPayment.findUnique({ where: { id } });
  if (!existing) throw new AppError('Payment not found', 404);

  const updated = await prisma.dairyPayment.update({
    where: { id },
    data: { ...data, paymentDate: new Date(data.paymentDate) },
  });

  const oldDate = existing.paymentDate.toISOString().slice(0, 10);
  const newDate = data.paymentDate;
  await recalculateDairyBalance(existing.brandId, oldDate);
  if (newDate !== oldDate) await recalculateDairyBalance(existing.brandId, newDate);
  logger.info('Dairy payment updated', { id, brandId: existing.brandId, amount: data.amount, date: newDate });
  void notifySlack(SLACK_EVENTS.DAIRY_PAYMENT_UPDATED, {
    brandId:     existing.brandId,
    date:        newDate,
    amount:      data.amount,
    paymentMode: data.paymentMode,
    reference:   data.reference,
  });
  res.json({ success: true, data: updated });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Payment ID');
  const payment = await prisma.dairyPayment.findUnique({ where: { id } });
  if (!payment) throw new AppError('Payment not found', 404);

  await prisma.dairyPayment.delete({ where: { id } });
  const dateStr = payment.paymentDate.toISOString().slice(0, 10);
  await recalculateDairyBalance(payment.brandId, dateStr);
  logger.info('Dairy payment deleted', { id, brandId: payment.brandId, amount: Number(payment.amount), date: dateStr });
  void notifySlack(SLACK_EVENTS.DAIRY_PAYMENT_DELETED, {
    brandId: payment.brandId,
    date:    dateStr,
    amount:  Number(payment.amount),
  });
  res.json({ success: true, data: { message: 'Payment deleted' } });
});

module.exports = { create, getAll, update, remove };
