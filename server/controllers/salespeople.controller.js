const bcrypt = require('bcrypt');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { BCRYPT_ROUNDS } = require('../utils/constants');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const logger = require('../config/logger');

const SP_SELECT = { id: true, name: true, phone: true, route: true, username: true, isActive: true, displayOrder: true, createdAt: true };
const SP_ORDER  = [{ displayOrder: 'asc' }, { name: 'asc' }];

const getAll = asyncHandler(async (req, res) => {
  const where = req.query.all === 'true' ? {} : { isActive: true };
  const salespeople = await prisma.salesperson.findMany({ where, orderBy: SP_ORDER, select: SP_SELECT });
  res.json({ success: true, data: salespeople });
});

const getById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const sp = await prisma.salesperson.findUnique({ where: { id }, select: SP_SELECT });
  if (!sp) throw new AppError('Salesperson not found', 404);
  res.json({ success: true, data: sp });
});

const reorder = asyncHandler(async (req, res) => {
  const items = validate(schemas.reorderSalespeople, req, res);
  if (!items) return;
  await prisma.$transaction(
    items.map(({ id, displayOrder }) =>
      prisma.salesperson.update({ where: { id }, data: { displayOrder } })
    )
  );
  res.json({ success: true, data: { message: `${items.length} salespeople reordered` } });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createSalesperson, req, res);
  if (!data) return;

  const { password, ...rest } = data;

  if (rest.username && !password) throw new AppError('Password is required when setting a username', 400);
  if (password && !rest.username) throw new AppError('Username is required when setting a password', 400);

  if (rest.username) {
    // Login matches usernames case-insensitively, so "John" and "john"
    // must not both be allowed to exist among salespeople.
    const existing = await prisma.salesperson.findFirst({
      where: { username: { equals: rest.username, mode: 'insensitive' } },
    });
    if (existing) throw new AppError('Username is already taken', 409);
  }

  const spData = { ...rest };
  if (rest.username && password) {
    spData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  const sp = await prisma.salesperson.create({ data: spData, select: SP_SELECT });
  void notifySlack(SLACK_EVENTS.SALESPERSON_CREATED, { name: sp.name, phone: sp.phone, route: sp.route });
  res.status(201).json({ success: true, data: sp });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.updateSalesperson, req, res);
  if (!data) return;

  const { password, ...rest } = data;

  if (rest.username) {
    const existing = await prisma.salesperson.findFirst({
      where: { username: { equals: rest.username, mode: 'insensitive' }, id: { not: id } },
    });
    if (existing) throw new AppError('Username is already taken', 409);
  }

  const updateData = { ...rest };
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }
  if (rest.username === null) {
    updateData.username = null;
    updateData.passwordHash = null;
  }

  const sp = await prisma.salesperson.update({ where: { id }, data: updateData, select: SP_SELECT });
  void notifySlack(SLACK_EVENTS.SALESPERSON_UPDATED, { name: sp.name, phone: sp.phone, route: sp.route, isActive: sp.isActive });
  res.json({ success: true, data: sp });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');

  const [dispatchCount, balanceCount, paymentCount] = await Promise.all([
    prisma.stockDispatch.count({ where: { salespersonId: id } }),
    prisma.salespersonBalance.count({ where: { salespersonId: id } }),
    prisma.salespersonPayment.count({ where: { salespersonId: id } }),
  ]);

  if (dispatchCount + balanceCount + paymentCount > 0) {
    throw new AppError('Cannot delete a salesperson with existing transactions. Deactivate them instead.', 400);
  }

  await prisma.salesperson.delete({ where: { id } });
  res.json({ success: true, data: { message: 'Salesperson deleted' } });
});

/**
 * Superadmin only — wipes the entire financial ledger of one or more
 * salespeople so their balances reset to ₹0, while the accounts themselves
 * (name, login, custom prices, product access) survive. Intended for starting
 * a salesperson afresh, after which their real dues are loaded with a top-up.
 *
 * Clears, in FK-safe order: payments (incl. top-ups), dispatches — whose items
 * cascade — and the balance ledger. Deleting the balance rows is what actually
 * zeroes them: the cascade only ever recomputes dates that already have a row,
 * so with none left there is nothing to recompute.
 *
 * Note this also removes those dispatches from the dairy-wide Stock Balance
 * report, which reads the same table.
 */
const resetLedger = asyncHandler(async (req, res) => {
  const data = validate(schemas.bulkResetLedger, req, res);
  if (!data) return;

  const ids = data.salespersonIds;
  if (new Set(ids).size !== ids.length) {
    throw new AppError('Each salesperson can only appear once', 400);
  }

  const found = await prisma.salesperson.findMany({
    where:  { id: { in: ids } },
    select: { id: true, name: true },
  });
  if (found.length !== ids.length) {
    const missing = ids.filter(id => !found.some(s => s.id === id));
    throw new AppError(`Salesperson not found: ${missing.join(', ')}`, 404);
  }

  // One transaction for the whole batch: either every selected salesperson is
  // reset or none is, so a partial failure can't leave some wiped and some not.
  const counts = await prisma.$transaction(async (tx) => {
    const payments   = await tx.salespersonPayment.deleteMany({ where: { salespersonId: { in: ids } } });
    const dispatches = await tx.stockDispatch.deleteMany({ where: { salespersonId: { in: ids } } });
    const balances   = await tx.salespersonBalance.deleteMany({ where: { salespersonId: { in: ids } } });
    return { payments: payments.count, dispatches: dispatches.count, balances: balances.count };
  }, { isolationLevel: 'Serializable' });

  const names = found.map(s => s.name);
  logger.warn('Salesperson ledger reset', {
    salespersonIds: ids,
    names,
    ...counts,
    by: req.user?.adminUserId,
  });
  void notifySlack(SLACK_EVENTS.SALESPERSON_UPDATED, {
    note: `Ledger reset for ${names.join(', ')} — removed ${counts.payments} payment(s), ${counts.dispatches} dispatch(es), ${counts.balances} balance row(s)`,
  });

  res.json({
    success: true,
    data: {
      message: `Ledger cleared for ${names.length} salesperson(s)`,
      salespeople: names,
      ...counts,
    },
  });
});

module.exports = { getAll, getById, reorder, create, update, remove, resetLedger };
