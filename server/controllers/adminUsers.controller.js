const bcrypt = require('bcrypt');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas, parseId } = require('../utils/validate');
const { BCRYPT_ROUNDS } = require('../utils/constants');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { getActingUsername } = require('../utils/actor');
const mfaService = require('../services/mfaService');
const mfaCrypto = require('../utils/mfaCrypto');

// Stamped on every card so the affected/superadmin roster knows who made the
// change — this endpoint is superadmin-only, so req.user.adminUserId is
// always the acting superadmin's own id. Falls back to 'superadmin'.
const resolveActingUsername = (req) => getActingUsername(req, 'superadmin');

const SAFE_SELECT = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  createdAt: true,
  mfaEnabled: true,
  mfaRequired: true,
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
  void notifySlack(SLACK_EVENTS.ADMIN_USER_CREATED, {
    username: user.username,
    role: user.role,
    by,
  });
  res.status(201).json({ success: true, data: user });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Admin User ID');
  const data = validate(schemas.updateAdminUser, req, res);
  if (!data) return;

  // Prevent superadmin from demoting themselves (to admin OR dispatcher) —
  // must block any role change away from superadmin, not just to 'admin',
  // or a superadmin could lock themselves out of /admin/users entirely.
  if (req.user.adminUserId === id && data.role && data.role !== 'superadmin') {
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
  if (data.role !== undefined) updateData.role = data.role;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  }
  // Dispatcher is never MFA-eligible (setMfaRequired rejects it, self-service
  // setup is superadmin-only) — demoting into it must wipe any MFA state the
  // account is carrying, or it goes dark: the Admin Users table hides the
  // MFA column and toggle entirely for dispatcher rows, so a stray
  // mfaEnabled/mfaRequired here would be invisible and unfixable from the UI,
  // and would silently reappear if the account is later promoted back.
  if (data.role === 'dispatcher') {
    updateData.mfaEnabled = false;
    updateData.mfaRequired = false;
    updateData.mfaSecret = null;
    updateData.mfaBackupCodes = [];
  }

  const user = await prisma.adminUser.update({
    where: { id },
    data: updateData,
    select: SAFE_SELECT,
  });
  const by = await resolveActingUsername(req);
  void notifySlack(SLACK_EVENTS.ADMIN_USER_UPDATED, {
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    by,
  });
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
  void notifySlack(SLACK_EVENTS.ADMIN_USER_DELETED, {
    username: target.username,
    role: target.role,
    by,
  });
  res.json({ success: true, data: { message: 'Admin user deleted' } });
});

// ─── MFA (self-service — always acts on the calling superadmin's own row) ──
// These sit on the same superadmin-only router as the rest of Admin Users,
// but deliberately never take a target :id — a superadmin enrolls/disables
// their OWN second factor here, never someone else's.

const mfaStatus = asyncHandler(async (req, res) => {
  const me = await prisma.adminUser.findUnique({
    where: { id: req.user.adminUserId },
    select: { mfaEnabled: true },
  });
  if (!me) throw new AppError('Admin user not found', 404);
  res.json({ success: true, data: { mfaEnabled: me.mfaEnabled } });
});

const mfaSetup = asyncHandler(async (req, res) => {
  const me = await prisma.adminUser.findUnique({ where: { id: req.user.adminUserId } });
  if (!me) throw new AppError('Admin user not found', 404);
  if (me.role !== 'superadmin')
    throw new AppError('MFA is available for super admin accounts only', 400);
  if (me.mfaEnabled)
    throw new AppError('MFA is already enabled. Disable it first to re-enroll.', 400);

  const secret = mfaService.generateSecret();
  const { otpauth, qrCodeDataUrl } = await mfaService.buildEnrollment(me.username, secret);

  // Stored encrypted immediately, but mfaEnabled stays false until confirm()
  // proves a live code — an abandoned setup just leaves an unused secret.
  await prisma.adminUser.update({
    where: { id: me.id },
    data: { mfaSecret: mfaCrypto.encrypt(secret) },
  });

  res.json({ success: true, data: { otpauth, qrCodeDataUrl } });
});

