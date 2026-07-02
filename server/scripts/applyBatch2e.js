'use strict';
// applyBatch2e.js — Sets prices + product visibility for Sidhu (Nandini only)
// Source: salesmandata35.md (IMG_8868)
// Usage: DATABASE_URL="postgres://..." node scripts/applyBatch2e.js [--dry-run]

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-28';
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('*** DRY RUN — no writes will happen ***\n');

const SECTIONS = [
  {
    salespeople: ['Sidhu'],
    prices: {
      'Nandini': {
        'Toned Milk 1000ml': 44.50,      'Homoginsed Milk 500ml': 23,
        'Homoginsed Milk 250ml': 13.50,  'Homogensed Cow Milk 500ml': 25,
        'Shubam Milk 500ml': 26,         'Samrudhi 500ml': 26.50,
        'Nandini Special Milk 1000ml': 50, 'Nandini Special Milk 500ml': 25,
        'Nandini Special Milk 250ml': 14,  'Curd 200g': 12.50,
        'Curd 500g': 26.50, 'Curd 1000g': 52,
        'Lassi 200ml': 13, 'Masala Majjige 200ml': 9,
      },
    },
  },
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
  console.log('Connected to DB.\n');

  try {
    const brandRows   = (await client.query('SELECT id, name FROM brands')).rows;
    const productRows = (await client.query('SELECT id, name, brand_id FROM products WHERE is_active = true')).rows;
    const spRows      = (await client.query('SELECT id, name FROM salespeople')).rows;

    const spIdByName = {};
    for (const r of spRows) spIdByName[r.name.toLowerCase()] = r.id;

    const errors = [];
    const allProductIds = new Set();

    for (const section of SECTIONS) {
      const spIds = section.salespeople.map(name => {
        const id = spIdByName[name.toLowerCase()];
        if (!id) errors.push(`Salesperson not found: ${name}`);
        return id;
      }).filter(Boolean);

      const priceInserts = [];
      const enabledBySp  = {};
      for (const spId of spIds) enabledBySp[spId] = new Set();

      for (const [brandKey, products] of Object.entries(section.prices)) {
        const matchingBrands = brandKey.endsWith('*')
          ? brandRows.filter(b => b.name.toLowerCase().startsWith(brandKey.slice(0, -1).toLowerCase()))
          : brandRows.filter(b => b.name.toLowerCase() === brandKey.toLowerCase());

        if (!matchingBrands.length) { errors.push(`Brand not found: ${brandKey}`); continue; }

        for (const [productName, price] of Object.entries(products)) {
          for (const brand of matchingBrands) {
            const product = productRows.find(
              r => r.brand_id === brand.id && r.name.toLowerCase() === productName.toLowerCase()
            );
            if (!product) { errors.push(`Product not found: ${brand.name}:${productName}`); continue; }
            allProductIds.add(product.id);
            for (let i = 0; i < spIds.length; i++) {
              const spId = spIds[i];
              const p = Array.isArray(price) ? price[i] : price;
              if (p !== null) { enabledBySp[spId].add(product.id); priceInserts.push([spId, product.id, p]); }
            }
          }
        }
      }

      for (const spId of spIds) {
        const name = section.salespeople[spIds.indexOf(spId)];
        const myPrices = priceInserts.filter(([sid]) => sid === spId);
        console.log(`Processing: ${name} (id=${spId})`);

        if (!DRY_RUN) {
          await client.query('DELETE FROM salesperson_products WHERE salesperson_id = $1', [spId]);
          for (const productId of enabledBySp[spId]) {
            await client.query(
              'INSERT INTO salesperson_products (salesperson_id, product_id, is_enabled) VALUES ($1, $2, true)',
              [spId, productId]
            );
          }
          for (const [, productId, p] of myPrices) {
            await client.query(
              `INSERT INTO salesperson_prices (salesperson_id, product_id, selling_price, effective_from)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (salesperson_id, product_id, effective_from)
               DO UPDATE SET selling_price = EXCLUDED.selling_price`,
              [spId, productId, p, EFFECTIVE_FROM]
            );
          }
          console.log(`  ✓ ${enabledBySp[spId].size} products enabled, ${myPrices.length} prices set`);
        } else {
          console.log(`  [DRY] ${enabledBySp[spId].size} products, ${myPrices.length} prices`);
        }
      }
    }

    if (allProductIds.size && !DRY_RUN) {
      await client.query(`UPDATE products SET salesperson_enabled = true WHERE id = ANY($1)`, [[...allProductIds]]);
    }

    if (errors.length) { console.warn('\n⚠ Warnings:'); errors.forEach(e => console.warn('  -', e)); }
    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
