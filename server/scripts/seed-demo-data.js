/**
 * seed-demo-data.js
 *
 * One-time demo seeder that:
 *  1. Updates realistic dairy purchase prices for all 24 products
 *  2. Creates 29 salespeople from the hand-written register
 *  3. Sets per-salesperson selling prices for every product (effective 2026-01-01)
 *     with varied margins to simulate loyalty-based pricing
 *
 * Safe to re-run — all operations use upsert / skipDuplicates.
 *
 * Usage:
 *   cd server && node scripts/seed-demo-data.js
 */

'use strict';

const { PrismaClient } = require('@prisma/client');

// Support being called from index.js (shared client) or standalone (own client)
let _ownClient = null;
function getClient(externalClient) {
  if (externalClient) return externalClient;
  if (!_ownClient) _ownClient = new PrismaClient();
  return _ownClient;
}

// ─── Dairy purchase prices (what the client pays the dairy) ──────────────────
//
// These are the rates at which the distributor receives stock from each brand.
// Prices are in ₹ and reflect typical Karnataka / South-India market rates.

const DAIRY_PRICES = {
  Nandini: {
    'HM':       24.00,   // Half-litre milk pouch
    'TM':       22.00,   // Toned milk
    'QM':       12.00,   // Quarter-litre milk
    'HCM':      26.00,   // Homogenised cow milk
    'Red':      30.00,   // Red label premium milk
    'NSM 1000': 54.00,   // Nandini special milk 1 L
    'NSM 500':  27.00,   // 500 ml
    'NSM 250':  14.00,   // 250 ml
    'Curd 1000':52.00,   // Curd 1 kg
    'Curd 500': 28.00,   // Curd 500 g
    'Curd 250': 16.00,   // Curd 250 g
    'MM':       34.00,   // Masala / flavoured milk
    'Lassi':    30.00,   // Lassi pouch
  },
  Jersey: {
    'M':        52.00,   // 1 L milk
    'QTR':      26.00,   // 500 ml milk
    'FCM 1000': 68.00,   // Full cream milk 1 L
    'FCM 500':  34.00,   // Full cream milk 500 ml
    'BC':       28.00,   // Buttermilk / butter curd
    'SC':       62.00,   // Special curd
    'MM':       38.00,   // Flavoured milk
  },
  Gowardhan: {
    'M':        56.00,   // 1 L milk
    'QTR':      28.00,   // 500 ml milk
    'BC':       32.00,   // Buttermilk / butter curd
    'SC':       68.00,   // Special curd
  },
};

// ─── Salespeople from the hand-written register ───────────────────────────────
//
// Names are taken exactly as written in the daily distribution sheet.
// Routes are assigned A–AC for now; can be updated in the app.

const SALESPEOPLE = [
  { name: 'K Pandu',      route: 'Route A' },
  { name: 'Hari',         route: 'Route B' },
  { name: 'Seena',        route: 'Route C' },
  { name: 'Vitala',       route: 'Route D' },
  { name: 'Nagraj',       route: 'Route E' },
  { name: 'Sukhan',       route: 'Route F' },
  { name: 'Shabari',      route: 'Route G' },
  { name: 'S Manu',       route: 'Route H' },
  { name: 'Sidhu',        route: 'Route I' },
  { name: 'Nagarle',      route: 'Route J' },
  { name: 'Raju',         route: 'Route K' },
  { name: 'Chethan',      route: 'Route L' },
  { name: 'P Swamy',      route: 'Route M' },
  { name: 'GPK',          route: 'Route N' },
  { name: 'Madappa',      route: 'Route O' },
  { name: 'Madhu',        route: 'Route P' },
  { name: 'Subanna',      route: 'Route Q' },
  { name: 'Rashid',       route: 'Route R' },
  { name: 'Jyothi',       route: 'Route S' },
  { name: 'Mah Jss',      route: 'Route T' },
  { name: 'Apsar Manik',  route: 'Route U' },
  { name: 'Sridhar',      route: 'Route V' },
  { name: 'Mysore',       route: 'Route W' },
  { name: 'Sky',          route: 'Route X' },
  { name: 'AT&S',         route: 'Route Y' },
  { name: 'Rishi',        route: 'Route Z' },
  { name: 'Sathym',       route: 'Route AA' },
  { name: 'Bas',          route: 'Route AB' },
  { name: 'KB',           route: 'Route AC' },
];

// ─── Per-salesperson selling price margins (above dairy cost) ─────────────────
//
// The distributor sets different selling prices per salesperson based on loyalty,
// volume, and relationship. Higher margin = salesperson pays more per unit.
//
// Margin ₹1–2 : loyal, high-volume partners
// Margin ₹2–3 : regular daily customers
// Margin ₹3–4 : moderate customers
// Margin ₹4–6 : occasional / new customers

