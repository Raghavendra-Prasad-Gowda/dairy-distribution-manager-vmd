'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { parseId } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { qualifiesForDeposit, calculateLineDeposit } = require('../../services/depositRules');
const { assertAdmin, round2, round3 } = require('./_shared');

const depositSummary = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { brandId, from, to } = req.query;
  if (!brandId || !from || !to) throw new AppError('brandId, from, and to are required', 400);

  const id = parseId(brandId, 'Brand ID');
  const fromDate = new Date(from);
  const toDate   = new Date(to);

  const [brand, categories, receipts, topUps, priorTopUpAgg] = await Promise.all([
    prisma.brand.findUnique({
      where:  { id },
      select: { name: true, depositEnabled: true, depositPerLitre: true },
    }),
    prisma.category.findMany({
      where:  { brandId: id },
      select: { name: true, depositEnabled: true, displayOrder: true },
    }),
    prisma.stockReceipt.findMany({
      where:   { brandId: id, receiptDate: { gte: fromDate, lte: toDate } },
      include: { product: { select: { name: true, category: true, unitType: true, unitSize: true, containerType: true, depositEnabled: true, displayOrder: true } } },
      orderBy: { receiptDate: 'asc' },
    }),
    // Manual deposit top-ups (DairyDepositTopUp) — a standalone ledger, never
    // a DairyPayment. Merged into the same rows below so the report reads as
    // one continuous deposit ledger instead of two disconnected numbers.
    prisma.dairyDepositTopUp.findMany({
      where:   { brandId: id, topUpDate: { gte: fromDate, lte: toDate } },
      orderBy: { topUpDate: 'asc' },
    }),
    // A top-up represents a deposit balance from before the app — it must
    // count toward the running total even when `from` is set after it was
    // recorded. (Receipt-based accrual needs no such carry-forward: it's
    // fully re-derivable for any range just by widening `from`.)
    prisma.dairyDepositTopUp.aggregate({
      where: { brandId: id, topUpDate: { lt: fromDate } },
      _sum:  { amount: true },
    }),
  ]);

  if (!brand) throw new AppError('Brand not found', 404);

  const depositPerLitre   = Number(brand.depositPerLitre ?? 0);
  const enabledCategories = new Set(categories.filter(c => c.depositEnabled).map(c => c.name));
  const categoryOrderMap  = new Map(categories.map(c => [c.name, c.displayOrder ?? 0]));

  const openingDeposit = Number(priorTopUpAgg?._sum?.amount ?? 0);

  // Group by date — receipts first, then merge in top-ups for the same dates
  // (or new date entries if a top-up landed on a day with no receipts).
  const byDate = new Map();
  for (const r of receipts) {
    const key = r.receiptDate.toISOString();
    if (!byDate.has(key)) byDate.set(key, { date: r.receiptDate, items: [], topUps: [] });
    byDate.get(key).items.push(r);
  }
  for (const t of (topUps ?? [])) {
    const key = t.topUpDate.toISOString();
    if (!byDate.has(key)) byDate.set(key, { date: t.topUpDate, items: [], topUps: [] });
    byDate.get(key).topUps.push(t);
  }
  const sortedDates = [...byDate.values()].sort((a, b) => a.date - b.date);

  let runningTotal = openingDeposit;
  const rows = [];

  for (const { date, items, topUps: dayTopUps } of sortedDates) {
    const depositItems = [];
    let dailyDeposit;

    for (const r of items) {
      const { name, category, unitType, unitSize, displayOrder } = r.product;
      if (!qualifiesForDeposit(r.product, brand, enabledCategories)) continue;

      const qty            = Number(r.quantity);
      const volumeOrWeight = qty * (Number(unitSize) / 1000);
      const depositAmount  = calculateLineDeposit(qty, unitSize, depositPerLitre);

      // Accumulate per product (multiple routes → single line). Keep full
      // precision during accumulation — round only at the response boundary.
      const existing = depositItems.find(i => i.productName === name);
      if (existing) {
        existing.quantity       += qty;
        existing.volumeOrWeight += volumeOrWeight;
        existing.depositAmount  += depositAmount;
      } else {
        depositItems.push({
          productName:          name,
          category:             category ?? 'Other',
          categoryDisplayOrder: categoryOrderMap.get(category ?? '') ?? 9999,
          productDisplayOrder:  displayOrder ?? 0,
          unitType,
          quantity:             qty,
          unitSize:             Number(unitSize),
          volumeOrWeight,
          depositPerLitre,
          depositAmount,
        });
      }
    }

    depositItems.sort((a, b) =>
      a.categoryDisplayOrder !== b.categoryDisplayOrder
        ? a.categoryDisplayOrder - b.categoryDisplayOrder
        : a.productDisplayOrder - b.productDisplayOrder
    );

    dailyDeposit = depositItems.reduce((s, i) => s + i.depositAmount, 0);

    // Manual top-ups render as their own line items — no qty/volume, just an
    // amount and who/why — appended after the day's regular receipt items.
    const topUpItems = dayTopUps.map(t => ({
      id:                   t.id,
      isTopUp:              true,
      productName:          'Manual Deposit Top-up',
      category:             'Top-up',
      categoryDisplayOrder: -1,
      productDisplayOrder:  0,
      depositAmount:        Number(t.amount),
      notes:                t.notes,
      createdBy:            t.createdBy,
    }));
    dailyDeposit += topUpItems.reduce((s, t) => s + t.depositAmount, 0);

    runningTotal += dailyDeposit;
    rows.push({
      date,
      dailyDeposit:  round2(dailyDeposit),
      runningTotal:  round2(runningTotal),
      items: [
        ...topUpItems.map(t => ({ ...t, depositAmount: round2(t.depositAmount) })),
        ...depositItems.map(i => ({
          ...i,
          volumeOrWeight: round3(i.volumeOrWeight),
          depositAmount:  round2(i.depositAmount),
        })),
      ],
    });
  }

  res.json({
    success: true,
    data: {
      brandName:      brand.name,
      depositEnabled: brand.depositEnabled,
      depositPerLitre,
      from,
      to,
      openingDeposit: round2(openingDeposit),
      totalDeposit:   round2(runningTotal),
      rows,
    },
  });
});

module.exports = { depositSummary };
