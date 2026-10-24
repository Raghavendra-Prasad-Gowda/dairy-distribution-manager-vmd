const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas } = require('../utils/validate');
const { BCRYPT_ROUNDS, JWT_EXPIRES_IN, MFA_PENDING_EXPIRES_IN, ACCOUNT_LOCK_COOLDOWN_MS } = require('../utils/constants');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const mfaService = require('../services/mfaService');
const mfaCrypto = require('../utils/mfaCrypto');
const accountLockService = require('../services/accountLockService');
const env = require('../config/env');

const LOCK_COOLDOWN_MINUTES = Math.ceil(ACCOUNT_LOCK_COOLDOWN_MS / 60000);

/**
 * Throws AppError(423, ...) if the account is currently locked (see
 * accountLockService.js). Lazily clears an expired lock first — the lock
 * check itself never writes, so this is the one place that turns "cooldown
 * has passed" into an actual reset — and mutates the passed-in row so the
 * rest of THIS request (bcrypt compare, etc.) sees the healed state too.
 * Shared by login() and resolvePendingAdminUser() so a lock is enforced at
 * every step that could otherwise let a locked account through.
 */
async function assertNotLocked(adminUser) {
  const lock = accountLockService.checkLock(adminUser);
  if (lock.expired) {
    await accountLockService.clearLockState(adminUser.id);
    adminUser.lockedAt = null;
    adminUser.lockedReason = null;
    return;
  }
  if (lock.locked) {
    const reasonText = lock.reason === 'mfa' ? 'too many wrong MFA codes' : 'too many wrong password attempts';
    throw new AppError(
      `Account locked due to ${reasonText}. Try again in ${lock.remainingMinutes} minute(s), or contact your super admin to unlock it.`,
      423
    );
  }
}

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
 * writes the response. Shared by the plain login path, the MFA-verify path
 * (mfaLogin), and completing a forced enrollment (mfaConfirmRequired) — all
 * three end at "credentials are now fully proven". `extraData` is merged
 * into the response's `data` (mfaConfirmRequired uses it to also return the
 * new backup codes alongside the session).
 */
