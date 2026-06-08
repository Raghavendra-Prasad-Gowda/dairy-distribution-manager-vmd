'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');

let _ownClient = null;
function getClient(externalClient) {
  if (externalClient) return externalClient;
  if (!_ownClient) _ownClient = new PrismaClient();
  return _ownClient;
}
const BCRYPT_ROUNDS = 10;

/**
 * Bootstraps the superadmin account from env vars on every boot.
 * If SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD are not set, nothing is created.
 */
async function seedFoundationData(externalPrisma) {
  const prisma = getClient(externalPrisma);

  // ─── Super admin user (AdminUser table) ───────────────────────────────────
  // Env vars are authoritative — always sync username + password on every boot.
  const rawSuperUsername = process.env.SUPERADMIN_USERNAME;
  const rawSuperPassword = process.env.SUPERADMIN_PASSWORD;
  if (rawSuperUsername && rawSuperPassword) {
    const existingSuperAdmin = await prisma.adminUser.findFirst({ where: { role: 'superadmin' } });
    const passwordHash = await bcrypt.hash(rawSuperPassword, BCRYPT_ROUNDS);
    if (existingSuperAdmin) {
      await prisma.adminUser.update({
        where: { id: existingSuperAdmin.id },
        data: { username: rawSuperUsername, passwordHash },
      });
      logger.info('Synced superadmin credentials from env vars', { username: rawSuperUsername });
    } else {
      await prisma.adminUser.create({
        data: { username: rawSuperUsername, passwordHash, role: 'superadmin' },
      });
      logger.info('Created superadmin user', { username: rawSuperUsername });
    }
  } else {
    logger.info('SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD not set — skipping superadmin seed');
  }
}

module.exports = { seedFoundationData };

// Allow running standalone: node prisma/seed.js
if (require.main === module) {
  seedFoundationData()
    .catch((e) => { logger.error('Seed failed', { message: e.message, stack: e.stack }); process.exit(1); })
    .finally(() => { if (_ownClient) _ownClient.$disconnect(); });
}
