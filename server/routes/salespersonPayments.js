const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { recalculateSalespersonBalance } = require('../services/balanceService');

const router = express.Router();

// POST /salesperson-payments
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createSalespersonPayment, req, res);
  if (!data) return;

  const payment = await prisma.salespersonPayment.create({
    data: { ...data, paymentDate: new Date(data.paymentDate) },
  });
  await recalculateSalespersonBalance(data.salespersonId, data.paymentDate);
  res.status(201).json({ success: true, data: payment });
}));

// GET /salesperson-payments?salespersonId=&from=&to=
router.get('/', asyncHandler(async (req, res) => {
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
}));

// DELETE /salesperson-payments/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Payment ID');
  const payment = await prisma.salespersonPayment.findUnique({ where: { id } });
  if (!payment) throw new AppError('Payment not found', 404);

  await prisma.salespersonPayment.delete({ where: { id } });
  const dateStr = payment.paymentDate.toISOString().slice(0, 10);
  await recalculateSalespersonBalance(payment.salespersonId, dateStr);

  res.json({ success: true, data: { message: 'Payment deleted' } });
}));

module.exports = router;
