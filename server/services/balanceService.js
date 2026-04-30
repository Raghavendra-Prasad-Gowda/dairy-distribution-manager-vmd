const prisma = require('../lib/prisma');

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Computes and upserts DairyBalance for a single date.
 * Accepts an optional transaction client (tx) so it can run inside a
 * serializable transaction when cascading multiple dates.
 */
async function _calcDairyBalance(brandId, balanceDate, tx = prisma) {
  const prev = await tx.dairyBalance.findFirst({
    where: { brandId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);

  const receipts = await tx.stockReceipt.findMany({
    where: { brandId, receiptDate: balanceDate },
    select: { quantity: true, unitPrice: true },
  });
  const stockValue = receipts.reduce(
    (sum, r) => sum + Number(r.quantity) * Number(r.unitPrice),
    0
  );

  const paymentAgg = await tx.dairyPayment.aggregate({
    where: { brandId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  const closingBalance = openingBalance + stockValue - amountPaid;

  return tx.dairyBalance.upsert({
    where: { brandId_balanceDate: { brandId, balanceDate } },
    update: { openingBalance, stockValue, amountPaid, closingBalance },
    create: { brandId, balanceDate, openingBalance, stockValue, amountPaid, closingBalance },
  });
}

/**
 * Computes and upserts SalespersonBalance for a single date.
 * Accepts an optional transaction client (tx).
 */
async function _calcSalespersonBalance(salespersonId, balanceDate, tx = prisma) {
  const prev = await tx.salespersonBalance.findFirst({
    where: { salespersonId, balanceDate: { lt: balanceDate } },
    orderBy: { balanceDate: 'desc' },
  });
  const openingBalance = Number(prev?.closingBalance ?? 0);

  const dispatchAgg = await tx.stockDispatch.aggregate({
    where: { salespersonId, dispatchDate: balanceDate },
    _sum: { totalAmount: true },
  });
  const stockGiven = Number(dispatchAgg._sum.totalAmount ?? 0);

  const paymentAgg = await tx.salespersonPayment.aggregate({
    where: { salespersonId, paymentDate: balanceDate },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentAgg._sum.amount ?? 0);
  const closingBalance = openingBalance + stockGiven - amountPaid;

  return tx.salespersonBalance.upsert({
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
 * Runs in a serializable transaction so concurrent saves on overlapping date
 * ranges don't produce write-skew in the cascade.
 *
 * Formula: closing = opening + stockValue − amountPaid
 */
async function recalculateDairyBalance(brandId, date) {
  const balanceDate = new Date(date);
  await prisma.$transaction(async (tx) => {
    await _calcDairyBalance(brandId, balanceDate, tx);

    const subsequent = await tx.dairyBalance.findMany({
      where: { brandId, balanceDate: { gt: balanceDate } },
      orderBy: { balanceDate: 'asc' },
      select: { balanceDate: true },
    });
    for (const row of subsequent) {
      await _calcDairyBalance(brandId, row.balanceDate, tx);
    }
  }, { isolationLevel: 'Serializable' });
}

/**
 * Recalculate and upsert SalespersonBalance for a given salesperson + date,
 * then cascade forward to all subsequent stored balance records.
 *
 * Runs in a serializable transaction.
 *
 * Formula: closing = opening + stockGiven − amountPaid
 */
async function recalculateSalespersonBalance(salespersonId, date) {
  const balanceDate = new Date(date);
  await prisma.$transaction(async (tx) => {
    await _calcSalespersonBalance(salespersonId, balanceDate, tx);

    const subsequent = await tx.salespersonBalance.findMany({
      where: { salespersonId, balanceDate: { gt: balanceDate } },
      orderBy: { balanceDate: 'asc' },
      select: { balanceDate: true },
    });
    for (const row of subsequent) {
      await _calcSalespersonBalance(salespersonId, row.balanceDate, tx);
    }
  }, { isolationLevel: 'Serializable' });
}

module.exports = { recalculateDairyBalance, recalculateSalespersonBalance };
