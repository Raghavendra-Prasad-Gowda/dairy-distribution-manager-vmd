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
 * Superadmin only — wipes a salesperson's entire financial ledger so their
 * balance resets to ₹0, while the account itself (name, login, custom prices,
 * product access) survives. Intended for starting a salesperson afresh, after
 * which their real dues are loaded with a top-up.
 *
 * Clears, in FK-safe order: payments (incl. top-ups), dispatches — whose items
 * cascade — and the balance ledger. Deleting the balance rows is what actually
 * zeroes them: the cascade only ever recomputes dates that already have a row,
 * so with none left there is nothing to recompute.
 *
 * Note this also removes the salesperson's dispatches from the dairy-wide
 * Stock Balance report, which reads the same table.
 */
const resetLedger = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Salesperson ID');

  const sp = await prisma.salesperson.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!sp) throw new AppError('Salesperson not found', 404);

  // Typing the exact name is the client-side arming step; re-checked here so
  // the guard still holds for anyone calling the API directly.
  const { confirmName } = req.body ?? {};
  if (typeof confirmName !== 'string' || confirmName.trim() !== sp.name) {
    throw new AppError('Confirmation name does not match this salesperson', 400);
  }

  const counts = await prisma.$transaction(async (tx) => {
    const payments  = await tx.salespersonPayment.deleteMany({ where: { salespersonId: id } });
    const dispatches = await tx.stockDispatch.deleteMany({ where: { salespersonId: id } });
    const balances  = await tx.salespersonBalance.deleteMany({ where: { salespersonId: id } });
    return { payments: payments.count, dispatches: dispatches.count, balances: balances.count };
  }, { isolationLevel: 'Serializable' });

  logger.warn('Salesperson ledger reset', {
    salespersonId: id,
    name:          sp.name,
    ...counts,
    by:            req.user?.adminUserId,
  });
  void notifySlack(SLACK_EVENTS.SALESPERSON_UPDATED, {
    salespersonId: id,
    name:          sp.name,
    note: `Ledger reset — removed ${counts.payments} payment(s), ${counts.dispatches} dispatch(es), ${counts.balances} balance row(s)`,
  });

  res.json({ success: true, data: { message: `Ledger cleared for ${sp.name}`, ...counts } });
});

module.exports = { getAll, getById, reorder, create, update, remove, resetLedger };
