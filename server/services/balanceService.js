const prisma = require('../lib/prisma');

/**
 * Recalculate and upsert DairyBalance for a given brand + date.
 * Called after every stock receipt save, dairy payment save/delete.
 *
 * Formula: closing = opening + stockValue − amountPaid
 * Opening = previous day's closing balance (most recent entry before this date).
 */
async function recalculateDairyBalance(brandId, date) {
  const balanceDate = new Date(date);

  // Get previous closing balance
  const prev = await prisma.dairyBalance.findFirst({
    where: { brandId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);

  // Sum stock receipts for this date
  const receipts = await prisma.stockReceipt.findMany({
    where: { brandId, receiptDate: balanceDate },
    select: { quantity: true, unitPrice: true },
  });
  const stockValue = receipts.reduce(
    (sum, r) => sum + Number(r.quantity) * Number(r.unitPrice),
    0
  );

  // Sum all payments for this date
  const paymentAgg = await prisma.dairyPayment.aggregate({
    where: { brandId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);

  const closingBalance = openingBalance + stockValue - amountPaid;

  return prisma.dairyBalance.upsert({
    where: { brandId_balanceDate: { brandId, balanceDate } },
    update: { stockValue, amountPaid, closingBalance },
    create: { brandId, balanceDate, openingBalance, stockValue, amountPaid, closingBalance },
  });
}

/**
 * Recalculate and upsert SalespersonBalance for a given salesperson + date.
 * Called after every dispatch save/delete, salesperson payment save/delete.
 *
 * Formula: closing = opening + stockGiven − amountPaid
 */
async function recalculateSalespersonBalance(salespersonId, date) {
  const balanceDate = new Date(date);

  // Get previous closing balance
  const prev = await prisma.salespersonBalance.findFirst({
    where: { salespersonId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);

  // Sum dispatch totalAmount for this date
  const dispatchAgg = await prisma.stockDispatch.aggregate({
    where: { salespersonId, dispatchDate: balanceDate },
    _sum: { totalAmount: true },
  });
  const stockGiven = Number(dispatchAgg._sum.totalAmount ?? 0);

  // Sum payments for this date
  const paymentAgg = await prisma.salespersonPayment.aggregate({
    where: { salespersonId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);

  const closingBalance = openingBalance + stockGiven - amountPaid;

  return prisma.salespersonBalance.upsert({
    where: { salespersonId_balanceDate: { salespersonId, balanceDate } },
    update: { stockGiven, amountPaid, closingBalance },
    create: { salespersonId, balanceDate, openingBalance, stockGiven, amountPaid, closingBalance },
  });
}

module.exports = { recalculateDairyBalance, recalculateSalespersonBalance };
