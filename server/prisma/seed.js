'use strict';

const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const env = require('../config/env');

// Always use the singleton Prisma client — it has the PrismaPg driver adapter
// configured with DATABASE_URL. In Prisma 7, a bare new PrismaClient() fails
// because the datasource URL was moved from schema.prisma to prisma.config.ts
// (which only the Prisma CLI reads, not the runtime client).
const defaultPrisma = require('../lib/prisma');

const BCRYPT_ROUNDS = 10;

/**
 * Bootstraps the superadmin account from env vars on every boot.
 * If SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD are not set, nothing is created.
 */
async function seedFoundationData(externalPrisma) {
  const prisma = externalPrisma || defaultPrisma;

  // ─── Super admin user (AdminUser table) ───────────────────────────────────
  // Env vars are authoritative — always sync username + password on every boot.
  const rawSuperUsername = env.SUPERADMIN_USERNAME;
  const rawSuperPassword = env.SUPERADMIN_PASSWORD;
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
    .finally(() => defaultPrisma.$disconnect());
}
