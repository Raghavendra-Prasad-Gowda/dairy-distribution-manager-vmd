const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

async function main() {
  console.log('🌱 Seeding database...');

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
      create: { brandId: nandini.id, name, dairyPrice: 0 },
    });
  }

  // ─── Jersey Products (7) ──────────────────────────────────────────────────
  const jerseyProducts = ['M', 'QTR', 'FCM 1000', 'FCM 500', 'BC', 'SC', 'MM'];
  for (const name of jerseyProducts) {
    await prisma.product.upsert({
      where: { brandId_name: { brandId: jersey.id, name } },
      update: {},
      create: { brandId: jersey.id, name, dairyPrice: 0 },
    });
  }

  // ─── Gowardhan Products (4) ───────────────────────────────────────────────
  const gowardhanProducts = ['M', 'QTR', 'BC', 'SC'];
  for (const name of gowardhanProducts) {
    await prisma.product.upsert({
      where: { brandId_name: { brandId: gowardhan.id, name } },
      update: {},
      create: { brandId: gowardhan.id, name, dairyPrice: 0 },
    });
  }

  // ─── App Settings (admin password) ────────────────────────────────────────
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

  const existing = await prisma.appSettings.findFirst();
  if (!existing) {
    await prisma.appSettings.create({
      data: { businessName: 'Vikas Milk Dairy', username: 'admin', passwordHash },
    });
    console.log(`✅ Created AppSettings with user: admin and password: ${rawPassword}`);
  } else {
    console.log('ℹ️  AppSettings already exists — skipping password seed');
  }

  console.log(`✅ Seeded: 3 brands, ${nandiniProducts.length + jerseyProducts.length + gowardhanProducts.length} products`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
