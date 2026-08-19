const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { validateBulkEntities } = require('../services/paymentLedger');
const { getActingUsername } = require('../utils/actor');
const logger = require('../config/logger');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { assertRole } = require('../utils/authz');

// Deliberately its own table/endpoint, not a DairyPayment. A deposit top-up
// loads a crate/container deposit already held with a brand from before the
// app — it feeds only the Deposit report's running total and must never
// touch DairyBalance/topUpAmount (money owed for stock), which is a
// completely separate concern. See balanceService.js — it never reads this
// table, so nothing here can accidentally affect the dairy statement.

// Superadmin only — bulk-loads an existing deposit balance for several
// brands at once. Only brands with depositEnabled make sense here; the
// client filters its picker accordingly, but this is enforced server-side
// too since nothing stops a direct API call otherwise.
const bulkCreate = asyncHandler(async (req, res) => {
  assertRole(req, 'superadmin');

  const data = validate(schemas.bulkDairyDepositTopUp, req, res);
  if (!data) return;

  const ids = data.entries.map(e => e.brandId);
  const found = await validateBulkEntities({
    ids,
    findMany: (args) => prisma.brand.findMany(args),
    label: 'brand',
    select: { id: true, name: true, depositEnabled: true },
  });
  const notEnabled = found.filter(b => !b.depositEnabled);
  if (notEnabled.length) {
    throw new AppError(`Deposit is not enabled for: ${notEnabled.map(b => b.name).join(', ')}`, 400);
  }

  const createdBy = await getActingUsername(req);

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const entry of data.entries) {
      rows.push(await tx.dairyDepositTopUp.create({
        data: {
          brandId:   entry.brandId,
          topUpDate: new Date(data.topUpDate),
          amount:    entry.amount,
          notes:     data.notes ?? null,
          createdBy,
        },
      }));
    }
    return rows;
  });

  const total = data.entries.reduce((s, e) => s + e.amount, 0);
  logger.info('Dairy deposit top-up recorded', {
    count: created.length, total, date: data.topUpDate, createdBy,
  });
  void notifySlack(SLACK_EVENTS.DAIRY_DEPOSIT_TOPUP_RECORDED, {
    date:       data.topUpDate,
    count:      created.length,
    total,
    createdBy,
    notes:      data.notes,
    brandNames: found.map(b => b.name),
  });

  res.status(201).json({
    success: true,
    data: { count: created.length, total, createdBy, topUps: created },
  });
});

// Superadmin only — corrects a mistaken entry. No update endpoint: delete
// and re-add, matching the "one-time setup / occasional correction" nature
// of this ledger rather than the frequent-edit needs of a real payment.
const remove = asyncHandler(async (req, res) => {
  assertRole(req, 'superadmin');

  const id = parseId(req.params.id, 'Deposit Top-up ID');
  const existing = await prisma.dairyDepositTopUp.findUnique({ where: { id } });
  if (!existing) throw new AppError('Deposit top-up not found', 404);

  await prisma.dairyDepositTopUp.delete({ where: { id } });
  logger.info('Dairy deposit top-up deleted', { id, brandId: existing.brandId, amount: Number(existing.amount) });
  res.json({ success: true, data: { message: 'Deposit top-up deleted' } });
});

module.exports = { bulkCreate, remove };