function respondWithAdminSession(res, adminUser, ip, extraData = {}) {
  const token = jwt.sign(
    { id: adminUser.id, role: adminUser.role, adminUserId: adminUser.id },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  setCookie(res, token);

  const adminRoleLabel =
    adminUser.role === 'superadmin'
      ? 'Super Admin'
      : adminUser.role === 'dispatcher'
        ? 'Dispatcher'
        : 'Admin';
  void notifySlack(SLACK_EVENTS.LOGIN, { username: adminUser.username, role: adminRoleLabel, ip });
  res.json({
    success: true,
    data: {
      accessToken: token,
      businessName: BUSINESS_NAME,
      role: adminUser.role,
      adminUserId: adminUser.id,
      ...extraData,
    },
  });
}

/**
 * Decodes and validates a pending mfaToken handed back by login() when it
 * pauses for MFA. Shared by mfaLogin, mfaSetupRequired and
 * mfaConfirmRequired below — none of them have a full session yet, only
 * this short-lived token, since `authenticate` rejects it (no `role` claim).
 */
async function resolvePendingAdminUser(mfaToken) {
  let decoded;
  try {
    decoded = jwt.verify(mfaToken, env.JWT_SECRET);
  } catch {
    throw new AppError('MFA session expired. Please log in again.', 401);
  }
  if (!decoded.mfaPending || !decoded.adminUserId) {
    throw new AppError('Invalid MFA session. Please log in again.', 401);
  }

  const adminUser = await prisma.adminUser.findUnique({ where: { id: decoded.adminUserId } });
  if (!adminUser || !adminUser.isActive) {
    throw new AppError('MFA session is no longer valid. Please log in again.', 401);
  }

  // Defense-in-depth: the account could have crossed the lock threshold via
  // a parallel attempt (e.g. someone brute-forcing the password on another
  // tab) after login() issued this mfaToken but before it's redeemed here.
  await assertNotLocked(adminUser);

  return adminUser;
}

const login = asyncHandler(async (req, res) => {
  const data = validate(schemas.login, req, res);
  if (!data) return;

  const ip = req.ip;

  // ── 1. Try AdminUser table (superadmin + managed admins) ─────────────────
  // Username lookup is case-insensitive — "Admin" and "admin" both match.
  const adminUser = await prisma.adminUser.findFirst({
    where: { username: { equals: data.username, mode: 'insensitive' } },
  });

  if (adminUser) {
    if (!adminUser.isActive) {
      void notifySlack(SLACK_EVENTS.FAILED_LOGIN, {
        attemptedUsername: data.username,
        ip,
        reason: 'Account disabled',
      });
      throw new AppError('Invalid username or password', 401);
    }

    await assertNotLocked(adminUser);

    const valid = await bcrypt.compare(data.password, adminUser.passwordHash);
    if (!valid) {
      const { lockedNow } = await accountLockService.recordFailedPassword(adminUser);
      void notifySlack(SLACK_EVENTS.FAILED_LOGIN, {
        attemptedUsername: data.username,
        ip,
        reason: lockedNow ? 'Wrong password (account now locked)' : 'Wrong password',
      });
      if (lockedNow) {
        throw new AppError(
          `Account locked due to too many wrong password attempts. Try again in ${LOCK_COOLDOWN_MINUTES} minute(s), or contact your super admin to unlock it.`,
          423
        );
      }
      // Deliberately the same generic message as "username not found" above
      // (no attempt count here) — surfacing "N attempts remaining" would
      // leak that this username exists, unlike the MFA step below where the
      // account is already committed to by the mfaToken.
      throw new AppError('Invalid username or password', 401);
    }

    if (adminUser.mfaEnabled || adminUser.mfaRequired) {
      // Password step succeeded — reset only the password counter. A wrong
      // MFA code from an earlier attempt still counts; each counter resets
      // on its own success (see accountLockService.js). The no-MFA path
      // below resets both via clearLockState() once the login is complete.
      await accountLockService.resetPasswordAttempts(adminUser.id);
    }

    // Password is proven — but the session isn't issued yet in either MFA
    // case below, so no LOGIN card fires until mfaLogin() or
    // mfaConfirmRequired() completes it. The short-lived mfaToken carries
    // only enough to resume (adminUserId + mfaPending) and is rejected by
    // `authenticate` since it has no `role` claim.
    if (adminUser.mfaEnabled) {
      // Already enrolled (self-service, or a completed forced enrollment) —
      // pause for a live code / backup code via POST /auth/mfa/verify.
      const mfaToken = jwt.sign({ adminUserId: adminUser.id, mfaPending: true }, env.JWT_SECRET, {
        expiresIn: MFA_PENDING_EXPIRES_IN,
      });
      return res.json({ success: true, data: { mfaVerifyRequired: true, mfaToken } });
    }
    if (adminUser.mfaRequired) {
      // A superadmin marked this account mfaRequired but it was never
      // enrolled — force enrollment (QR + code) before a session is issued.
      // mfaEnabled can only ever be true for admin/superadmin rows
      // (dispatcher is blocked in setMfaRequired and the self-service
      // endpoints), so this invariant holds without re-checking role here.
      const mfaToken = jwt.sign({ adminUserId: adminUser.id, mfaPending: true }, env.JWT_SECRET, {
        expiresIn: MFA_PENDING_EXPIRES_IN,
      });
      return res.json({ success: true, data: { mfaSetupRequired: true, mfaToken } });
    }

    await accountLockService.clearLockState(adminUser.id);
    return respondWithAdminSession(res, adminUser, ip);
  }

  // ── 2. Try salesperson ────────────────────────────────────────────────────
  // Username lookup is case-insensitive, same as the admin lookup above.
  const salesperson = await prisma.salesperson.findFirst({
    where: { username: { equals: data.username, mode: 'insensitive' }, isActive: true },
  });

  if (!salesperson || !salesperson.passwordHash) {
    void notifySlack(SLACK_EVENTS.FAILED_LOGIN, {
      attemptedUsername: data.username,
      ip,
      reason: 'Username not found',
    });
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await bcrypt.compare(data.password, salesperson.passwordHash);
  if (!valid) {
    void notifySlack(SLACK_EVENTS.FAILED_LOGIN, {
      attemptedUsername: data.username,
      ip,
      reason: 'Wrong password',
    });
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
      accessToken: token,
      businessName: BUSINESS_NAME,
      role: 'salesman',
      salespersonId: salesperson.id,
      salespersonName: salesperson.name,
    },
  });
});

