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

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.dairyPayment.create({
      data: { ...data, paymentDate: new Date(data.paymentDate) },
    });
    await recalculateDairyBalance(data.brandId, data.paymentDate, tx);
    return created;
  }, { isolationLevel: 'Serializable' });
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

// Superadmin only — bulk "top-up": loads dues already owed to each brand so
// they carry forward as that brand's opening balance. A top-up ADDS to what
// the dairy owes (unlike a payment, which reduces it) — see balanceService.
const bulkTopUp = asyncHandler(async (req, res) => {
  if (req.user.role !== 'superadmin') throw new AppError('Super admin access required', 403);

  const data = validate(schemas.bulkDairyTopUp, req, res);
  if (!data) return;

  const ids = data.entries.map(e => e.brandId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError('Each brand can only appear once', 400);
  }

  const found = await prisma.brand.findMany({
    where:  { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    const missing = ids.filter(id => !found.some(b => b.id === id));
    throw new AppError(`Brand not found: ${missing.join(', ')}`, 404);
  }

  const admin = await prisma.adminUser.findUnique({
    where:  { id: req.user.adminUserId },
    select: { username: true },
  });
  const createdBy = admin?.username ?? 'admin';

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const entry of data.entries) {
      rows.push(await tx.dairyPayment.create({
        data: {
          brandId:     entry.brandId,
          paymentDate: new Date(data.paymentDate),
          amount:      entry.amount,
          paymentMode: 'Top-up',
          notes:       data.notes ?? null,
          isTopUp:     true,
          createdBy,
        },
      }));
      await recalculateDairyBalance(entry.brandId, data.paymentDate, tx);
    }
    return rows;
  }, { isolationLevel: 'Serializable' });

  const total = data.entries.reduce((s, e) => s + e.amount, 0);
  logger.info('Dairy bulk top-up recorded', {
    count: created.length, total, date: data.paymentDate, createdBy,
  });
  void notifySlack(SLACK_EVENTS.DAIRY_PAYMENT_RECORDED, {
    date:   data.paymentDate,
    amount: total,
    note:   `Bulk top-up for ${created.length} brand(s) by ${createdBy}`,
  });

  res.status(201).json({
    success: true,
    data: { count: created.length, total, createdBy, payments: created },
  });
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

  const oldDate = existing.paymentDate.toISOString().slice(0, 10);
  const newDate = data.paymentDate;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.dairyPayment.update({
      where: { id },
      data: { ...data, paymentDate: new Date(data.paymentDate) },
    });
    // Cascade the older date first; if the date changed, the new date too.
    const earliest = oldDate < newDate ? oldDate : newDate;
    await recalculateDairyBalance(existing.brandId, earliest, tx);
    if (newDate !== oldDate) {
      const later = oldDate < newDate ? newDate : oldDate;
      await recalculateDairyBalance(existing.brandId, later, tx);
    }
    return u;
  }, { isolationLevel: 'Serializable' });
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

  const dateStr = payment.paymentDate.toISOString().slice(0, 10);
  await prisma.$transaction(async (tx) => {
    await tx.dairyPayment.delete({ where: { id } });
    await recalculateDairyBalance(payment.brandId, dateStr, tx);
  }, { isolationLevel: 'Serializable' });
  logger.info('Dairy payment deleted', { id, brandId: payment.brandId, amount: Number(payment.amount), date: dateStr });
  void notifySlack(SLACK_EVENTS.DAIRY_PAYMENT_DELETED, {
    brandId: payment.brandId,
    date:    dateStr,
    amount:  Number(payment.amount),
  });
  res.json({ success: true, data: { message: 'Payment deleted' } });
});

module.exports = { create, bulkTopUp, getAll, update, remove };
