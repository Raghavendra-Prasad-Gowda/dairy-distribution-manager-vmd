const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas } = require('../utils/validate');
const { BCRYPT_ROUNDS, JWT_EXPIRES_IN, MFA_PENDING_EXPIRES_IN } = require('../utils/constants');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const mfaService = require('../services/mfaService');
const env = require('../config/env');

const BUSINESS_NAME = 'Vikas Milk Dairy';

function setCookie(res, token) {
  const isDeployed = !env.isDev;
  res.cookie('token', token, {
    httpOnly: true,
    secure: isDeployed,
    sameSite: isDeployed ? 'none' : 'lax',
    maxAge: JWT_EXPIRES_IN * 1000,
  });
}

/**
 * Issues the real session for an AdminUser (admin/superadmin/dispatcher) —
 * signs the full JWT, sets the cookie, fires the LOGIN Slack card, and
 * writes the response. Shared by the plain login path and the MFA-verify
 * path (mfaLogin), which both end at "credentials are now fully proven".
 */
function respondWithAdminSession(res, adminUser, ip) {
  const token = jwt.sign(
    { id: adminUser.id, role: adminUser.role, adminUserId: adminUser.id },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  setCookie(res, token);

  const adminRoleLabel = adminUser.role === 'superadmin' ? 'Super Admin' : adminUser.role === 'dispatcher' ? 'Dispatcher' : 'Admin';
  void notifySlack(SLACK_EVENTS.LOGIN, { username: adminUser.username, role: adminRoleLabel, ip });
  res.json({
    success: true,
    data: {
      accessToken:  token,
      businessName: BUSINESS_NAME,
      role:         adminUser.role,
      adminUserId:  adminUser.id,
    },
  });
}

const login = asyncHandler(async (req, res) => {
  const data = validate(schemas.login, req, res);
  if (!data) return;

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;

  // ── 1. Try AdminUser table (superadmin + managed admins) ─────────────────
  // Username lookup is case-insensitive — "Admin" and "admin" both match.
  const adminUser = await prisma.adminUser.findFirst({
    where: { username: { equals: data.username, mode: 'insensitive' } },
  });

  if (adminUser) {
    if (!adminUser.isActive) {
      void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Account disabled' });
      throw new AppError('Invalid username or password', 401);
    }
    const valid = await bcrypt.compare(data.password, adminUser.passwordHash);
    if (!valid) {
      void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Wrong password' });
      throw new AppError('Invalid username or password', 401);
    }

    // Superadmin-only second factor. Password is proven — but the session
    // isn't issued yet, so no LOGIN card fires until mfaLogin() below
    // completes it. The short-lived mfaToken carries only enough to resume
    // (adminUserId + mfaPending) and is rejected by `authenticate` since it
    // has no `role` claim.
    if (adminUser.role === 'superadmin' && adminUser.mfaEnabled) {
      const mfaToken = jwt.sign(
        { adminUserId: adminUser.id, mfaPending: true },
        env.JWT_SECRET,
        { expiresIn: MFA_PENDING_EXPIRES_IN }
      );
      return res.json({ success: true, data: { mfaRequired: true, mfaToken } });
    }

    return respondWithAdminSession(res, adminUser, ip);
  }

  // ── 2. Try salesperson ────────────────────────────────────────────────────
  // Username lookup is case-insensitive, same as the admin lookup above.
  const salesperson = await prisma.salesperson.findFirst({
    where: { username: { equals: data.username, mode: 'insensitive' }, isActive: true },
  });

  if (!salesperson || !salesperson.passwordHash) {
    void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Username not found' });
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await bcrypt.compare(data.password, salesperson.passwordHash);
  if (!valid) {
    void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Wrong password' });
    throw new AppError('Invalid username or password', 401);
  }

  const token = jwt.sign(
    { id: salesperson.id, role: 'salesman', salespersonId: salesperson.id },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  setCookie(res, token);

  void notifySlack(SLACK_EVENTS.LOGIN, { username: salesperson.username, role: 'Salesman', ip });
  res.json({
    success: true,
    data: {
      accessToken:     token,
      businessName:    BUSINESS_NAME,
      role:            'salesman',
      salespersonId:   salesperson.id,
      salespersonName: salesperson.name,
    },
  });
});

/**
 * POST /auth/mfa/verify
 * Completes a superadmin login that login() paused for MFA. Accepts the
 * short-lived mfaToken from that response plus either a live 6-digit TOTP
 * code or a one-time backup code.
 */
const mfaLogin = asyncHandler(async (req, res) => {
  const data = validate(schemas.verifyMfaLogin, req, res);
  if (!data) return;

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;

  let decoded;
  try {
    decoded = jwt.verify(data.mfaToken, env.JWT_SECRET);
  } catch {
    throw new AppError('MFA session expired. Please log in again.', 401);
  }
  if (!decoded.mfaPending || !decoded.adminUserId) {
    throw new AppError('Invalid MFA session. Please log in again.', 401);
  }

  const adminUser = await prisma.adminUser.findUnique({ where: { id: decoded.adminUserId } });
  if (!adminUser || !adminUser.isActive || adminUser.role !== 'superadmin' || !adminUser.mfaEnabled) {
    throw new AppError('MFA session is no longer valid. Please log in again.', 401);
  }

  const result = await mfaService.verifyLoginCode(adminUser, data.code);
  if (!result.ok) {
    void notifySlack(SLACK_EVENTS.MFA_FAILED, { username: adminUser.username, ip });
    throw new AppError('Invalid authentication code', 401);
  }

  if (result.usedBackupCode) {
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data:  { mfaBackupCodes: result.remainingBackupCodes },
    });
  }

  respondWithAdminSession(res, adminUser, ip);
});

const changePassword = asyncHandler(async (req, res) => {
  const data = validate(schemas.changePassword, req, res);
  if (!data) return;

  const { role, adminUserId, salespersonId } = req.user;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;

  if (role === 'admin' || role === 'superadmin' || role === 'dispatcher') {
    // Admin/dispatcher changing their own password
    const adminUser = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!adminUser) throw new AppError('Admin user not found', 404);

    const valid = await bcrypt.compare(data.currentPassword, adminUser.passwordHash);
    if (!valid) throw new AppError('Current password is incorrect', 401);

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await prisma.adminUser.update({ where: { id: adminUserId }, data: { passwordHash } });

    void notifySlack(SLACK_EVENTS.PASSWORD_CHANGED, {
      username: adminUser.username,
      role:     adminUser.role === 'superadmin' ? 'Super Admin' : adminUser.role === 'dispatcher' ? 'Dispatcher' : 'Admin',
      ip,
    });
    res.json({ success: true, data: { message: 'Password changed successfully' } });
  } else if (role === 'salesman') {
    // Salesman changing their own password
    const salesperson = await prisma.salesperson.findUnique({ where: { id: salespersonId } });
    if (!salesperson) throw new AppError('Salesman not found', 404);

    const valid = await bcrypt.compare(data.currentPassword, salesperson.passwordHash);
    if (!valid) throw new AppError('Current password is incorrect', 401);

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await prisma.salesperson.update({ where: { id: salespersonId }, data: { passwordHash } });

    void notifySlack(SLACK_EVENTS.PASSWORD_CHANGED, {
      username: salesperson.username ?? salesperson.name,
      role:     'Salesman',
      ip,
    });
    res.json({ success: true, data: { message: 'Password changed successfully' } });
  } else {
    throw new AppError('Unauthorized', 403);
  }
});

const logout = asyncHandler(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;
  let username = 'unknown';
  let role = 'unknown';

  if (req.user?.adminUserId) {
    const au = await prisma.adminUser.findUnique({ where: { id: req.user.adminUserId }, select: { username: true, role: true } });
    username = au?.username ?? 'unknown';
    role = au?.role === 'superadmin' ? 'Super Admin' : au?.role === 'dispatcher' ? 'Dispatcher' : 'Admin';
  } else if (req.user?.role === 'salesman') {
    const sp = await prisma.salesperson.findUnique({ where: { id: req.user.salespersonId }, select: { username: true, name: true } });
    username = sp?.username ?? sp?.name ?? 'unknown';
    role = 'Salesman';
  }

  res.clearCookie('token');
  void notifySlack(SLACK_EVENTS.LOGOUT, { username, role, ip });
  res.json({ success: true, data: { message: 'Logged out' } });
});

module.exports = { login, mfaLogin, changePassword, logout };
