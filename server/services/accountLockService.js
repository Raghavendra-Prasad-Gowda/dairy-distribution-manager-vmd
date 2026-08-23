'use strict';

// Account lockout for AdminUser login (admin/superadmin/dispatcher share this
// table — see schema.prisma's AdminUser model). Two independent counters:
// a wrong password locks after ACCOUNT_LOCK_THRESHOLD wrong passwords, a
// wrong MFA/backup code locks after the same number of wrong codes. Either
// one tripping sets lockedAt; a lock auto-expires ACCOUNT_LOCK_COOLDOWN_MS
// later — checked lazily on the next attempt, never a background job — so
// there is never a scenario (e.g. every superadmin locked out at once) with
// no in-app recovery path. A superadmin can also unlock immediately via
// PUT /admin-users/:id/unlock (adminUsers.controller.js).

const prisma = require('../lib/prisma');
const { ACCOUNT_LOCK_THRESHOLD, ACCOUNT_LOCK_COOLDOWN_MS } = require('../utils/constants');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

// Exported (not just used internally by clearLockState below) so a caller
// that's already writing this row for another reason — mfaLogin() consuming
// a backup code, mfaConfirmRequired() flipping mfaEnabled on — can spread
// these into that SAME update instead of firing a second one right after.
const CLEAR_LOCK_DATA = {
  failedPasswordAttempts: 0,
  failedMfaAttempts: 0,
  lockedAt: null,
  lockedReason: null,
};

/**
 * Answers "is this account locked right now" — purely a read, no DB write.
 * A lockedAt older than the cooldown is treated as already expired (`expired:
 * true`) so the caller can lazily clear it before continuing, rather than
 * this function reaching for a write on what's meant to be a query.
 */
function checkLock(adminUser) {
  if (!adminUser.lockedAt) return { locked: false };
  const elapsedMs = Date.now() - adminUser.lockedAt.getTime();
  if (elapsedMs >= ACCOUNT_LOCK_COOLDOWN_MS) return { locked: false, expired: true };
  return {
    locked: true,
    reason: adminUser.lockedReason,
    remainingMinutes: Math.max(1, Math.ceil((ACCOUNT_LOCK_COOLDOWN_MS - elapsedMs) / 60000)),
  };
}

/** Clears all lockout state — a fresh slate after an expired lock, a full successful login, or a manual superadmin unlock. */
async function clearLockState(adminUserId) {
  return prisma.adminUser.update({ where: { id: adminUserId }, data: CLEAR_LOCK_DATA });
}

async function resetPasswordAttempts(adminUserId) {
  return prisma.adminUser.update({ where: { id: adminUserId }, data: { failedPasswordAttempts: 0 } });
}

async function resetMfaAttempts(adminUserId) {
  return prisma.adminUser.update({ where: { id: adminUserId }, data: { failedMfaAttempts: 0 } });
}

/**
 * Shared by recordFailedPassword/recordFailedMfa below — increments the
 * given counter field and, if it just crossed the threshold, locks the
 * account and fires the Slack alert. Returns `{ lockedNow, remaining }` so
 * the caller can shape its error message (generic vs. "you're now locked
 * out") without a second round-trip.
 */
async function recordFailedAttempt(adminUser, field, reason) {
  const nextCount = (adminUser[field] ?? 0) + 1;
  const lockedNow = nextCount >= ACCOUNT_LOCK_THRESHOLD;

  const data = { [field]: nextCount };
  if (lockedNow) {
    data.lockedAt = new Date();
    data.lockedReason = reason;
  }
  await prisma.adminUser.update({ where: { id: adminUser.id }, data });

  if (lockedNow) {
    const roleLabel =
      adminUser.role === 'superadmin' ? 'Super Admin' : adminUser.role === 'dispatcher' ? 'Dispatcher' : 'Admin';
    void notifySlack(SLACK_EVENTS.ACCOUNT_LOCKED, {
      username: adminUser.username,
      role: roleLabel,
      reason: reason === 'mfa' ? 'Too many wrong MFA codes' : 'Too many wrong passwords',
    });
  }

  return { lockedNow, remaining: Math.max(0, ACCOUNT_LOCK_THRESHOLD - nextCount) };
}

/** Call on a wrong password during login(). */
function recordFailedPassword(adminUser) {
  return recordFailedAttempt(adminUser, 'failedPasswordAttempts', 'password');
}

/** Call on a wrong MFA code (live TOTP or backup) during mfaLogin()/mfaConfirmRequired(). */
function recordFailedMfa(adminUser) {
  return recordFailedAttempt(adminUser, 'failedMfaAttempts', 'mfa');
}

module.exports = {
  checkLock,
  clearLockState,
  resetPasswordAttempts,
  resetMfaAttempts,
  recordFailedPassword,
  recordFailedMfa,
  CLEAR_LOCK_DATA,
};
