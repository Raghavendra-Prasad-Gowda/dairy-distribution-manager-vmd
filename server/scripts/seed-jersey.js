/**
 * One-time seed: Jersey brand products
 *
 * Safe to run multiple times — skips if 11+ active Jersey products already exist.
 *
 * Run manually:
 *   cd server && node scripts/seed-jersey.js
 */

const prisma = require('../lib/prisma');

const JERSEY_CATEGORIES = [
  'HOMOGENISED TONED MILK',
  'STANDARDISED MILK',
  'HOMOGENISED FULL CREAM MILK',
  'CURD',
  'BUTTER MILK',
];

const JERSEY_PRODUCTS = [
  // ── HOMOGENISED TONED MILK ───────────────────────────────────────────────
  { name: 'HTM 1000ml', category: 'HOMOGENISED TONED MILK', unitType: 'ml',    unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, sellingPrice: 58.00 },
  { name: 'HTM 500ml',  category: 'HOMOGENISED TONED MILK', unitType: 'ml',    unitSize: 500,  containerType: 'crate', unitsPerContainer: 24, sellingPrice: 25.00 },
  { name: 'HTM 225ml',  category: 'HOMOGENISED TONED MILK', unitType: 'ml',    unitSize: 225,  containerType: 'crate', unitsPerContainer: 52, sellingPrice: 14.00 },

  // ── STANDARDISED MILK ────────────────────────────────────────────────────
  { name: 'STM 1000ml', category: 'STANDARDISED MILK',      unitType: 'ml',    unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, sellingPrice: 60.00 },
  { name: 'STM 500ml',  category: 'STANDARDISED MILK',      unitType: 'ml',    unitSize: 500,  containerType: 'crate', unitsPerContainer: 24, sellingPrice: 30.00 },

  // ── HOMOGENISED FULL CREAM MILK ──────────────────────────────────────────
  { name: 'HFCM 500ml',  category: 'HOMOGENISED FULL CREAM MILK', unitType: 'ml', unitSize: 500,  containerType: 'crate', unitsPerContainer: 24, sellingPrice: 35.00 },
  { name: 'HFCM 1000ml', category: 'HOMOGENISED FULL CREAM MILK', unitType: 'ml', unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, sellingPrice: 70.00 },

  // ── CURD ─────────────────────────────────────────────────────────────────
  { name: 'DTM Curd 1000g', category: 'CURD', unitType: 'gram', unitSize: 1000, containerType: 'crate', unitsPerContainer: 12, sellingPrice: 60.00 },
  { name: 'DTM Curd 450g',  category: 'CURD', unitType: 'gram', unitSize: 450,  containerType: 'crate', unitsPerContainer: 26, sellingPrice: 30.00 },
  { name: 'DTM Curd 140g',  category: 'CURD', unitType: 'gram', unitSize: 140,  containerType: 'crate', unitsPerContainer: 84, sellingPrice: 10.00 },

  // ── BUTTER MILK ──────────────────────────────────────────────────────────
  { name: 'Butter Milk', category: 'BUTTER MILK', unitType: 'piece', unitSize: null, containerType: null, unitsPerContainer: null, sellingPrice: 10.00 },
];

async function seedJerseyProducts() {
  const brand = await prisma.brand.findFirst({ where: { name: 'Jersey' } });
  if (!brand) throw new Error('Jersey brand not found in database');

  const activeCount = await prisma.product.count({
    where: { brandId: brand.id, isActive: true },
  });

  if (activeCount >= 11) {
    console.log(`Jersey seed already applied (${activeCount} active products) — skipping.`);
    return;
  }

  console.log('Seeding Jersey products…');

  // ── 1. Archive existing active products (rename to avoid unique constraint) ──
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
    console.log(`Archived ${existing.length} existing Jersey products.`);
  }

  // ── 2. Remove old categories ──────────────────────────────────────────────
  await prisma.category.deleteMany({ where: { brandId: brand.id } });
  console.log('Cleared existing Jersey categories.');

  // ── 3. Create new categories ──────────────────────────────────────────────
  for (const name of JERSEY_CATEGORIES) {
    await prisma.category.create({ data: { brandId: brand.id, name } });
  }
  console.log(`Created ${JERSEY_CATEGORIES.length} categories.`);

  // ── 4. Create products ────────────────────────────────────────────────────
  await prisma.product.createMany({
    data: JERSEY_PRODUCTS.map(p => ({
      brandId:           brand.id,
      name:              p.name,
      category:          p.category,
      unitType:          p.unitType,
      unitSize:          p.unitSize,
      containerType:     p.containerType,
      unitsPerContainer: p.unitsPerContainer,
      costPrice:         0,
      sellingPrice:      p.sellingPrice,
      isActive:          true,
      showInStockReceipt: true,
    })),
  });

  console.log(`Created ${JERSEY_PRODUCTS.length} Jersey products.`);
  console.log('Jersey seed complete.');
}

module.exports = { seedJerseyProducts };

if (require.main === module) {
  seedJerseyProducts()
    .then(() => { prisma.$disconnect(); process.exit(0); })
    .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
}
