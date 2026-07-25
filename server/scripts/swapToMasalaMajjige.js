'use strict';
// Disables "Butter Milk Pet Bottle 180ml" and enables "Masala Majjige 200ml" @ ₹9
// for all 16 salespeople. Prices are from salesmandata31.md + applySalesmanPrices.js.
// Usage: DATABASE_URL="postgres://..." node scripts/swapToMasalaMajjige.js [--dry-run]

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-28';
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('*** DRY RUN ***\n');

const SALESPEOPLE = [
  'K Pandu', 'Hari', 'Seena', 'Vitala', 'Nagraj', 'Sukhan', 'Shabari', 'S Manu', 'NAGU',
  'RAJU', 'CHETHAN', 'P Swamy',
  'GPK', 'Madappa', 'Madhu', 'Subanna',
];

const PRICE = 9; // same for all 16 per md files

async function main() {
  const rawUrl = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '');
  const client = new Client({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
  });
  await client.connect();
  console.log('Connected.\n');

  try {
    const spRows = (await client.query('SELECT id, name FROM salespeople')).rows;
    const spIdByName = {};
    for (const r of spRows) spIdByName[r.name.toLowerCase()] = r.id;

    const spIds = SALESPEOPLE.map(n => {
      const id = spIdByName[n.toLowerCase()];
      if (!id) console.warn(`Salesperson not found: ${n}`);
      return id;
    }).filter(Boolean);

    const { rows: products } = await client.query(
      `SELECT p.id, p.name FROM products p
       JOIN brands b ON b.id = p.brand_id
       WHERE b.name = 'Nandini'
         AND p.name IN ('Butter Milk Pet Bottle 180ml', 'Masala Majjige 200ml')`
    );
    const butterId  = products.find(p => p.name === 'Butter Milk Pet Bottle 180ml')?.id;
    const majjigeId = products.find(p => p.name === 'Masala Majjige 200ml')?.id;

    if (!butterId)  { console.error('Product not found: Butter Milk Pet Bottle 180ml'); process.exit(1); }
    if (!majjigeId) { console.error('Product not found: Masala Majjige 200ml'); process.exit(1); }

    console.log(`Butter Milk Pet Bottle 180ml → id=${butterId} (will be disabled)`);
    console.log(`Masala Majjige 200ml         → id=${majjigeId} (will be enabled @ ₹${PRICE})\n`);

    for (const spId of spIds) {
      const name = SALESPEOPLE[spIds.indexOf(spId)];
      console.log(`${name}`);

      if (!DRY_RUN) {
        // Enable Masala Majjige 200ml
        await client.query(
          `INSERT INTO salesperson_products (salesperson_id, product_id, is_enabled)
           VALUES ($1, $2, true)
           ON CONFLICT (salesperson_id, product_id) DO UPDATE SET is_enabled = true`,
          [spId, majjigeId]
        );
        // Set price for Masala Majjige 200ml
        await client.query(
          `INSERT INTO salesperson_prices (salesperson_id, product_id, selling_price, effective_from)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (salesperson_id, product_id, effective_from)
           DO UPDATE SET selling_price = EXCLUDED.selling_price`,
          [spId, majjigeId, PRICE, EFFECTIVE_FROM]
        );
        // Disable Butter Milk Pet Bottle 180ml
        await client.query(
          `UPDATE salesperson_products SET is_enabled = false
           WHERE salesperson_id = $1 AND product_id = $2`,
          [spId, butterId]
        );
        console.log(`  ✓ enabled Masala Majjige @ ₹${PRICE}, disabled Butter Milk Pet Bottle`);
      } else {
        console.log(`  [DRY] enable Masala Majjige @ ₹${PRICE}, disable Butter Milk Pet Bottle`);
      }
    }

    if (!DRY_RUN) {
      await client.query(`UPDATE products SET salesperson_enabled = true WHERE id = $1`, [majjigeId]);
      console.log(`\nGlobally enabled Masala Majjige 200ml.`);
    }

    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
