'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// Support being called from index.js (shared client) or standalone (own client)
let _ownClient = null;
function getClient(externalClient) {
  if (externalClient) return externalClient;
  if (!_ownClient) _ownClient = new PrismaClient();
  return _ownClient;
}
const BCRYPT_ROUNDS = 10;

/**
 * Idempotent — creates brands, products, and admin account if they don't exist.
 * Safe to call on every deployment startup.
 */
async function seedFoundationData(externalPrisma) {
  const prisma = getClient(externalPrisma);
  console.log('🌱 Seeding foundation data (brands, products, admin)...');

  // ─── Brands ───────────────────────────────────────────────────────────────
  const nandini = await prisma.brand.upsert({
    where: { name: 'Nandini' },
    update: {},
    create: { name: 'Nandini' },
  });
  const jersey = await prisma.brand.upsert({
    where: { name: 'Jersey' },
    update: {},
    create: { name: 'Jersey' },
  });
  const gowardhan = await prisma.brand.upsert({
    where: { name: 'Gowardhan' },
    update: {},
    create: { name: 'Gowardhan' },
  });

  // ─── Nandini Products (13) ────────────────────────────────────────────────
  const nandiniProducts = [
    'HM', 'TM', 'QM', 'HCM', 'Red',
    'NSM 1000', 'NSM 500', 'NSM 250',
    'Curd 1000', 'Curd 500', 'Curd 250',
    'MM', 'Lassi',
  ];
  for (const name of nandiniProducts) {
    await prisma.product.upsert({
      where: { brandId_name: { brandId: nandini.id, name } },
      update: {},
      create: { brandId: nandini.id, name, costPrice: 0, sellingPrice: 0 },
    });
  }

  // ─── Jersey Products (7) ──────────────────────────────────────────────────
  const jerseyProducts = ['M', 'QTR', 'FCM 1000', 'FCM 500', 'BC', 'SC', 'MM'];
  for (const name of jerseyProducts) {
    await prisma.product.upsert({
      where: { brandId_name: { brandId: jersey.id, name } },
      update: {},
      create: { brandId: jersey.id, name, costPrice: 0, sellingPrice: 0 },
    });
  }

  // ─── Gowardhan Products (4) ───────────────────────────────────────────────
  const gowardhanProducts = ['M', 'QTR', 'BC', 'SC'];
  for (const name of gowardhanProducts) {
    await prisma.product.upsert({
      where: { brandId_name: { brandId: gowardhan.id, name } },
      update: {},
      create: { brandId: gowardhan.id, name, costPrice: 0, sellingPrice: 0 },
    });
  }

  // ─── App Settings (admin password) ────────────────────────────────────────
  const rawUsername = process.env.ADMIN_USERNAME || 'admin';
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

  const existing = await prisma.appSettings.findFirst();
  if (!existing) {
    await prisma.appSettings.create({
      data: { businessName: 'Vikas Milk Dairy', username: rawUsername, passwordHash },
    });
    console.log(`✅ Created AppSettings with user: ${rawUsername} and password: ${rawPassword}`);
  } else {
    console.log('ℹ️  AppSettings already exists — skipping password seed');
  }

  console.log(`✅ Seeded: 3 brands, ${nandiniProducts.length + jerseyProducts.length + gowardhanProducts.length} products`);
}

module.exports = { seedFoundationData };

// Allow running standalone: node prisma/seed.js
if (require.main === module) {
  seedFoundationData()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(() => {
      if (_ownClient) _ownClient.$disconnect();
    });
}
