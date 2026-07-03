'use strict';
// Adds Nandini Lassi 200ml (13) and Butter Milk Pet Bottle 180ml (9)
// for Raju, Chethan, P Swamy — these were missing from setup-salesman-prices.js
// Usage: DATABASE_URL="postgres://..." node scripts/applyRajuChethanSwamyExtras.js [--dry-run]

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-28';
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('*** DRY RUN ***\n');

const SALESPEOPLE = ['RAJU', 'CHETHAN', 'P Swamy'];
const PRODUCTS = [
  { brand: 'Nandini', name: 'Lassi 200ml',              price: 13 },
  { brand: 'Nandini', name: 'Butter Milk Pet Bottle 180ml', price: 9 },
];

async function main() {
  const rawUrl = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '');
  const client = new Client({
    connectionString: rawUrl,
    ssl: rawUrl.includes('localhost')
      ? false
      : { rejectUnauthorized: false, checkServerIdentity: () => undefined },
  });
  await client.connect();
  console.log('Connected.\n');

  try {
    const brandRows   = (await client.query('SELECT id, name FROM brands')).rows;
    const productRows = (await client.query('SELECT id, name, brand_id FROM products WHERE is_active = true')).rows;
    const spRows      = (await client.query('SELECT id, name FROM salespeople')).rows;

    const spIdByName = {};
    for (const r of spRows) spIdByName[r.name.toLowerCase()] = r.id;

    const spIds = SALESPEOPLE.map(n => {
      const id = spIdByName[n.toLowerCase()];
      if (!id) console.warn(`Salesperson not found: ${n}`);
      return id;
    }).filter(Boolean);

    const resolved = PRODUCTS.map(({ brand, name, price }) => {
      const b = brandRows.find(r => r.name.toLowerCase() === brand.toLowerCase());
      if (!b) { console.warn(`Brand not found: ${brand}`); return null; }
      const p = productRows.find(r => r.brand_id === b.id && r.name.toLowerCase() === name.toLowerCase());
      if (!p) { console.warn(`Product not found: ${brand}:${name}`); return null; }
      return { productId: p.id, name, price };
    }).filter(Boolean);

    for (const spId of spIds) {
      const spName = SALESPEOPLE[spIds.indexOf(spId)];
      console.log(`Processing: ${spName} (id=${spId})`);
      for (const { productId, name, price } of resolved) {
        if (!DRY_RUN) {
          await client.query(
            `INSERT INTO salesperson_products (salesperson_id, product_id, is_enabled)
             VALUES ($1, $2, true)
             ON CONFLICT (salesperson_id, product_id) DO UPDATE SET is_enabled = true`,
            [spId, productId]
          );
          await client.query(
            `INSERT INTO salesperson_prices (salesperson_id, product_id, selling_price, effective_from)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (salesperson_id, product_id, effective_from)
             DO UPDATE SET selling_price = EXCLUDED.selling_price`,
            [spId, productId, price, EFFECTIVE_FROM]
          );
          console.log(`  ✓ ${name} @ ${price}`);
        } else {
          console.log(`  [DRY] ${name} @ ${price}`);
        }
      }
    }
    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
