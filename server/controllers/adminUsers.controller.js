const bcrypt = require('bcrypt');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas, parseId } = require('../utils/validate');
const { BCRYPT_ROUNDS } = require('../utils/constants');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

// Stamped on every card so the affected/superadmin roster knows who made the
// change — this endpoint is superadmin-only, so req.user.adminUserId is
// always the acting superadmin's own id.
async function resolveActingUsername(req) {
  const actor = await prisma.adminUser.findUnique({
    where:  { id: req.user.adminUserId },
    select: { username: true },
  });
  return actor?.username ?? 'superadmin';
}

const SAFE_SELECT = {
  id: true, username: true, role: true, isActive: true, createdAt: true,
};

const getAll = asyncHandler(async (req, res) => {
  const users = await prisma.adminUser.findMany({
    select: SAFE_SELECT,
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  });
  res.json({ success: true, data: users });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(schemas.createAdminUser, req, res);
  if (!data) return;

  // Login matches usernames case-insensitively, so "John" and "john" must
  // not both be allowed to exist — check before hitting the DB's
  // case-sensitive unique constraint.
  const existing = await prisma.adminUser.findFirst({
    where: { username: { equals: data.username, mode: 'insensitive' } },
  });
  if (existing) throw new AppError('Username is already taken', 409);

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const user = await prisma.adminUser.create({
    data: { username: data.username, passwordHash, role: data.role },
    select: SAFE_SELECT,
  });
  const by = await resolveActingUsername(req);
  void notifySlack(SLACK_EVENTS.ADMIN_USER_CREATED, { username: user.username, role: user.role, by });
  res.status(201).json({ success: true, data: user });
});

const update = asyncHandler(async (req, res) => {
  const id   = parseId(req.params.id, 'Admin User ID');
  const data = validate(schemas.updateAdminUser, req, res);
  if (!data) return;

  // Prevent superadmin from demoting themselves
  if (req.user.adminUserId === id && data.role === 'admin') {
    throw new AppError('You cannot change your own role', 400);
  }
  // Prevent deactivating self
  if (req.user.adminUserId === id && data.isActive === false) {
    throw new AppError('You cannot deactivate your own account', 400);
  }

  if (data.username !== undefined) {
    const existing = await prisma.adminUser.findFirst({
      where: { username: { equals: data.username, mode: 'insensitive' }, id: { not: id } },
    });
    if (existing) throw new AppError('Username is already taken', 409);
  }

  const updateData = {};
  if (data.username !== undefined) updateData.username = data.username;
  if (data.role     !== undefined) updateData.role     = data.role;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  }

  const user = await prisma.adminUser.update({
    where: { id },
    data:  updateData,
    select: SAFE_SELECT,
  });
  const by = await resolveActingUsername(req);
  void notifySlack(SLACK_EVENTS.ADMIN_USER_UPDATED, { username: user.username, role: user.role, isActive: user.isActive, by });
  res.json({ success: true, data: user });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Admin User ID');

  if (req.user.adminUserId === id) {
    throw new AppError('You cannot delete your own account', 400);
  }

  // Guard: must always have at least one superadmin
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) throw new AppError('Admin user not found', 404);

  if (target.role === 'superadmin') {
    const superadminCount = await prisma.adminUser.count({ where: { role: 'superadmin' } });
    if (superadminCount <= 1) {
      throw new AppError('Cannot delete the last super admin account', 400);
    }
  }

  await prisma.adminUser.delete({ where: { id } });
  const by = await resolveActingUsername(req);
  void notifySlack(SLACK_EVENTS.ADMIN_USER_DELETED, { username: target.username, role: target.role, by });
  res.json({ success: true, data: { message: 'Admin user deleted' } });
});

module.exports = { getAll, create, update, remove };
