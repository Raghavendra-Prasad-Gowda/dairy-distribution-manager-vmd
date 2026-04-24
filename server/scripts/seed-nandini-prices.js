'use strict';

/**
 * seed-nandini-prices.js
 *
 * Updates Nandini products with cost prices, selling prices, and correct
 * container info sourced from the client's hand-written rate chart.
 *
 * Covers 49 of the 140 Nandini products (the ones the client actively stocks).
 * Remaining products are left with costPrice = 0 until data is available.
 *
 * Guard: skips if 49+ Nandini products already have costPrice > 0.
 *
 * Usage:
 *   cd server && node scripts/seed-nandini-prices.js
 */

const prisma = require('../lib/prisma');

// name must exactly match the product name in the DB (from seed-nandini.js)
const PRICE_DATA = [
  // ── TONED / HOMOGENISED MILK ───────────────────────────────────────────────
  { name: 'Toned Milk 1000ml',           costPrice:  43.00,  sellingPrice:  46, containerType: 'crate', unitsPerContainer: 12 },
  { name: 'Homoginsed Milk 500ml',       costPrice:  22.45,  sellingPrice:  24, containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Homoginsed Milk 250ml',       costPrice:  13.125, sellingPrice:  14, containerType: 'crate', unitsPerContainer: 48 },
  { name: 'Homogensed Cow Milk 500ml',   costPrice:  24.35,  sellingPrice:  26, containerType: 'crate', unitsPerContainer: 48 },

  // ── SHUBAM / SAMRUDHI ─────────────────────────────────────────────────────
  { name: 'Shubam Milk 500ml',           costPrice:  25.30,  sellingPrice:  27, containerType: 'crate', unitsPerContainer: 48 },
  { name: 'Samrudhi 500ml',              costPrice:  26.25,  sellingPrice:  28, containerType: 'crate', unitsPerContainer: 24 },

  // ── NANDINI SPECIAL MILK ──────────────────────────────────────────────────
  { name: 'Nandini Special Milk 1000ml', costPrice:  48.30,  sellingPrice:  52, containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Nandini Special Milk 500ml',  costPrice:  25.15,  sellingPrice:  27, containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Nandini Special Milk 250ml',  costPrice:  13.83,  sellingPrice:  15, containerType: 'crate', unitsPerContainer: 48 },

  // ── CURD ──────────────────────────────────────────────────────────────────
  { name: 'Curd 200g',                   costPrice:  11.79,  sellingPrice:  13, containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Curd 500g',                   costPrice:  25.34,  sellingPrice:  28, containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Curd 1kg',                    costPrice:  48.84,  sellingPrice:  54, containerType: 'crate', unitsPerContainer: 12 },

  // ── LASSI / BUTTER MILK ───────────────────────────────────────────────────
  { name: 'Lassi 200ml',                 costPrice:  12.50,  sellingPrice:  14, containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Mango Lassi 180ml',           costPrice:  12.17,  sellingPrice:  15, containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Masala Majjige 200ml',        costPrice:   8.33,  sellingPrice:  10, containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Ragi Ambli 200ml',            costPrice:   7.54,  sellingPrice:   9, containerType: 'crate', unitsPerContainer: 60 },

  // ── PEDA ──────────────────────────────────────────────────────────────────
  { name: 'Peda 25g',                    costPrice:  12.50,  sellingPrice:  14 },
  { name: 'Peda 100g',                   costPrice:  57.57,  sellingPrice:  60 },
  { name: 'Peda 250g',                   costPrice: 125.00,  sellingPrice: 140 },

  // ── MYSORE PAK ────────────────────────────────────────────────────────────
  { name: 'Mysore Pak 25g',              costPrice:  13.39,  sellingPrice:  15 },
  { name: 'Mysore Pak 100g',             costPrice:  53.57,  sellingPrice:  60 },
  { name: 'Mysore Pak 250g',             costPrice: 142.86,  sellingPrice: 160 },
  { name: 'Mysore Pak 500g',             costPrice: 250.00,  sellingPrice: 280 },

  // ── CASHEW BURFY ──────────────────────────────────────────────────────────
  { name: 'Cashew Burfy 100g',           costPrice:  80.36,  sellingPrice:  90 },
  { name: 'Cashew Burfy 250g',           costPrice: 200.89,  sellingPrice: 225 },

  // ── BADAM HALWA ───────────────────────────────────────────────────────────
  { name: 'Badam Halwa 100g',            costPrice:  53.57,  sellingPrice:  60 },

  // ── GHEE (pouch / regular) ────────────────────────────────────────────────
  { name: 'Ghee 12ml',                   costPrice:   9.71,  sellingPrice:  11 },
  { name: 'Ghee 200ml',                  costPrice: 140.91,  sellingPrice: 155 },
  { name: 'Ghee 500ml',                  costPrice: 318.18,  sellingPrice: 350 },
  { name: 'Ghee 1000ml',                 costPrice: 636.36,  sellingPrice: 700 },

  // ── GHEE (jar) ────────────────────────────────────────────────────────────
  { name: 'Ghee 50ml Jar',               costPrice:  47.27,  sellingPrice:  52 },
  { name: 'Ghee 100ml Jar',              costPrice:  77.27,  sellingPrice:  85 },

  // ── GHEE (pet jar) ────────────────────────────────────────────────────────
  { name: 'Ghee Pet Jar 200ml',          costPrice: 150.00,  sellingPrice: 165 },
  { name: 'Ghee Pet Jar 500ml',          costPrice: 329.28,  sellingPrice: 360 },
  { name: 'Ghee Pet Jar 1000ml',         costPrice: 654.58,  sellingPrice: 720 },
  { name: 'Ghee Pet Jar 5L',             costPrice: 3233.95, sellingPrice: 3525 },

  // ── T-BUTTER ──────────────────────────────────────────────────────────────
  { name: 'T-Butter 8g',                 costPrice:   4.46,  sellingPrice:   5 },
  { name: 'T-Butter 10g',                costPrice:   5.36,  sellingPrice:   6 },
  { name: 'T-Butter Salted 100g',        costPrice:  55.25,  sellingPrice:  62 },
  { name: 'T-Butter Unsalted 200g',      costPrice: 107.14,  sellingPrice: 120 },
  { name: 'T-Butter Unsalted 500g',      costPrice: 271.28,  sellingPrice: 305 },

  // ── KHOVA ─────────────────────────────────────────────────────────────────
  { name: 'Khova 200g',                  costPrice:  78.26,  sellingPrice:  90 },
  { name: 'Khova 1kg',                   costPrice: 357.14,  sellingPrice: 400 },
  { name: 'Khova 5kg',                   costPrice: 1850.00, sellingPrice: 1850 },

  // ── PANEER ────────────────────────────────────────────────────────────────
  { name: 'Paneer 200g',                 costPrice:  81.42,  sellingPrice:  96 },
  { name: 'Paneer 500g',                 costPrice: 179.04,  sellingPrice: 211 },
  { name: 'Paneer 1kg',                  costPrice: 352.12,  sellingPrice: 408 },

  // ── STERILISED FLAVOURED MILK ─────────────────────────────────────────────
  { name: 'SFM Pet Bottle Badam 180ml',      costPrice: 20.83, sellingPrice: 25 },
  { name: 'SFM Pet Bottle Strawberry 180ml', costPrice: 20.82, sellingPrice: 25 },

  // ── GOOD LIFE ─────────────────────────────────────────────────────────────
  { name: 'Good Life Milk 500ml',        costPrice:  28.22,  sellingPrice:  31 },
  { name: 'Good Life Fino 180ml',        costPrice:  11.87,  sellingPrice:  13 },
];

async function seedNandiniPrices() {
  const brand = await prisma.brand.findFirst({ where: { name: 'Nandini' } });
  if (!brand) throw new Error('Nandini brand not found');

  // Guard: skip if 49+ active products already have a non-zero cost price
  const pricedCount = await prisma.product.count({
    where: { brandId: brand.id, isActive: true, costPrice: { gt: 0 } },
  });
  if (pricedCount >= PRICE_DATA.length) {
    console.log(`Nandini prices already set (${pricedCount} products priced) — skipping.`);
    return;
  }

  console.log('💰  Updating Nandini product prices and container info…');

  const stockedNames = new Set(PRICE_DATA.map(p => p.name));
  let updated = 0;
  let notFound = 0;

  for (const entry of PRICE_DATA) {
    const product = await prisma.product.findFirst({
      where: { brandId: brand.id, name: entry.name, isActive: true },
    });

    if (!product) {
      console.warn(`  ⚠️  Not found: "${entry.name}"`);
      notFound++;
      continue;
    }

    const data = {
      costPrice:          entry.costPrice,
      sellingPrice:       entry.sellingPrice,
      showInStockReceipt: true,
    };
    if (entry.containerType)     data.containerType     = entry.containerType;
    if (entry.unitsPerContainer) data.unitsPerContainer = entry.unitsPerContainer;

    await prisma.product.update({ where: { id: product.id }, data });
    updated++;
  }

  // Hide all other active Nandini products from the stock receipt
  const { count: hidden } = await prisma.product.updateMany({
    where: {
      brandId:            brand.id,
      isActive:           true,
      showInStockReceipt: true,
      name:               { notIn: [...stockedNames] },
    },
    data: { showInStockReceipt: false },
  });

  console.log(`  ✅  Updated ${updated} products${notFound ? `, ⚠️  ${notFound} not found` : ''}`);
  console.log(`  👁️   Hidden ${hidden} non-stocked products from stock receipt`);
}

module.exports = { seedNandiniPrices };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  seedNandiniPrices()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
