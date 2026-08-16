'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { parseId } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { buildCategoryOrderMap, getCategoryOrder } = require('../../utils/productLayout');
const { assertAdmin } = require('./_shared');

const salespersonStatement = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { salespersonId, from, to } = req.query;
  if (!salespersonId || !from || !to) throw new AppError('salespersonId, from, and to are required', 400);

  const spId = parseId(salespersonId, 'Salesperson ID');
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const [balances, allDispatches, allPayments, allCategories] = await Promise.all([
    prisma.salespersonBalance.findMany({
      where: { salespersonId: spId, balanceDate: { gte: fromDate, lte: toDate } },
      orderBy: { balanceDate: 'asc' },
    }),
    prisma.stockDispatch.findMany({
      where: { salespersonId: spId, dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        items: {
          include: {
            // Include brand.displayOrder so items can be sorted by the dairy layout
            // order (brand → category → product displayOrder → name).
            product: { include: { brand: { select: { name: true, displayOrder: true } } } },
          },
        },
      },
    }),
    prisma.salespersonPayment.findMany({
      where: { salespersonId: spId, paymentDate: { gte: fromDate, lte: toDate } },
    }),
    // Category display orders for the item sort — category is a string column on
    // product (not a relation), so ordering must be done in JS after the query.
    prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
  ]);

  const catOrder = buildCategoryOrderMap(allCategories);

  const dispatchByDate = new Map(allDispatches.map(d => [d.dispatchDate.toISOString(), d]));
  const paymentsByDate = new Map();
  for (const p of allPayments) {
    const key = p.paymentDate.toISOString();
    if (!paymentsByDate.has(key)) paymentsByDate.set(key, []);
    paymentsByDate.get(key).push(p);
  }

  const rows = balances.map((b) => {
    const key = b.balanceDate.toISOString();
    const dispatch = dispatchByDate.get(key);

    // Sort items by dairy layout order: brand → category → product displayOrder → name.
    const sortedItems = [...(dispatch?.items ?? [])].sort((a, b) =>
      (a.product.brand?.displayOrder ?? 999) - (b.product.brand?.displayOrder ?? 999) ||
      getCategoryOrder(catOrder, a.product.brandId, a.product.category) -
        getCategoryOrder(catOrder, b.product.brandId, b.product.category) ||
      (a.product.displayOrder ?? 999) - (b.product.displayOrder ?? 999) ||
      a.product.name.localeCompare(b.product.name)
    );

    return {
      date:           b.balanceDate,
      openingBalance: Number(b.openingBalance),
      stockGiven:     Number(b.stockGiven),
      amountPaid:     Number(b.amountPaid),
      closingBalance: Number(b.closingBalance),
      items: sortedItems.map((i) => ({
        brandName:   i.product.brand.name,
        productName: i.product.name,
        quantity:    Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
        totalAmount: Number(i.totalAmount),
      })),
      payments: (paymentsByDate.get(key) ?? []).map((p) => ({
        amount: Number(p.amount),
        mode:   p.paymentMode,
        ref:    p.reference,
      })),
    };
  });

  res.json({ success: true, data: rows });
});

module.exports = { salespersonStatement };
