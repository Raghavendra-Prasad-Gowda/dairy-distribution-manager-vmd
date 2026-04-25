'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

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

  // ─── Admin user ───────────────────────────────────────────────────────────
  const existing = await prisma.appSettings.findFirst();
  if (!existing) {
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('⚠️  ADMIN_PASSWORD env var not set — admin account will use insecure default password. Set this in production.');
    }
    const rawUsername = process.env.ADMIN_USERNAME || 'admin';
    const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
    await prisma.appSettings.create({
      data: { businessName: 'Vikas Milk Dairy', username: rawUsername, passwordHash },
    });
    console.log(`✅ Created admin user: ${rawUsername}`);
  }
}

module.exports = { seedFoundationData };

// Allow running standalone: node prisma/seed.js
if (require.main === module) {
  seedFoundationData()
    .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
    .finally(() => { if (_ownClient) _ownClient.$disconnect(); });
}