const SP_MARGINS = {
  'K Pandu':     1,
  'Hari':        1,
  'Seena':       3,
  'Vitala':      2,
  'Nagraj':      3,
  'Sukhan':      2,
  'Shabari':     3,
  'S Manu':      4,
  'Sidhu':       3,
  'Nagarle':     2,
  'Raju':        2,
  'Chethan':     1,
  'P Swamy':     2,
  'GPK':         3,
  'Madappa':     4,
  'Madhu':       3,
  'Subanna':     4,
  'Rashid':      3,
  'Jyothi':      4,
  'Mah Jss':     5,
  'Apsar Manik': 4,
  'Sridhar':     5,
  'Mysore':      4,
  'Sky':         5,
  'AT&S':        3,
  'Rishi':       4,
  'Sathym':      5,
  'Bas':         4,
  'KB':          6,
};

// Per-product price adjustments on top of the salesperson's base margin.
// Simulates the distributor charging a slightly higher markup on premium products.
const PRODUCT_EXTRA = {
  'Red':      1,
  'FCM 1000': 2,
  'FCM 500':  1,
  'SC':       2,
  'MM':       1,
  'Lassi':    1,
};

function sellingPrice(dairyPrice, spName, productName) {
  const base  = SP_MARGINS[spName] ?? 3;
  const extra = PRODUCT_EXTRA[productName] ?? 0;
  return parseFloat((dairyPrice + base + extra).toFixed(2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedDemoData(externalPrisma) {
  const prisma = getClient(externalPrisma);
  console.log('\n🌱  Demo data seeder — Vikas Milk Dairy\n');

  // 1. Load all brands
  const brands = await prisma.brand.findMany({ include: { products: true } });
  if (brands.length === 0) {
    throw new Error('No brands found — foundation data not yet seeded. Skipping demo seed.');
  }

  const brandMap = Object.fromEntries(brands.map((b) => [b.name, b]));

  // 2. Update dairy prices for every product
  console.log('📦  Updating dairy purchase prices...');
  let priceUpdateCount = 0;
  for (const [brandName, prices] of Object.entries(DAIRY_PRICES)) {
    const brand = brandMap[brandName];
    if (!brand) { console.warn(`  ⚠️  Brand "${brandName}" not found — skipping`); continue; }

    for (const [productName, price] of Object.entries(prices)) {
      const product = brand.products.find((p) => p.name === productName);
      if (!product) { console.warn(`  ⚠️  Product "${productName}" not found in ${brandName} — skipping`); continue; }

      await prisma.product.update({
        where: { id: product.id },
        data: { dairyPrice: price },
      });
      priceUpdateCount++;
    }
  }
  console.log(`  ✅  Updated ${priceUpdateCount} product prices\n`);

  // 3. Create / upsert salespeople
  console.log('👥  Creating salespeople...');
  const createdSalespeople = [];
  for (const sp of SALESPEOPLE) {
    // Upsert by name (no unique constraint on name, so find-or-create)
    let existing = await prisma.salesperson.findFirst({ where: { name: sp.name } });
    if (!existing) {
      existing = await prisma.salesperson.create({ data: sp });
      console.log(`  ➕  Created: ${sp.name}`);
    } else {
      console.log(`  ℹ️   Exists:  ${sp.name}`);
    }
    createdSalespeople.push(existing);
  }
  console.log(`  ✅  ${createdSalespeople.length} salespeople ready\n`);

  // 4. Build a flat list of all products across all brands
  const allProducts = brands.flatMap((b) =>
    b.products
      .filter((p) => p.isActive)
      .map((p) => ({ ...p, brandName: b.name }))
  );

  // 5. Set per-salesperson selling prices (effective 2026-01-01)
  const effectiveFrom = new Date('2026-01-01');
  console.log(`💰  Setting per-salesperson selling prices (effective 2026-01-01)...`);

  let totalPricesSet = 0;
  for (const sp of createdSalespeople) {
    const pricesPayload = [];
    for (const product of allProducts) {
      const dairyPriceConfig = DAIRY_PRICES[product.brandName]?.[product.name];
      if (dairyPriceConfig === undefined) continue;   // skip unrecognised products
      const price = sellingPrice(dairyPriceConfig, sp.name, product.name);

      pricesPayload.push(
        prisma.salespersonPrice.upsert({
          where: {
            salespersonId_productId_effectiveFrom: {
              salespersonId: sp.id,
              productId:     product.id,
              effectiveFrom,
            },
          },
          update:  { sellingPrice: price },
          create:  { salespersonId: sp.id, productId: product.id, sellingPrice: price, effectiveFrom },
        })
      );
    }

    await prisma.$transaction(pricesPayload);
    totalPricesSet += pricesPayload.length;
    console.log(`  ✅  ${sp.name.padEnd(14)} — ${pricesPayload.length} prices set (margin +₹${SP_MARGINS[sp.name] ?? 3}/unit base)`);
  }

  console.log(`\n🎉  Done! Summary:`);
  console.log(`   • ${priceUpdateCount} product dairy prices updated`);
  console.log(`   • ${createdSalespeople.length} salespeople seeded`);
  console.log(`   • ${totalPricesSet} salesperson selling prices configured`);
  console.log('\n   You can now log in and start entering daily stock receipts.\n');
}

module.exports = { seedDemoData };

// Allow running standalone: node scripts/seed-demo-data.js
if (require.main === module) {
  seedDemoData()
    .catch((e) => {
      console.error('\n❌  Seeder failed:', e.message);
      process.exit(1);
    })
    .finally(() => {
      if (_ownClient) _ownClient.$disconnect();
    });
}
