const prisma = require('../lib/prisma');
const { qualifiesForDeposit, calculateLineDeposit } = require('./depositRules');

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

  const [brand, receipts, categories, paymentAgg, topUpAgg] = await Promise.all([
    tx.brand.findUnique({
      where: { id: brandId },
      select: { depositEnabled: true, depositPerLitre: true },
    }),
    tx.stockReceipt.findMany({
      where: { brandId, receiptDate: balanceDate },
      select: { quantity: true, unitPrice: true, product: { select: { unitType: true, unitSize: true, containerType: true, category: true, depositEnabled: true } } },
    }),
    tx.category.findMany({
      where: { brandId },
      select: { name: true, depositEnabled: true },
    }),
    tx.dairyPayment.aggregate({
      where: { brandId, paymentDate: balanceDate, isTopUp: false },
      _sum: { amount: true },
    }),
    // Top-ups are dues owed to the brand from before the app — they ADD to
    // what the dairy owes, so they are summed separately and added.
    tx.dairyPayment.aggregate({
      where: { brandId, paymentDate: balanceDate, isTopUp: true },
      _sum: { amount: true },
    }),
  ]);

  const stockValue = receipts.reduce(
    (sum, r) => sum + Number(r.quantity) * Number(r.unitPrice),
    0
  );

  const enabledCategories = new Set(
    categories.filter(c => c.depositEnabled).map(c => c.name)
  );

  const depositValue = receipts.reduce((sum, r) => {
    if (!qualifiesForDeposit(r.product, brand, enabledCategories)) return sum;
    return sum + calculateLineDeposit(r.quantity, r.product.unitSize, brand.depositPerLitre);
  }, 0);

  const amountPaid  = Number(paymentAgg._sum.amount ?? 0);
  const topUpAmount = Number(topUpAgg._sum.amount ?? 0);
  const closingBalance = openingBalance + stockValue + depositValue + topUpAmount - amountPaid;

  return tx.dairyBalance.upsert({
    where: { brandId_balanceDate: { brandId, balanceDate } },
    update: { openingBalance, stockValue, depositValue, topUpAmount, amountPaid, closingBalance },
    create: { brandId, balanceDate, openingBalance, stockValue, depositValue, topUpAmount, amountPaid, closingBalance },
  });
}

/**
 * Computes and upserts SalespersonBalance for a single date.
 * Accepts an optional transaction client (tx).
 */
async function _calcSalespersonBalance(salespersonId, balanceDate, tx = prisma) {
  const [prev, dispatchAgg, paymentAgg, topUpAgg] = await Promise.all([
    tx.salespersonBalance.findFirst({
      where: { salespersonId, balanceDate: { lt: balanceDate } },
      orderBy: { balanceDate: 'desc' },
    }),
    tx.stockDispatch.aggregate({
      where: { salespersonId, dispatchDate: balanceDate },
      _sum: { totalAmount: true },
    }),
    tx.salespersonPayment.aggregate({
      where: { salespersonId, paymentDate: balanceDate, isTopUp: false },
      _sum: { amount: true },
    }),
    // Top-ups are pre-existing dues loaded by an admin — they ADD to what the
    // salesman owes, so they are summed separately and added, not subtracted.
    tx.salespersonPayment.aggregate({
      where: { salespersonId, paymentDate: balanceDate, isTopUp: true },
      _sum: { amount: true },
    }),
  ]);

  const openingBalance = Number(prev?.closingBalance ?? 0);
  const stockGiven     = Number(dispatchAgg._sum.totalAmount ?? 0);
  const amountPaid     = Number(paymentAgg._sum.amount ?? 0);
  const topUpAmount    = Number(topUpAgg._sum.amount ?? 0);
  const closingBalance = openingBalance + stockGiven + topUpAmount - amountPaid;

  return tx.salespersonBalance.upsert({
    where: { salespersonId_balanceDate: { salespersonId, balanceDate } },
    update: { openingBalance, stockGiven, topUpAmount, amountPaid, closingBalance },
    create: { salespersonId, balanceDate, openingBalance, stockGiven, topUpAmount, amountPaid, closingBalance },
  });
}

// ─── Cascade helper ───────────────────────────────────────────────────────────

async function _cascadeDairy(brandId, balanceDate, tx) {
  await _calcDairyBalance(brandId, balanceDate, tx);
  const subsequent = await tx.dairyBalance.findMany({
    where: { brandId, balanceDate: { gt: balanceDate } },
    orderBy: { balanceDate: 'asc' },
    select: { balanceDate: true },
  });
  for (const row of subsequent) {
    await _calcDairyBalance(brandId, row.balanceDate, tx);
  }
}

async function _cascadeSalesperson(salespersonId, balanceDate, tx) {
  await _calcSalespersonBalance(salespersonId, balanceDate, tx);
  const subsequent = await tx.salespersonBalance.findMany({
    where: { salespersonId, balanceDate: { gt: balanceDate } },
    orderBy: { balanceDate: 'asc' },
    select: { balanceDate: true },
  });
  for (const row of subsequent) {
    await _calcSalespersonBalance(salespersonId, row.balanceDate, tx);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Recalculate DairyBalance for brand+date, cascading forward.
 *
 * Accepts an optional `tx` so callers can roll the cascade into their own
 * transaction. If omitted, runs in its own serializable transaction.
 *
 * Formula: closing = opening + stockValue + depositValue + topUpAmount − amountPaid
 */
async function recalculateDairyBalance(brandId, date, tx = null) {
  const balanceDate = new Date(date);
  if (tx) {
    await _cascadeDairy(brandId, balanceDate, tx);
  } else {
    await prisma.$transaction(
      (innerTx) => _cascadeDairy(brandId, balanceDate, innerTx),
      { isolationLevel: 'Serializable' }
    );
  }
}

/**
 * Recalculate SalespersonBalance for salesperson+date, cascading forward.
 *
 * Accepts an optional `tx` so callers can roll the cascade into their own
 * transaction. If omitted, runs in its own serializable transaction.
 *
 * Formula: closing = opening + stockGiven + topUpAmount − amountPaid
 */
async function recalculateSalespersonBalance(salespersonId, date, tx = null) {
  const balanceDate = new Date(date);
  if (tx) {
    await _cascadeSalesperson(salespersonId, balanceDate, tx);
  } else {
    await prisma.$transaction(
      (innerTx) => _cascadeSalesperson(salespersonId, balanceDate, innerTx),
      { isolationLevel: 'Serializable' }
    );
  }
}

module.exports = { recalculateDairyBalance, recalculateSalespersonBalance };
