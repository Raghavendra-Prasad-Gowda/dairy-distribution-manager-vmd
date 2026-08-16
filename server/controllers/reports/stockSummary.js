'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const { parseId } = require('../../utils/validate');
const AppError = require('../../utils/AppError');
const prisma = require('../../lib/prisma');
const { buildCategoryOrderMap, getCategoryOrder } = require('../../utils/productLayout');
const { assertAdmin } = require('./_shared');

const stockSummary = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const { from, to, brandId, date, routeId } = req.query;

  // Support legacy single-date param
  const fromStr = from ?? date;
  const toStr   = to   ?? date;
  if (!fromStr) throw new AppError('from (or date) query param is required', 400);

  const fromDate    = new Date(fromStr);
  const toDate      = new Date(toStr);
  const brandFilter = brandId ? parseId(brandId, 'Brand ID') : null;
  const routeFilter = routeId != null && routeId !== '' ? parseId(routeId, 'Route ID') : null;

  const [receipts, dispatches, allRoutes, allCategories] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: {
        receiptDate: { gte: fromDate, lte: toDate },
        ...(brandFilter ? { brandId: brandFilter } : {}),
        ...(routeFilter !== null ? { routeId: routeFilter } : {}),
      },
      include: {
        product: { select: { name: true, category: true, unitsPerContainer: true, costPrice: true, displayOrder: true, unitSize: true, unitType: true, containerType: true } },
        brand:   { select: { name: true, displayOrder: true } },
      },
      orderBy: [{ receiptDate: 'asc' }, { brandId: 'asc' }, { routeId: 'asc' }, { productId: 'asc' }],
    }),
    prisma.stockDispatch.findMany({
      where: { dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        salesperson: { select: { name: true } },
        items: {
          where: brandFilter ? { product: { brandId: brandFilter } } : {},
          include: { product: { include: { brand: { select: { name: true } } } } },
        },
      },
      orderBy: [{ dispatchDate: 'asc' }, { salesperson: { name: 'asc' } }],
    }),
    prisma.route.findMany({ select: { id: true, routeNumber: true } }),
    prisma.category.findMany({
      where: brandFilter ? { brandId: brandFilter } : {},
      select: { brandId: true, name: true, displayOrder: true },
    }),
  ]);
  const routeMap   = new Map(allRoutes.map(r => [r.id, r.routeNumber]));
  const catOrderMap = buildCategoryOrderMap(allCategories);

  // Build date-keyed map
  const dateMap = new Map();
  const ensureDay = (key) => {
    if (!dateMap.has(key)) dateMap.set(key, { date: key, receipts: [], dispatches: [] });
    return dateMap.get(key);
  };

  for (const r of receipts) {
    const key = r.receiptDate.toISOString().slice(0, 10);
    ensureDay(key).receipts.push({
      brandName:            r.brand.name,
      brandDisplayOrder:    r.brand.displayOrder ?? 0,
      productName:          r.product.name,
      category:             r.product.category ?? null,
      categoryDisplayOrder: getCategoryOrder(catOrderMap, r.brandId, r.product.category),
      quantity:             Number(r.quantity),
      unitPrice:            Number(r.unitPrice),
      amount:               Number(r.quantity) * Number(r.unitPrice),
      routeNumber:          r.routeId !== 0 ? (routeMap.get(r.routeId) ?? null) : null,
      unitsPerContainer:    r.product.unitsPerContainer ?? null,
      containerType:        r.product.containerType ?? null,
      unitSize:             r.product.unitType === 'ml'   ? (r.product.unitSize ?? null) : null,
      unitSizeGrams:        r.product.unitType === 'gram' ? (r.product.unitSize ?? null) : null,
      costPrice:            Number(r.product.costPrice ?? 0),
      displayOrder:         r.product.displayOrder ?? 0,
    });
  }

  const filteredDispatches = brandFilter
    ? dispatches.filter(d => d.items.length > 0)
    : dispatches;

  for (const d of filteredDispatches) {
    const key = d.dispatchDate.toISOString().slice(0, 10);
    ensureDay(key).dispatches.push({
      salespersonName: d.salesperson.name,
      totalAmount:     d.items.reduce((s, i) => s + Number(i.totalAmount), 0),
      items: d.items.map((i) => ({
        brandName:   i.product.brand.name,
        productName: i.product.name,
        quantity:    Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
        totalAmount: Number(i.totalAmount),
      })),
    });
  }

  const rows = [...dateMap.keys()].sort().map(key => {
    const day = dateMap.get(key);
    return {
      ...day,
      totalReceived:   day.receipts.reduce((s, r) => s + r.amount, 0),
      totalDispatched: day.dispatches.reduce((s, d) => s + d.totalAmount, 0),
    };
  });

  res.json({
    success: true,
    data: {
      from: fromStr,
      to:   toStr,
      grandTotalReceived:   rows.reduce((s, r) => s + r.totalReceived,   0),
      grandTotalDispatched: rows.reduce((s, r) => s + r.totalDispatched, 0),
      rows,
    },
  });
});

module.exports = { stockSummary };
