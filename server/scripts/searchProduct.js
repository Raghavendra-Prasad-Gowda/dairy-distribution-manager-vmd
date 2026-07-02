'use strict';
// Usage: DATABASE_URL="postgres://..." node scripts/searchProduct.js "search term"
const { Client } = require('pg');
async function main() {
  const term = process.argv[2] || '';
  const rawUrl = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '');
  const client = new Client({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
  });
  await client.connect();
  const { rows } = await client.query(
    `SELECT p.id, p.name, b.name AS brand, p.is_active
     FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE p.name ILIKE $1 ORDER BY b.name, p.name`,
    [`%${term}%`]
  );
  if (rows.length) rows.forEach(r => console.log(`[${r.brand}] ${r.name} (id=${r.id}, active=${r.is_active})`));
  else console.log('No products found.');
  await client.end();
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
