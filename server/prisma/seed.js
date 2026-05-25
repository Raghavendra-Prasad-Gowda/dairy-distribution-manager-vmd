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
 * Idempotent — creates the admin account if it doesn't exist.
 * Safe to call on every deployment startup.
 */
async function seedFoundationData(externalPrisma) {
  const prisma = getClient(externalPrisma);

  // ─── Admin user (AppSettings — legacy, backward-compat) ──────────────────
  const existing = await prisma.appSettings.findFirst();
  if (!existing) {
    if (!process.env.ADMIN_PASSWORD) {
      logger.warn('ADMIN_PASSWORD env var not set — admin account will use insecure default password. Set this in production.');
    }
    const rawUsername = process.env.ADMIN_USERNAME || 'admin';
    const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
    await prisma.appSettings.create({
      data: { businessName: 'Vikas Milk Dairy', username: rawUsername, passwordHash },
    });
    logger.info('Created admin user', { username: rawUsername });
  }

  // ─── Super admin user (AdminUser table) ───────────────────────────────────
  const existingSuperAdmin = await prisma.adminUser.findFirst({ where: { role: 'superadmin' } });
  if (!existingSuperAdmin) {
    if (!process.env.SUPERADMIN_PASSWORD) {
      logger.warn('SUPERADMIN_PASSWORD env var not set — superadmin account will use insecure default password. Set this in production.');
    }
    const rawUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
    const rawPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
    await prisma.adminUser.create({
      data: { username: rawUsername, passwordHash, role: 'superadmin' },
    });
    logger.info('Created superadmin user', { username: rawUsername });
  }
}

module.exports = { seedFoundationData };

// Allow running standalone: node prisma/seed.js
if (require.main === module) {
  seedFoundationData()
    .catch((e) => { logger.error('Seed failed', { message: e.message, stack: e.stack }); process.exit(1); })
    .finally(() => { if (_ownClient) _ownClient.$disconnect(); });
}
