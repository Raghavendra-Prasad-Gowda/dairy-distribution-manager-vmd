'use strict';

/**
 * reseed-nandini.js
 *
 * Runs exactly once per deployment environment, guarded by a _seed_log row.
 * Clears all existing Nandini products and re-seeds with the latest catalogue
 * and prices.
 *
 * Called automatically from index.js on startup.
 * Also safe to run manually: cd server && node scripts/reseed-nandini.js
 */

const prisma = require('../lib/prisma');
const { seedNandiniProducts } = require('./seed-nandini');
const { seedNandiniPrices }   = require('./seed-nandini-prices');

const SEED_KEY = 'nandini_reseed_v1';

async function reseedNandiniOnce() {
  // Create the log table if it doesn't exist yet (idempotent)
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS _seed_log (
      key      TEXT PRIMARY KEY,
      ran_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const rows = await prisma.$queryRaw`
    SELECT key FROM _seed_log WHERE key = ${SEED_KEY}
  `;
  if (rows.length > 0) {
    console.log(`Nandini reseed already ran (${SEED_KEY}) — skipping.`);
    return;
  }

  // Archive active products so the seed guard in seed-nandini.js passes
  const brand = await prisma.brand.findFirst({ where: { name: 'Nandini' } });
  if (!brand) throw new Error('Nandini brand not found');

  const { count } = await prisma.product.updateMany({
    where: { brandId: brand.id, isActive: true },
    data:  { isActive: false },
  });
  console.log(`Nandini reseed: archived ${count} active products — re-seeding…`);

  await seedNandiniProducts();
  await seedNandiniPrices();

  await prisma.$executeRaw`
    INSERT INTO _seed_log (key) VALUES (${SEED_KEY})
  `;
  console.log(`Nandini reseed complete — logged as ${SEED_KEY}.`);
}

module.exports = { reseedNandiniOnce };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  reseedNandiniOnce()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
