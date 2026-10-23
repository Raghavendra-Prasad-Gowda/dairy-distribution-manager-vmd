module.exports = {
  BCRYPT_ROUNDS: 10,
  // Pin the accepted signing algorithm so a token can never be verified under a
  // different (e.g. 'none' or asymmetric-confusion) algorithm than we sign with.
  JWT_VERIFY_OPTS: { algorithms: ['HS256'] },
  JWT_EXPIRES_IN: 7200, // 2 hours in seconds
  // How long a login gets to complete the MFA step before it must restart.
  MFA_PENDING_EXPIRES_IN: 300, // 5 minutes in seconds
  MFA_BACKUP_CODE_COUNT: 8,
  // Account lockout (services/accountLockService.js) — 5 wrong passwords OR
  // 5 wrong MFA/backup codes locks an AdminUser account; the lock auto-expires
  // after the cooldown so nobody can be permanently locked out.
  ACCOUNT_LOCK_THRESHOLD: 5,
  ACCOUNT_LOCK_COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes
};
