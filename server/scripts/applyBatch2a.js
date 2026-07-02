'use strict';
// applyBatch2a.js — Sets prices + product visibility for GPK, Madappa, Madhu, Subanna
// Source: salesmandata31.md (IMG_8856 + IMG_8857)
//
// Usage:
//   DATABASE_URL="postgres://..." node scripts/applyBatch2a.js [--dry-run]
//
// What it does per salesperson:
//   1. Globally enables all listed products (salesperson_enabled = true on products table).
//   2. Resets salesperson_products so ONLY the listed products are enabled.
//   3. Upserts salesperson_prices for EFFECTIVE_FROM date.

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-28';
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('*** DRY RUN — no writes will happen ***\n');

// One section per salesperson (prices differ per person).
// 'Jersey*' = all brands whose name starts with 'Jersey'.
const SECTIONS = [
  {
    salespeople: ['GPK'],
    prices: {
      'Jersey*': {
        'HTM 490ml': 22.00, 'HTM 210ml': 10.50, 'DTM Curd 1000g': 48,
        'HFCM 490ml': 30.50, 'HFCM 1000ml': 61, 'STM 500ml': 48,
        'DTM Curd 450g': 24, 'DTM Curd 140g': 8, 'Butter Milk': 5.50,
      },
      'Gowardhan': {
        'TM 450ml': 22.00, 'TM 225ml': 11.25, 'GOLD Milk 1000ml': 49,
        'DTM Curd 200g': 10, 'DTM Curd 500g': 24.50,
      },
      'Nandini': {
        'Toned Milk 1000ml': 44.50,     'Homoginsed Milk 500ml': 23,
        'Homoginsed Milk 250ml': 13.30, 'Homogensed Cow Milk 500ml': 24.55,
        'Shubam Milk 500ml': 25.65,     'Samrudhi 500ml': 26.60,
        'Nandini Special Milk 1000ml': 49, 'Nandini Special Milk 500ml': 25.50,
        'Nandini Special Milk 250ml': 14,  'Curd 200g': 12.20,
        'Curd 500g': 26.25, 'Curd 1000g': 50.50,
        'Lassi 200ml': 13, 'Butter Milk Pet Bottle 180ml': 9,
      },
    },
  },
  {
    salespeople: ['Madappa'],
    prices: {
      'Jersey*': {
        'HTM 490ml': 22.00, 'HTM 210ml': 10.50, 'DTM Curd 1000g': 48,
        'HFCM 490ml': 30.50, 'HFCM 1000ml': 61, 'STM 500ml': 48,
        'DTM Curd 450g': 24, 'DTM Curd 140g': 8, 'Butter Milk': 5.50,
      },
      'Gowardhan': {
        'TM 450ml': 21.50, 'TM 225ml': 11.25, 'GOLD Milk 1000ml': 49,
        'DTM Curd 200g': 10, 'DTM Curd 500g': 24.50,
      },
      'Nandini': {
        'Toned Milk 1000ml': 44.50,     'Homoginsed Milk 500ml': 23,
        'Homoginsed Milk 250ml': 13.30, 'Homogensed Cow Milk 500ml': 24.55,
        'Shubam Milk 500ml': 25.65,     'Samrudhi 500ml': 26.50,
        'Nandini Special Milk 1000ml': 49, 'Nandini Special Milk 500ml': 25.50,
        'Nandini Special Milk 250ml': 14.03, 'Curd 200g': 12.50,
        'Curd 500g': 26.25, 'Curd 1000g': 51,
        'Lassi 200ml': 13, 'Butter Milk Pet Bottle 180ml': 9,
      },
    },
  },
  {
    salespeople: ['Madhu'],
    prices: {
      'Jersey*': {
        'HTM 490ml': 22.00, 'HTM 210ml': 11.00, 'DTM Curd 1000g': 48,
        'HFCM 490ml': 30.50, 'HFCM 1000ml': 61, 'STM 500ml': 48,
        'DTM Curd 450g': 24, 'DTM Curd 140g': 8, 'Butter Milk': 5.50,
      },
      'Gowardhan': {
        'TM 450ml': 21.00, 'TM 225ml': 11.25, 'GOLD Milk 1000ml': 49,
        'DTM Curd 200g': 10, 'DTM Curd 500g': 24.50,
      },
      'Nandini': {
        'Toned Milk 1000ml': 44.50,       'Homoginsed Milk 500ml': 23.25,
        'Homoginsed Milk 250ml': 13.625,  'Homogensed Cow Milk 500ml': 25.00,
        'Shubam Milk 500ml': 26.25,       'Samrudhi 500ml': 26.50,
        'Nandini Special Milk 1000ml': 50, 'Nandini Special Milk 500ml': 25.50,
        'Nandini Special Milk 250ml': 14.03, 'Curd 200g': 12.30,
        'Curd 500g': 26.50, 'Curd 1000g': 52,
        'Lassi 200ml': 13, 'Butter Milk Pet Bottle 180ml': 9,
      },
    },
  },
  {
    salespeople: ['Subanna'],
    prices: {
      'Jersey*': {
        'HTM 490ml': 22.00, 'HTM 210ml': 11.00, 'DTM Curd 1000g': 48,
        'HFCM 490ml': 30.50, 'HFCM 1000ml': 61, 'STM 500ml': 48,
        'DTM Curd 450g': 24, 'DTM Curd 140g': 8, 'Butter Milk': 6.00,
      },
      'Gowardhan': {
        'TM 450ml': 21.50, 'TM 225ml': 11.25, 'GOLD Milk 1000ml': 49,
        'DTM Curd 200g': 10, 'DTM Curd 500g': 24.50,
      },
      'Nandini': {
        'Toned Milk 1000ml': 44.50,       'Homoginsed Milk 500ml': 23.25,
        'Homoginsed Milk 250ml': 13.625,  'Homogensed Cow Milk 500ml': 25,
        'Shubam Milk 500ml': 26.25,       'Samrudhi 500ml': 26.50,
        'Nandini Special Milk 1000ml': 50, 'Nandini Special Milk 500ml': 25.50,
        'Nandini Special Milk 250ml': 14,  'Curd 200g': 12.30,
        'Curd 500g': 26.50, 'Curd 1000g': 52,
        'Lassi 200ml': 13, 'Butter Milk Pet Bottle 180ml': 9,
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
    const brandRows  = (await client.query('SELECT id, name FROM brands')).rows;
    const productRows = (await client.query('SELECT id, name, brand_id FROM products WHERE is_active = true')).rows;
    const spRows     = (await client.query('SELECT id, name FROM salespeople')).rows;

    const spIdByName = {};
    for (const r of spRows) spIdByName[r.name.toLowerCase()] = r.id;

    const errors = [];
    const allProductIdsToEnable = new Set();

    for (const section of SECTIONS) {
      const spIds = section.salespeople.map(name => {
        const id = spIdByName[name.toLowerCase()];
        if (!id) errors.push(`Salesperson not found: ${name}`);
        return id;
      }).filter(Boolean);

      const priceInserts = [];   // [spId, productId, price]
      const enabledBySp  = {};   // spId → Set<productId>
      for (const spId of spIds) enabledBySp[spId] = new Set();

      for (const [brandKey, products] of Object.entries(section.prices)) {
        const matchingBrands = brandKey.endsWith('*')
          ? brandRows.filter(b => b.name.toLowerCase().startsWith(brandKey.slice(0, -1).toLowerCase()))
          : brandRows.filter(b => b.name.toLowerCase() === brandKey.toLowerCase());

        if (!matchingBrands.length) {
          errors.push(`Brand not found: ${brandKey}`);
          continue;
        }

        for (const [productName, price] of Object.entries(products)) {
          for (const brand of matchingBrands) {
            const product = productRows.find(
              r => r.brand_id === brand.id && r.name.toLowerCase() === productName.toLowerCase()
            );
            if (!product) {
              errors.push(`Product not found: ${brand.name}:${productName}`);
              continue;
            }
            allProductIdsToEnable.add(product.id);
            for (let i = 0; i < spIds.length; i++) {
              const spId = spIds[i];
              const actualPrice = Array.isArray(price) ? price[i] : price;
              if (actualPrice !== null) {
                enabledBySp[spId].add(product.id);
                priceInserts.push([spId, product.id, actualPrice]);
              }
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

    // Globally enable all products involved
    if (allProductIdsToEnable.size && !DRY_RUN) {
      const ids = [...allProductIdsToEnable];
      await client.query(
        `UPDATE products SET salesperson_enabled = true WHERE id = ANY($1)`,
        [ids]
      );
      console.log(`\nGlobally enabled ${ids.length} products (salesperson_enabled = true).`);
    }

    if (errors.length) {
      console.warn('\n⚠ Warnings:');
      errors.forEach(e => console.warn('  -', e));
    }
    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