/**
 * POST /auth/mfa/verify
 * Completes a login that login() paused for MFA on an already-enrolled
 * account (self-enrolled superadmin, or an admin who already completed a
 * forced enrollment). Accepts the short-lived mfaToken from that response
 * plus either a live 6-digit TOTP code or a one-time backup code.
 */
const mfaLogin = asyncHandler(async (req, res) => {
  const data = validate(schemas.verifyMfaLogin, req, res);
  if (!data) return;

  const ip = req.ip;
  const adminUser = await resolvePendingAdminUser(data.mfaToken);

  if (!adminUser.mfaEnabled) {
    throw new AppError('MFA session is no longer valid. Please log in again.', 401);
  }

  const result = await mfaService.verifyLoginCode(adminUser, data.code);
  if (!result.ok) {
    const { lockedNow, remaining } = await accountLockService.recordFailedMfa(adminUser);
    void notifySlack(SLACK_EVENTS.MFA_FAILED, { username: adminUser.username, ip });
    if (lockedNow) {
      throw new AppError(
        `Account locked due to too many wrong MFA codes. Try again in ${LOCK_COOLDOWN_MINUTES} minute(s), or contact your super admin to unlock it.`,
        423
      );
    }
    // Safe to show a remaining-attempts count here (unlike the password
    // step) — the mfaToken already commits this request to one specific
    // account, so there's no username to enumerate.
    throw new AppError(`Invalid authentication code. ${remaining} attempt(s) remaining before this account is locked.`, 401);
  }

  if (result.usedBackupCode) {
    // Already writing this row for the backup-code consumption — fold the
    // lock-state reset into the SAME update rather than firing a second one.
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { mfaBackupCodes: result.remainingBackupCodes, ...accountLockService.CLEAR_LOCK_DATA },
    });
  } else {
    await accountLockService.clearLockState(adminUser.id);
  }
  respondWithAdminSession(res, adminUser, ip);
});

/**
 * POST /auth/mfa/setup-required
 * First step of a FORCED enrollment — resumes a login() that paused because
 * a superadmin marked this account mfaRequired but it has never been
 * enrolled. Generates a pending TOTP secret and returns the enrollment QR,
 * mirroring adminUsers.controller.js's self-service mfaSetup but
 * authenticated by the pending mfaToken instead of a full session (there
 * isn't one yet — this IS what stands between the account and a session).
 */
const mfaSetupRequired = asyncHandler(async (req, res) => {
  const data = validate(schemas.mfaSetupToken, req, res);
  if (!data) return;

  const adminUser = await resolvePendingAdminUser(data.mfaToken);
  if (!adminUser.mfaRequired || adminUser.mfaEnabled) {
    throw new AppError('MFA session is no longer valid. Please log in again.', 401);
  }

  const secret = mfaService.generateSecret();
  const { otpauth, qrCodeDataUrl } = await mfaService.buildEnrollment(adminUser.username, secret);

  // Stored encrypted immediately; mfaEnabled flips true only once
  // mfaConfirmRequired proves a live code from it.
  await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { mfaSecret: mfaCrypto.encrypt(secret) },
  });

  res.json({ success: true, data: { otpauth, qrCodeDataUrl } });
});

