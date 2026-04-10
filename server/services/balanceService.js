const prisma = require('../lib/prisma');

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Computes and upserts DairyBalance for a single date.
 * Always re-derives openingBalance from the previous day's closingBalance
 * so that retroactive edits cascade correctly.
 */
async function _calcDairyBalance(brandId, balanceDate) {
  const prev = await prisma.dairyBalance.findFirst({
    where: { brandId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);

  const receipts = await prisma.stockReceipt.findMany({
    where: { brandId, receiptDate: balanceDate },
    select: { quantity: true, unitPrice: true },
  });
  const stockValue = receipts.reduce(
    (sum, r) => sum + Number(r.quantity) * Number(r.unitPrice),
    0
  );

  const paymentAgg = await prisma.dairyPayment.aggregate({
    where: { brandId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  const closingBalance = openingBalance + stockValue - amountPaid;

  return prisma.dairyBalance.upsert({
    where: { brandId_balanceDate: { brandId, balanceDate } },
    // Include openingBalance in update so retroactive changes propagate correctly
    update: { openingBalance, stockValue, amountPaid, closingBalance },
    create: { brandId, balanceDate, openingBalance, stockValue, amountPaid, closingBalance },
  });
}

/**
 * Computes and upserts SalespersonBalance for a single date.
 */
async function _calcSalespersonBalance(salespersonId, balanceDate) {
  const prev = await prisma.salespersonBalance.findFirst({
    where: { salespersonId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);

  const dispatchAgg = await prisma.stockDispatch.aggregate({
    where: { salespersonId, dispatchDate: balanceDate },
    _sum: { totalAmount: true },
  });
  const stockGiven = Number(dispatchAgg._sum.totalAmount ?? 0);

  const paymentAgg = await prisma.salespersonPayment.aggregate({
    where: { salespersonId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  const closingBalance = openingBalance + stockGiven - amountPaid;

  return prisma.salespersonBalance.upsert({
    where: { salespersonId_balanceDate: { salespersonId, balanceDate } },
    update: { openingBalance, stockGiven, amountPaid, closingBalance },
    create: { salespersonId, balanceDate, openingBalance, stockGiven, amountPaid, closingBalance },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Recalculate and upsert DairyBalance for a given brand + date, then cascade
 * forward to all subsequent stored balance records so that retroactive stock
 * receipt or payment changes propagate through the full history.
 *
 * Formula: closing = opening + stockValue − amountPaid
 * Opening = previous day's closing balance (most recent entry before this date).
 */
async function recalculateDairyBalance(brandId, date) {
  const balanceDate = new Date(date);
  await _calcDairyBalance(brandId, balanceDate);

  // Cascade: recalculate all subsequent dates that already have stored records
  const subsequent = await prisma.dairyBalance.findMany({
    where: { brandId, balanceDate: { gt: balanceDate } },
    orderBy: { balanceDate: 'asc' },
    select: { balanceDate: true },
  });
  for (const row of subsequent) {
    await _calcDairyBalance(brandId, row.balanceDate);
  }
}

/**
 * Recalculate and upsert SalespersonBalance for a given salesperson + date,
 * then cascade forward to all subsequent stored balance records.
 *
 * Formula: closing = opening + stockGiven − amountPaid
 */
async function recalculateSalespersonBalance(salespersonId, date) {
  const balanceDate = new Date(date);
  await _calcSalespersonBalance(salespersonId, balanceDate);

  const subsequent = await prisma.salespersonBalance.findMany({
    where: { salespersonId, balanceDate: { gt: balanceDate } },
    orderBy: { balanceDate: 'asc' },
    select: { balanceDate: true },
  });
  for (const row of subsequent) {
    await _calcSalespersonBalance(salespersonId, row.balanceDate);
  }
}

module.exports = { recalculateDairyBalance, recalculateSalespersonBalance };
