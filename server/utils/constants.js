module.exports = {
  BCRYPT_ROUNDS: 10,
  JWT_EXPIRES_IN: 7200, // 2 hours in seconds
  // How long a login gets to complete the MFA step before it must restart.
  MFA_PENDING_EXPIRES_IN: 300, // 5 minutes in seconds
  MFA_BACKUP_CODE_COUNT: 8,
};
