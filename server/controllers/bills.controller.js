'use strict';

const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { buildBillLines } = require('../utils/billFormat');
const { getActingUsername } = require('../utils/actor');
const { buildCategoryOrderMap, getCategoryOrder } = require('../utils/productLayout');

// When the bill register is empty, the first bill continues from the paper
// pad's last number instead of restarting at 1 — the dairy's books are one
// continuous series, so a fresh install must not re-issue numbers already
// handed out. Set via the app_settings key below; absent means start at 1.
const BILL_START_KEY = 'bill_number_start';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a required YYYY-MM-DD query param into a Date, or 400s. */
function parseDateParam(value, label) {
  if (!value || !DATE_ONLY.test(value)) throw new AppError(`${label} must be YYYY-MM-DD`, 400);
  return new Date(value);
}

/**
 * Loads every dispatch line supplied to a salesperson in [from, to] and folds
 * it into a Brand → Product breakdown.
 *
 * Reads dispatches (stock handed to the salesperson), not payments: the bill
 * states what was supplied over the period, which is what the pad's Total
 * column has always meant. Collections against it live in the statement.
 *
 * category.findMany + the catOrder Map is the canonical pattern (CLAUDE.md
 * §9) for sorting by category display order — Product.category is a plain
 * string, not a relation, so Prisma can't ORDER BY it directly. The bill
 * doesn't show a category row, but still sorts products by it internally
 * (via billFormat.js) so, say, milk still clusters ahead of curd.
 */
async function computeBill(salespersonId, fromDate, toDate) {
  const [dispatches, categories] = await Promise.all([
    prisma.stockDispatch.findMany({
      where: { salespersonId, dispatchDate: { gte: fromDate, lte: toDate } },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true, category: true, displayOrder: true, unitType: true, unitSize: true, brandId: true,
                brand: { select: { name: true, displayOrder: true } },
              },
            },
          },
        },
      },
    }),
    prisma.category.findMany({ select: { brandId: true, name: true, displayOrder: true } }),
  ]);

  const catOrder = buildCategoryOrderMap(categories);

  const items = dispatches.flatMap((d) =>
    d.items.map((i) => ({
      brandName:            i.product.brand.name,
      brandDisplayOrder:    i.product.brand.displayOrder ?? 999,
      // Sort key only — the bill lists Brand → Product, no category row.
      categoryDisplayOrder: getCategoryOrder(catOrder, i.product.brandId, i.product.category),
      productName:          i.product.name,
      displayOrder:         i.product.displayOrder ?? 999,
      quantity:             Number(i.quantity),
      totalAmount:          Number(i.totalAmount),
      unitType:             i.product.unitType,
      unitSize:             i.product.unitSize != null ? Number(i.product.unitSize) : null,
    }))
  );

  return buildBillLines(items);
}

/** Serializes a Bill row for the API (Decimal → Number, Date → YYYY-MM-DD). */
function toResponse(bill) {
  return {
    id:            bill.id,
    billNumber:    bill.billNumber,
    poNumber:      bill.poNumber,
    partyName:     bill.partyName,
    salespersonId: bill.salespersonId,
    salespersonName: bill.salesperson?.name ?? null,
    fromDate:      bill.fromDate.toISOString().slice(0, 10),
    toDate:        bill.toDate.toISOString().slice(0, 10),
    totalAmount:   Number(bill.totalAmount),
    lines:         bill.lines,
    createdBy:     bill.createdBy,
    createdAt:     bill.createdAt,
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /bills — the bill register, newest first. */
const getAll = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.salespersonId) where.salespersonId = parseId(req.query.salespersonId, 'Salesperson ID');

  const bills = await prisma.bill.findMany({
    where,
    include: { salesperson: { select: { name: true } } },
    orderBy: { billNumber: 'desc' },
    take: 100,
  });
  res.json({ success: true, data: bills.map(toResponse) });
});

/**
 * GET /bills/preview — the Brand → Product breakdown for a
 * period, computed but NOT saved. Backs the "check before you issue it"
 * preview; issuing recomputes server-side so a tampered preview can never
 * become a stored bill.
 */
