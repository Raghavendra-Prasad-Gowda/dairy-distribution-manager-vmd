/**
 * One-time seed: Gowardhan brand products
 *
 * Safe to run multiple times — skips if 8+ active Gowardhan products already exist.
 *
 * Run manually:
 *   cd server && node scripts/seed-gowardhan.js
 */

const prisma = require('../lib/prisma');

const GOWARDHAN_CATEGORIES = [
  'TONED MILK',
  'CURD',
  'TEA SPECIAL',
];

const GOWARDHAN_PRODUCTS = [
  // ── TONED MILK ───────────────────────────────────────────────────────────
  { name: 'TM 1000ml', category: 'TONED MILK', unitType: 'ml', unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, costPrice: 42.08, sellingPrice: 50.00 },
  { name: 'TM 450ml',  category: 'TONED MILK', unitType: 'ml', unitSize: 450,  containerType: 'crate', unitsPerContainer: 24, costPrice: 21.04, sellingPrice: 25.00 },
  { name: 'TM 225ml',  category: 'TONED MILK', unitType: 'ml', unitSize: 225,  containerType: 'crate', unitsPerContainer: 52, costPrice: 11.30, sellingPrice: 14.00 },

  // ── CURD ─────────────────────────────────────────────────────────────────
  { name: 'Curd 1000ml',    category: 'CURD', unitType: 'ml',   unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, costPrice: 50.80, sellingPrice: 60.00 },
  { name: 'DTM Curd 200g',  category: 'CURD', unitType: 'gram', unitSize: 200,  containerType: 'crate', unitsPerContainer: 60, costPrice:  9.37, sellingPrice: 14.00 },
  { name: 'DTM Curd 500g',  category: 'CURD', unitType: 'gram', unitSize: 500,  containerType: 'crate', unitsPerContainer: 24, costPrice: 22.88, sellingPrice: 30.00 },
  { name: 'Curd 1000g',     category: 'CURD', unitType: 'gram', unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, costPrice: 45.35, sellingPrice: 60.00 },

  // ── TEA SPECIAL ──────────────────────────────────────────────────────────
  { name: 'Tea Special 1000ml', category: 'TEA SPECIAL', unitType: 'ml', unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, costPrice: 56.00, sellingPrice: 60.00 },
];

async function seedGowardhanProducts() {
  const brand = await prisma.brand.findFirst({ where: { name: 'Gowardhan' } });
  if (!brand) throw new Error('Gowardhan brand not found in database');

  const activeCount = await prisma.product.count({
    where: { brandId: brand.id, isActive: true },
  });

  if (activeCount >= 8) {
    console.log(`Gowardhan seed already applied (${activeCount} active products) — skipping.`);
    return;
  }

  console.log('Seeding Gowardhan products…');

  // ── 1. Archive existing active products ──────────────────────────────────
  const existing = await prisma.product.findMany({
    where: { brandId: brand.id, isActive: true },
  });

  if (existing.length > 0) {
    const ts = Date.now();
    for (const p of existing) {
      await prisma.product.update({
        where: { id: p.id },
        data:  { name: `${p.name} [archived-${ts}]`, isActive: false },
      });
    }
    console.log(`Archived ${existing.length} existing Gowardhan products.`);
  }

  // ── 2. Remove old categories ──────────────────────────────────────────────
  await prisma.category.deleteMany({ where: { brandId: brand.id } });
  console.log('Cleared existing Gowardhan categories.');

  // ── 3. Create new categories ──────────────────────────────────────────────
  for (const name of GOWARDHAN_CATEGORIES) {
    await prisma.category.create({ data: { brandId: brand.id, name } });
  }
  console.log(`Created ${GOWARDHAN_CATEGORIES.length} categories.`);

  // ── 4. Create products ────────────────────────────────────────────────────
  await prisma.product.createMany({
    data: GOWARDHAN_PRODUCTS.map(p => ({
      brandId:            brand.id,
      name:               p.name,
      category:           p.category,
      unitType:           p.unitType,
      unitSize:           p.unitSize,
      containerType:      p.containerType,
      unitsPerContainer:  p.unitsPerContainer,
      costPrice:          p.costPrice,
      sellingPrice:       p.sellingPrice,
      isActive:           true,
      showInStockReceipt: true,
    })),
  });

  console.log(`Created ${GOWARDHAN_PRODUCTS.length} Gowardhan products.`);
  console.log('Gowardhan seed complete.');
}

module.exports = { seedGowardhanProducts };

if (require.main === module) {
  seedGowardhanProducts()
    .then(() => { prisma.$disconnect(); process.exit(0); })
    .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
}
