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
 * Brings the superadmin account in line with SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD.
 *
 * The account is found by the env USERNAME first, so a deployment that already has that login (possibly with a
 * second superadmin alongside it) only gets its password synced and can never collide with itself. Only when no
 * account has that username is the lowest-id superadmin renamed to it, or one created when none exists.
 * A username held by a non-superadmin is never promoted: that is a configuration mistake, so it stops with a
 * message that says what to change.
 */
async function syncSuperAdmin(prisma, username, password) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const sameName = await prisma.adminUser.findUnique({ where: { username } });
  if (sameName) {
    if (sameName.role !== 'superadmin') {
      throw new Error(
        `SUPERADMIN_USERNAME "${username}" already belongs to a ${sameName.role} account. ` +
        'Set SUPERADMIN_USERNAME to the superadmin\'s own username (or remove the variable) and redeploy.'
      );
    }
    await prisma.adminUser.update({ where: { id: sameName.id }, data: { passwordHash } });
    logger.info('Synced superadmin password from env vars', { username });
    return;
  }

  const firstSuperAdmin = await prisma.adminUser.findFirst({
    where: { role: 'superadmin' },
    orderBy: { id: 'asc' }, // deterministic: never depends on physical row order
  });
  if (firstSuperAdmin) {
    await prisma.adminUser.update({ where: { id: firstSuperAdmin.id }, data: { username, passwordHash } });
    logger.info('Renamed superadmin and synced credentials from env vars', { username });
  } else {
    await prisma.adminUser.create({ data: { username, passwordHash, role: 'superadmin' } });
    logger.info('Created superadmin user', { username });
  }
}

/**
 * Bootstraps the superadmin account from env vars on every boot.
 * If SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD are not set, nothing is created.
 */
async function seedFoundationData(externalPrisma) {
  const prisma = externalPrisma || defaultPrisma;

  // ─── Super admin user (AdminUser table) ───────────────────────────────────
  // Env vars are authoritative — the superadmin's credentials are synced on every boot.
  const rawSuperUsername = env.SUPERADMIN_USERNAME;
  const rawSuperPassword = env.SUPERADMIN_PASSWORD;
  if (rawSuperUsername && rawSuperPassword) {
    await syncSuperAdmin(prisma, rawSuperUsername, rawSuperPassword);
  } else {
    logger.info('SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD not set — skipping superadmin seed');
  }

  // ─── Edit PIN (AppSettings table) ─────────────────────────────────────────
  // Only seed a PIN row if none exists yet. This preserves any PIN the
  // superadmin has already changed via the UI on subsequent deploys.
  // On the very first deploy, falls back to EDIT_PIN env var (or '123456').
  const existingPin = await prisma.appSettings.findUnique({ where: { key: 'edit_pin' } });
  if (!existingPin) {
    const source = env.EDIT_PIN ?? '123456';
    const pinHash = await bcrypt.hash(source, BCRYPT_ROUNDS);
    await prisma.appSettings.create({ data: { key: 'edit_pin', value: pinHash } });
    logger.info('Seeded edit PIN from env var (first deploy)');
  }

  // ─── P&L PIN (AppSettings table) ─────────────────────────────────────────
  // A separate, independently-changeable PIN for the P&L report.
  // Seeded from the same env var / default as the edit PIN on first deploy.
  const existingPlPin = await prisma.appSettings.findUnique({ where: { key: 'pl_pin' } });
  if (!existingPlPin) {
    const src = env.EDIT_PIN ?? '123456';
    const plPinHash = await bcrypt.hash(src, BCRYPT_ROUNDS);
    await prisma.appSettings.create({ data: { key: 'pl_pin', value: plPinHash } });
    logger.info('Seeded P&L PIN from env var (first deploy)');
  }

  // ─── P&L PIN gate toggle (AppSettings table) ──────────────────────────────
  // Default: enabled. The superadmin can toggle this off via the UI.
  const existingPlPinSetting = await prisma.appSettings.findUnique({ where: { key: 'pl_pin_enabled' } });
  if (!existingPlPinSetting) {
    await prisma.appSettings.create({ data: { key: 'pl_pin_enabled', value: 'true' } });
    logger.info('Seeded pl_pin_enabled = true (default on)');
  }
}

module.exports = { seedFoundationData, syncSuperAdmin };

// Allow running standalone: node prisma/seed.js
if (require.main === module) {
  seedFoundationData()
    .catch((e) => { logger.error('Seed failed', { message: e.message, stack: e.stack }); process.exit(1); })
    .finally(() => defaultPrisma.$disconnect());
}