const preview = asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.query.salespersonId, 'Salesperson ID');
  const fromDate = parseDateParam(req.query.from, 'from');
  const toDate   = parseDateParam(req.query.to, 'to');
  if (fromDate > toDate) throw new AppError('from date must not be after to date', 400);

  const salesperson = await prisma.salesperson.findUnique({ where: { id: salespersonId } });
  if (!salesperson) throw new AppError('Salesperson not found', 404);

  // buildBillLines returns { brands, totalAmount } — the API's own `lines`
  // field name stays put (the frontend already reads bill.lines), it now
  // just carries the brands array instead of the old six fixed rows.
  const { brands: lines, totalAmount } = await computeBill(salespersonId, fromDate, toDate);
  res.json({
    success: true,
    data: {
      salespersonId,
      salespersonName: salesperson.name,
      from: req.query.from,
      to:   req.query.to,
      lines,
      totalAmount,
    },
  });
});

/** GET /bills/:id — one issued bill, for reprinting. */
const getOne = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Bill ID');
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { salesperson: { select: { name: true } } },
  });
  if (!bill) throw new AppError('Bill not found', 404);
  res.json({ success: true, data: toResponse(bill) });
});

/**
 * POST /bills — issues a bill: recomputes the rows, allocates the next number
 * and freezes the result.
 *
 * Number allocation and insert share one serializable transaction so two
 * admins issuing at the same instant can't be handed the same bill number;
 * the unique index on bill_number is the backstop if they somehow are.
 */
const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createBill, req, res);
  if (!data) return;

  const fromDate = new Date(data.from);
  const toDate   = new Date(data.to);
  if (fromDate > toDate) throw new AppError('from date must not be after to date', 400);

  const salesperson = await prisma.salesperson.findUnique({ where: { id: data.salespersonId } });
  if (!salesperson) throw new AppError('Salesperson not found', 404);

  const { brands: lines, totalAmount } = await computeBill(data.salespersonId, fromDate, toDate);
  if (totalAmount === 0) {
    throw new AppError('No stock was dispatched in this period — there is nothing to bill', 400);
  }

  const createdBy = await getActingUsername(req);

  const bill = await prisma.$transaction(async (tx) => {
    const last = await tx.bill.findFirst({ orderBy: { billNumber: 'desc' }, select: { billNumber: true } });
    let billNumber;
    if (last) {
      billNumber = last.billNumber + 1;
    } else {
      const startSetting = await tx.appSettings.findUnique({ where: { key: BILL_START_KEY } });
      const start = Number(startSetting?.value);
      billNumber = Number.isInteger(start) && start > 0 ? start : 1;
    }

    return tx.bill.create({
      data: {
        billNumber,
        poNumber:      data.poNumber ?? null,
        // M/s defaults to the salesperson the bill is for — the pad's M/s line
        // is usually just their name, but a firm name can be typed instead.
        partyName:     data.partyName?.trim() || salesperson.name,
        salespersonId: data.salespersonId,
        fromDate,
        toDate,
        totalAmount,
        lines,
        createdBy,
      },
      include: { salesperson: { select: { name: true } } },
    });
  }, { isolationLevel: 'Serializable' });

  void notifySlack(SLACK_EVENTS.BILL_GENERATED, {
    billNumber:    bill.billNumber,
    salespersonId: bill.salespersonId,
    partyName:     bill.partyName,
    from:          data.from,
    to:            data.to,
    totalAmount:   Number(bill.totalAmount),
    createdBy,
  });

  res.status(201).json({ success: true, data: toResponse(bill) });
});

/** DELETE /bills/:id — cancels a bill issued in error. */
const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Bill ID');
  const bill = await prisma.bill.findUnique({ where: { id } });
  if (!bill) throw new AppError('Bill not found', 404);

  await prisma.bill.delete({ where: { id } });

  void notifySlack(SLACK_EVENTS.BILL_DELETED, {
    billNumber:    bill.billNumber,
    salespersonId: bill.salespersonId,
    partyName:     bill.partyName,
    totalAmount:   Number(bill.totalAmount),
    deletedBy:     await getActingUsername(req),
  });

  res.json({ success: true, data: { message: 'Bill deleted' } });
});

module.exports = { getAll, preview, getOne, create, remove };
