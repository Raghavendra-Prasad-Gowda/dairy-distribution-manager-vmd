const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { parseId } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /reports/dairy-statement?brandId=&from=&to=
router.get('/dairy-statement', asyncHandler(async (req, res) => {
  const { brandId, from, to } = req.query;
  if (!brandId || !from || !to) throw new AppError('brandId, from, and to are required', 400);

  const balances = await prisma.dairyBalance.findMany({
    where: {
      brandId: parseInt(brandId, 10),
      balanceDate: { gte: new Date(from), lte: new Date(to) },
    },
    include: { brand: { select: { name: true } } },
    orderBy: { balanceDate: 'asc' },
  });

  // For each balance row, attach product receipts (expandable detail)
  const rows = await Promise.all(
    balances.map(async (b) => {
      const receipts = await prisma.stockReceipt.findMany({
        where: { brandId: b.brandId, receiptDate: b.balanceDate },
        include: { product: { select: { name: true } } },
        orderBy: { productId: 'asc' },
      });
      const payments = await prisma.dairyPayment.findMany({
        where: { brandId: b.brandId, paymentDate: b.balanceDate },
        orderBy: { createdAt: 'asc' },
      });
      return {
        date:           b.balanceDate,
        openingBalance: Number(b.openingBalance),
        stockValue:     Number(b.stockValue),
        amountPaid:     Number(b.amountPaid),
        closingBalance: Number(b.closingBalance),
        receipts:       receipts.map((r) => ({
          productName: r.product.name,
          quantity:    Number(r.quantity),
          unitPrice:   Number(r.unitPrice),
          amount:      Number(r.quantity) * Number(r.unitPrice),
        })),
        payments: payments.map((p) => ({
          amount: Number(p.amount),
          mode:   p.paymentMode,
          ref:    p.reference,
        })),
      };
    })
  );

  res.json({ success: true, data: rows });
}));

// GET /reports/salesperson-statement?salespersonId=&from=&to=
router.get('/salesperson-statement', asyncHandler(async (req, res) => {
  const { salespersonId, from, to } = req.query;
  if (!salespersonId || !from || !to) throw new AppError('salespersonId, from, and to are required', 400);

  const spId = parseInt(salespersonId, 10);
  const balances = await prisma.salespersonBalance.findMany({
    where: {
      salespersonId: spId,
      balanceDate: { gte: new Date(from), lte: new Date(to) },
    },
    orderBy: { balanceDate: 'asc' },
  });

  const rows = await Promise.all(
    balances.map(async (b) => {
      const dispatch = await prisma.stockDispatch.findUnique({
        where: { salespersonId_dispatchDate: { salespersonId: spId, dispatchDate: b.balanceDate } },
        include: {
          items: {
            include: {
              product: {
                include: { brand: { select: { name: true } } },
              },
            },
          },
        },
      });
      const payments = await prisma.salespersonPayment.findMany({
        where: { salespersonId: spId, paymentDate: b.balanceDate },
      });
      return {
        date:           b.balanceDate,
        openingBalance: Number(b.openingBalance),
        stockGiven:     Number(b.stockGiven),
        amountPaid:     Number(b.amountPaid),
        closingBalance: Number(b.closingBalance),
        items:          dispatch?.items.map((i) => ({
          brandName:   i.product.brand.name,
          productName: i.product.name,
          quantity:    Number(i.quantity),
          unitPrice:   Number(i.unitPrice),
          totalAmount: Number(i.totalAmount),
        })) ?? [],
        payments: payments.map((p) => ({
          amount: Number(p.amount),
          mode:   p.paymentMode,
          ref:    p.reference,
        })),
      };
    })
  );
  res.json({ success: true, data: rows });
}));

// GET /reports/stock-summary?date=
router.get('/stock-summary', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required', 400);

  const receiptDate = new Date(date);

  const [receipts, dispatches] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: { receiptDate },
      include: {
        product: { select: { name: true } },
        brand:   { select: { name: true } },
      },
      orderBy: [{ brandId: 'asc' }, { productId: 'asc' }],
    }),
    prisma.stockDispatch.findMany({
      where: { dispatchDate: receiptDate },
      include: {
        salesperson: { select: { name: true } },
        items: {
          include: {
            product: {
              include: { brand: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      date,
      receipts: receipts.map((r) => ({
        brandName:   r.brand.name,
        productName: r.product.name,
        quantity:    Number(r.quantity),
        unitPrice:   Number(r.unitPrice),
        amount:      Number(r.quantity) * Number(r.unitPrice),
      })),
      dispatches: dispatches.map((d) => ({
        salespersonName: d.salesperson.name,
        totalAmount:     Number(d.totalAmount),
        items:           d.items.map((i) => ({
          brandName:   i.product.brand.name,
          productName: i.product.name,
          quantity:    Number(i.quantity),
          unitPrice:   Number(i.unitPrice),
          totalAmount: Number(i.totalAmount),
        })),
      })),
    },
  });
}));

// GET /reports/outstanding — current closing balance for all brands + salespeople
router.get('/outstanding', asyncHandler(async (req, res) => {
  const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
  const salespeople = await prisma.salesperson.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  const dairyOutstanding = await Promise.all(
    brands.map(async (b) => {
      const latest = await prisma.dairyBalance.findFirst({
        where: { brandId: b.id },
        orderBy: { balanceDate: 'desc' },
      });
      return { brandId: b.id, brandName: b.name, outstanding: Number(latest?.closingBalance ?? 0) };
    })
  );

  const salespersonOutstanding = await Promise.all(
    salespeople.map(async (sp) => {
      const latest = await prisma.salespersonBalance.findFirst({
        where: { salespersonId: sp.id },
        orderBy: { balanceDate: 'desc' },
      });
      return { salespersonId: sp.id, salespersonName: sp.name, outstanding: Number(latest?.closingBalance ?? 0) };
    })
  );

  res.json({ success: true, data: { dairy: dairyOutstanding, salespeople: salespersonOutstanding } });
}));

module.exports = router;