const mfaConfirm = asyncHandler(async (req, res) => {
  const data = validate(schemas.confirmMfa, req, res);
  if (!data) return;

  const me = await prisma.adminUser.findUnique({ where: { id: req.user.adminUserId } });
  if (!me) throw new AppError('Admin user not found', 404);
  if (!me.mfaSecret) throw new AppError('Start MFA setup first', 400);
  if (me.mfaEnabled) throw new AppError('MFA is already enabled', 400);

  const secret = mfaCrypto.decrypt(me.mfaSecret);
  if (!(await mfaService.verifyEnrollmentCode(secret, data.code))) {
    throw new AppError('Invalid code. Please try again.', 400);
  }

  const backupCodes = mfaService.generateBackupCodes();
  const hashedCodes = await mfaService.hashBackupCodes(backupCodes);

  await prisma.adminUser.update({
    where: { id: me.id },
    data: { mfaEnabled: true, mfaBackupCodes: hashedCodes },
  });

  void notifySlack(SLACK_EVENTS.MFA_ENABLED, { username: me.username });
  // Backup codes are returned once, in plaintext — the hashed copy in the DB
  // can never be shown again after this response.
  res.json({ success: true, data: { backupCodes } });
});

const mfaDisable = asyncHandler(async (req, res) => {
  const data = validate(schemas.disableMfa, req, res);
  if (!data) return;

  const me = await prisma.adminUser.findUnique({ where: { id: req.user.adminUserId } });
  if (!me) throw new AppError('Admin user not found', 404);

  const valid = await bcrypt.compare(data.password, me.passwordHash);
  if (!valid) throw new AppError('Password is incorrect', 401);

  await prisma.adminUser.update({
    where: { id: me.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
  });

  void notifySlack(SLACK_EVENTS.MFA_DISABLED, { username: me.username });
  res.json({ success: true, data: { message: 'MFA disabled' } });
});

// ─── MFA (superadmin-driven — forces/lifts the policy on ANOTHER account) ──
// Distinct from the self-service block above: this is a superadmin acting
// on someone else's account, never their own (see the self-guard below).

const setMfaRequired = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'Admin User ID');
  const data = validate(schemas.setMfaRequired, req, res);
  if (!data) return;

  // Managing your OWN MFA goes through the self-service tab above — mixing
  // the two here would make it unclear which flow is authoritative.
  if (req.user.adminUserId === id) {
    throw new AppError('Use the MFA tab in your own account settings to manage your MFA', 400);
  }

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) throw new AppError('Admin user not found', 404);
  if (target.role === 'dispatcher') {
    throw new AppError('MFA is only available for admin and super admin accounts', 400);
  }

  // Turning the requirement OFF means "this account no longer needs MFA at
  // all" — an admin has no self-service tab to disable it themselves once
  // enrolled, so this is also the only way to fully turn it back off for
  // them. Turning it ON only sets the policy; enrollment happens at their
  // next login (see auth.controller.js's mfaSetupRequired/mfaConfirmRequired).
  const updateData = data.required
    ? { mfaRequired: true }
    : { mfaRequired: false, mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] };

  const user = await prisma.adminUser.update({
    where: { id },
    data: updateData,
    select: SAFE_SELECT,
  });
  const by = await resolveActingUsername(req);
  const roleLabel = target.role === 'superadmin' ? 'Super Admin' : 'Admin';
  void notifySlack(
    data.required ? SLACK_EVENTS.MFA_REQUIRED_SET : SLACK_EVENTS.MFA_REQUIRED_UNSET,
    { username: target.username, role: roleLabel, by }
  );
  res.json({ success: true, data: user });
});

module.exports = {
  getAll,
  create,
  update,
  remove,
  mfaStatus,
  mfaSetup,
  mfaConfirm,
  mfaDisable,
  setMfaRequired,
};
