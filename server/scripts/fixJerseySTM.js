// One-time fix: for all 12 salespeople on Jersey + Jersey (SNK)
//   - Disable STM 500ml (remove salesperson_products row)
//   - Enable STM 1000ml at ₹48 (upsert price + insert salesperson_products row)
//   - HTM 1000ml stays disabled (no change)
//
// Usage:
//   DATABASE_URL="postgres://..." node scripts/fixJerseySTM.js [--dry-run]

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-08';
const DRY_RUN = process.argv.includes('--dry-run');

const SP_NAMES = [
  'K Pandu', 'Hari', 'Seena', 'Vitala', 'Nagraj', 'Sukhan',
  'Shabari', 'S Manu', 'NAGU', 'Raju', 'Chethan', 'P Swamy',
];

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

  // Resolve salespeople
  const spRows = (await client.query(
    'SELECT id, name FROM salespeople WHERE name = ANY($1)',
    [SP_NAMES]
  )).rows;
  const spIdByName = {};
  for (const r of spRows) spIdByName[r.name.toLowerCase()] = r.id;

  const missing = SP_NAMES.filter(n => !spIdByName[n.toLowerCase()]);
  if (missing.length) {
    console.error('Salespeople not found:', missing.join(', '));
    await client.end();
    process.exit(1);
  }
  const spIds = SP_NAMES.map(n => spIdByName[n.toLowerCase()]);

  // Resolve Jersey brands (Jersey + Jersey SNK)
  const brandRows = (await client.query('SELECT id, name FROM brands')).rows;
  const jerseyBrandIds = brandRows
    .filter(b => b.name.toLowerCase().startsWith('jersey'))
    .map(b => b.id);

  if (jerseyBrandIds.length === 0) {
    console.error('No Jersey brands found.');
    await client.end();
    process.exit(1);
  }
  console.log(`Jersey brands: ${brandRows.filter(b => jerseyBrandIds.includes(b.id)).map(b => b.name).join(', ')}`);

  // Resolve product ids
  const productRows = (await client.query(
    'SELECT id, name, brand_id FROM products WHERE is_active = true AND brand_id = ANY($1)',
    [jerseyBrandIds]
  )).rows;

  function getProductIds(name) {
    return productRows.filter(p => p.name.toLowerCase() === name.toLowerCase()).map(p => p.id);
  }

  const stm500Ids = getProductIds('STM 500ml');
  const stm1000Ids = getProductIds('STM 1000ml');

  if (stm500Ids.length === 0) { console.error('STM 500ml not found.'); await client.end(); process.exit(1); }
  if (stm1000Ids.length === 0) { console.error('STM 1000ml not found.'); await client.end(); process.exit(1); }

  console.log(`STM 500ml product ids: ${stm500Ids.join(', ')}`);
  console.log(`STM 1000ml product ids: ${stm1000Ids.join(', ')}`);
  console.log(`Salespeople (${spIds.length}): ${SP_NAMES.join(', ')}`);
  console.log(`Effective from: ${EFFECTIVE_FROM}`);

  if (DRY_RUN) {
    console.log('Dry run — nothing written.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    // 1. Disable STM 500ml — delete salesperson_products rows
    const del = await client.query(
      'DELETE FROM salesperson_products WHERE salesperson_id = ANY($1) AND product_id = ANY($2)',
      [spIds, stm500Ids]
    );
    console.log(`Deleted ${del.rowCount} STM 500ml visibility rows.`);

    // 2. Enable STM 1000ml — upsert price + insert visibility
    let priceRows = 0;
    let visRows = 0;
    for (const spId of spIds) {
      for (const productId of stm1000Ids) {
        await client.query(
          `INSERT INTO salesperson_prices (salesperson_id, product_id, selling_price, effective_from)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (salesperson_id, product_id, effective_from)
           DO UPDATE SET selling_price = EXCLUDED.selling_price`,
          [spId, productId, 48, new Date(`${EFFECTIVE_FROM}T00:00:00.000Z`)]
        );
        priceRows++;

        await client.query(
          `INSERT INTO salesperson_products (salesperson_id, product_id, is_enabled)
           VALUES ($1, $2, true)
           ON CONFLICT (salesperson_id, product_id) DO UPDATE SET is_enabled = true`,
          [spId, productId]
        );
        visRows++;
      }
    }
    console.log(`Upserted ${priceRows} STM 1000ml price rows, ${visRows} visibility rows.`);

    await client.query('COMMIT');
    console.log('Done.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    process.exit(1);
  }
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
