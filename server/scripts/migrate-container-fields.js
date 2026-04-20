/**
 * One-time data migration: populate containerType + unitsPerContainer
 * from existing mlPerCrate / unitSize values.
 *
 * Safe to run multiple times — skips if already migrated.
 */

const prisma = require('../lib/prisma');

async function migrateContainerFields() {
  const alreadyMigrated = await prisma.product.count({
    where: { containerType: { not: null } },
  });

  if (alreadyMigrated > 0) {
    console.log(`Container fields already migrated (${alreadyMigrated} products) — skipping.`);
    return;
  }

  const products = await prisma.product.findMany({
    where: {
      mlPerCrate:  { not: null },
      unitSize:    { not: null },
    },
  });

  if (products.length === 0) {
    console.log('No products with mlPerCrate to migrate.');
    return;
  }

  let migrated = 0;
  for (const p of products) {
    const unitsPerContainer = Math.round(p.mlPerCrate / p.unitSize);
    if (unitsPerContainer > 0) {
      await prisma.product.update({
        where: { id: p.id },
        data:  { containerType: 'crate', unitsPerContainer },
      });
      migrated++;
    }
  }

  console.log(`Migrated ${migrated} products: mlPerCrate → containerType/unitsPerContainer.`);
}

module.exports = { migrateContainerFields };

if (require.main === module) {
  migrateContainerFields()
    .then(() => { prisma.$disconnect(); process.exit(0); })
    .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
}