/**
 * POST /auth/mfa/confirm-required
 * Second step of forced enrollment — verifies the code against the pending
 * secret from mfaSetupRequired, turns MFA on, and — unlike the self-service
 * confirm — immediately issues the real session, since completing this IS
 * completing the login. Backup codes are returned alongside the session so
 * the client can show them once, right where the QR code was shown.
 */
const mfaConfirmRequired = asyncHandler(async (req, res) => {
  const data = validate(schemas.confirmRequiredMfa, req, res);
  if (!data) return;

  const ip = req.ip;
  const adminUser = await resolvePendingAdminUser(data.mfaToken);
  if (!adminUser.mfaRequired || adminUser.mfaEnabled || !adminUser.mfaSecret) {
    throw new AppError('MFA session is no longer valid. Please log in again.', 401);
  }

  const secret = mfaCrypto.decrypt(adminUser.mfaSecret);
  if (!(await mfaService.verifyEnrollmentCode(secret, data.code))) {
    const { lockedNow, remaining } = await accountLockService.recordFailedMfa(adminUser);
    if (lockedNow) {
      throw new AppError(
        `Account locked due to too many wrong codes. Try again in ${LOCK_COOLDOWN_MINUTES} minute(s), or contact your super admin to unlock it.`,
        423
      );
    }
    throw new AppError(`Invalid code. ${remaining} attempt(s) remaining before this account is locked. Please try again.`, 400);
  }

  const backupCodes = mfaService.generateBackupCodes();
  const hashedCodes = await mfaService.hashBackupCodes(backupCodes);

  // Already writing this row to flip mfaEnabled on — fold the lock-state
  // reset into the SAME update rather than firing a second one.
  const updated = await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { mfaEnabled: true, mfaBackupCodes: hashedCodes, ...accountLockService.CLEAR_LOCK_DATA },
  });

  const roleLabel =
    adminUser.role === 'superadmin'
      ? 'Super Admin'
      : adminUser.role === 'dispatcher'
        ? 'Dispatcher'
        : 'Admin';
  void notifySlack(SLACK_EVENTS.MFA_ENABLED, {
    username: adminUser.username,
    role: roleLabel,
    requiredBy: 'Required by a super admin',
  });

  respondWithAdminSession(res, updated, ip, { backupCodes });
});

const changePassword = asyncHandler(async (req, res) => {
  const data = validate(schemas.changePassword, req, res);
  if (!data) return;

  const { role, adminUserId, salespersonId } = req.user;
  const ip = req.ip;

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
      role:
        adminUser.role === 'superadmin'
          ? 'Super Admin'
          : adminUser.role === 'dispatcher'
            ? 'Dispatcher'
            : 'Admin',
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
      role: 'Salesman',
      ip,
    });
    res.json({ success: true, data: { message: 'Password changed successfully' } });
  } else {
    throw new AppError('Unauthorized', 403);
  }
});

const logout = asyncHandler(async (req, res) => {
  const ip = req.ip;
  let username = 'unknown';
  let role = 'unknown';

  if (req.user?.adminUserId) {
    const au = await prisma.adminUser.findUnique({
      where: { id: req.user.adminUserId },
      select: { username: true, role: true },
    });
    username = au?.username ?? 'unknown';
    role =
      au?.role === 'superadmin'
        ? 'Super Admin'
        : au?.role === 'dispatcher'
          ? 'Dispatcher'
          : 'Admin';
  } else if (req.user?.role === 'salesman') {
    const sp = await prisma.salesperson.findUnique({
      where: { id: req.user.salespersonId },
      select: { username: true, name: true },
    });
    username = sp?.username ?? sp?.name ?? 'unknown';
    role = 'Salesman';
  }

  res.clearCookie('token');
  void notifySlack(SLACK_EVENTS.LOGOUT, { username, role, ip });
  res.json({ success: true, data: { message: 'Logged out' } });
});

module.exports = { login, mfaLogin, mfaSetupRequired, mfaConfirmRequired, changePassword, logout };
