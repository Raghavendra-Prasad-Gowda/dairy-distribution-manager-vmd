const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { validateDispatchStock } = require('../services/stockGuard');
const { recalculateSalespersonBalance } = require('../services/balanceService');

const router = express.Router();

// GET /dispatches?date=&salespersonId=
router.get('/', asyncHandler(async (req, res) => {
  const { date, salespersonId } = req.query;
  const where = {};
  if (date) where.dispatchDate = new Date(date);
  if (salespersonId) where.salespersonId = parseInt(salespersonId, 10);

  const dispatches = await prisma.stockDispatch.findMany({
    where,
    include: {
      salesperson: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            include: { brand: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { dispatchDate: 'desc' },
  });
  res.json({ success: true, data: dispatches });
}));

// GET /dispatches/summary?date=
router.get('/summary', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const dispatches = await prisma.stockDispatch.findMany({
    where: { dispatchDate: new Date(date) },
    include: {
      salesperson: { select: { id: true, name: true, route: true } },
      items: {
        include: {
          product: { include: { brand: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { salesperson: { name: 'asc' } },
  });
  res.json({ success: true, data: dispatches });
}));

// POST /dispatches — create or update dispatch
router.post('/', asyncHandler(async (req, res) => {
  const data = validate(schemas.createDispatch, req, res);
  if (!data) return;

  const dispatchDate = new Date(data.dispatchDate);

  // Check if updating an existing dispatch
  const existing = await prisma.stockDispatch.findUnique({
    where: {
      salespersonId_dispatchDate: {
        salespersonId: data.salespersonId,
        dispatchDate,
      },
    },
  });

  // Stock guard check
  const guardErrors = await validateDispatchStock(
    data.items,
    data.dispatchDate,
    existing?.id ?? null
  );

  if (guardErrors.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Insufficient stock for ${guardErrors[0].productName}. Requested: ${guardErrors[0].requested}, Available: ${guardErrors[0].available}`,
      code: 'STOCK_INSUFFICIENT',
      details: guardErrors,
    });
  }

  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  let dispatch;
  if (existing) {
    // Update: delete old items, reinsert
    await prisma.$transaction([
      prisma.stockDispatchItem.deleteMany({ where: { dispatchId: existing.id } }),
      prisma.stockDispatch.update({
        where: { id: existing.id },
        data: { totalAmount, notes: data.notes ?? null },
      }),
    ]);
    // Insert new items
    await prisma.stockDispatchItem.createMany({
      data: data.items.map((item) => ({
        dispatchId:  existing.id,
        productId:   item.productId,
        quantity:    item.quantity,
        unitPrice:   item.unitPrice,
        totalAmount: item.quantity * item.unitPrice,
      })),
    });
    dispatch = await prisma.stockDispatch.findUnique({
      where: { id: existing.id },
      include: { items: true },
    });
  } else {
    // Create new dispatch with items
    dispatch = await prisma.stockDispatch.create({
      data: {
        salespersonId: data.salespersonId,
        dispatchDate,
        totalAmount,
        notes: data.notes ?? null,
        items: {
          create: data.items.map((item) => ({
            productId:   item.productId,
            quantity:    item.quantity,
            unitPrice:   item.unitPrice,
            totalAmount: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  // Recalculate salesperson balance
  await recalculateSalespersonBalance(data.salespersonId, data.dispatchDate);

  res.status(existing ? 200 : 201).json({ success: true, data: dispatch });
}));

// DELETE /dispatches/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Dispatch ID');
  const dispatch = await prisma.stockDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new AppError('Dispatch not found', 404);

  await prisma.stockDispatch.delete({ where: { id } });

  const dateStr = dispatch.dispatchDate.toISOString().slice(0, 10);
  await recalculateSalespersonBalance(dispatch.salespersonId, dateStr);

  res.json({ success: true, data: { message: 'Dispatch deleted' } });
}));

module.exports = router;
