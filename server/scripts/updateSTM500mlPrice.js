// One-time script: update Jersey STM 500ml selling price to ₹24
// for 9 specific salespeople only. Does NOT touch visibility or any other prices.
//
// Usage:
//   DATABASE_URL="postgres://..." node scripts/updateSTM500mlPrice.js [--dry-run]

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-08';
const NEW_PRICE = 24;
const DRY_RUN = process.argv.includes('--dry-run');

const SALESPEOPLE = ['K Pandu', 'Hari', 'Seena', 'Vitala', 'Nagraj', 'Sukhan', 'Shabari', 'S Manu', 'NAGU'];
const PRODUCT_NAME = 'STM 500ml';
const BRAND_PREFIX = 'jersey';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL env var is required.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: false, checkServerIdentity: () => undefined },
  });
  await client.connect();

  // Resolve Jersey brand IDs
  const brandRows = (await client.query(
    `SELECT id, name FROM brands WHERE LOWER(name) LIKE $1`,
    [`${BRAND_PREFIX}%`]
  )).rows;
  if (brandRows.length === 0) {
    console.error(`No brands found starting with "${BRAND_PREFIX}".`);
    await client.end();
    process.exit(1);
  }
  console.log(`Jersey brands found: ${brandRows.map(b => b.name).join(', ')}`);

  // Resolve product IDs for STM 500ml across all Jersey brands
  const brandIds = brandRows.map(b => b.id);
  const productRows = (await client.query(
    `SELECT id, name, brand_id FROM products WHERE LOWER(name) = LOWER($1) AND brand_id = ANY($2) AND is_active = true`,
    [PRODUCT_NAME, brandIds]
  )).rows;
  if (productRows.length === 0) {
    console.error(`Product "${PRODUCT_NAME}" not found in Jersey brands.`);
    await client.end();
    process.exit(1);
  }
  console.log(`Products matched: ${productRows.map(p => `[id=${p.id}] ${p.name}`).join(', ')}`);

  // Resolve salesperson IDs
  const spRows = (await client.query('SELECT id, name FROM salespeople')).rows;
  const errors = [];
  const spIds = SALESPEOPLE.map(name => {
    const sp = spRows.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (!sp) errors.push(`Salesperson not found: ${name}`);
    return sp;
  }).filter(Boolean);

  if (errors.length) {
    console.error('Resolution errors — aborting:');
    errors.forEach(e => console.error('  -', e));
    await client.end();
    process.exit(1);
  }
  console.log(`Salespeople matched: ${spIds.map(s => s.name).join(', ')}`);

  const totalRows = spIds.length * productRows.length;
  console.log(`\nWill upsert ${totalRows} price row(s): ${spIds.length} salespeople × ${productRows.length} product(s) → ₹${NEW_PRICE}, effective ${EFFECTIVE_FROM}`);

  if (DRY_RUN) {
    console.log('Dry run — nothing written.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    let count = 0;
    for (const sp of spIds) {
      for (const product of productRows) {
        await client.query(
          `INSERT INTO salesperson_prices (salesperson_id, product_id, selling_price, effective_from)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (salesperson_id, product_id, effective_from)
           DO UPDATE SET selling_price = EXCLUDED.selling_price`,
          [sp.id, product.id, NEW_PRICE, new Date(`${EFFECTIVE_FROM}T00:00:00.000Z`)]
        );
        count++;
      }
    }
    await client.query('COMMIT');
    console.log(`Done. Upserted ${count} price row(s).`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    process.exit(1);
  }
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
