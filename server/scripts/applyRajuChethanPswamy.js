// Apply confirmed prices + enable products for Raju, Chethan, P Swamy
// Source: salesmandata21.md (IMG_8827, IMG_8828)
//
// Usage:
//   DATABASE_URL="postgres://..." node scripts/applyRajuChethanPswamy.js [--dry-run]

const { Client } = require('pg');

const EFFECTIVE_FROM = '2026-06-04';
const DRY_RUN = process.argv.includes('--dry-run');

const SECTIONS = [
  {
    salespeople: ['Raju', 'Chethan', 'P Swamy'],
    prices: {
      'Jersey*': {
        'HTM 490ml':      [22.50, 22.25, 22.25],
        'HTM 210ml':      [10.625, 10.50, 10.50],
        'STM 1000ml':     48,
        'HFCM 490ml':     30.50,
        'HFCM 1000ml':    61,
        'DTM Curd 1000g': 48,
        'DTM Curd 450g':  24,
        'DTM Curd 140g':  8,
        'Butter Milk':    5.50,
      },
      'Gowardhan': {
        'TM 450ml':         21.50,
        'TM 225ml':         11.25,
        'GOLD Milk 1000ml': 49,
        'DTM Curd 200g':    10,
        'DTM Curd 500g':    24.50,
      },
      'Nandini': {
        'Toned Milk 1000ml':           44.50,
        'Homoginsed Milk 500ml':       [23.25, 23.50, 23.25],
        'Homoginsed Milk 250ml':       [13.625, 13.75, 13.75],
        'Homogensed Cow Milk 500ml':   25,
        'Shubam Milk 500ml':           [26.25, 26.50, 26.25],
        'Samrudhi 500ml':              27,
        'Nandini Special Milk 1000ml': 50,
        'Nandini Special Milk 500ml':  26,
        'Nandini Special Milk 250ml':  [14, 14.25, 14.25],
        'Curd 200g':                   12.30,
        'Curd 500g':                   [26.50, 27, 26.50],
        'Curd 1000g':                  [53, 54, 53],
        'Lassi 200ml':                 13,
        'Butter Milk Pet Bottle 180ml': 9,
      },
    },
  },
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

  const brandRows  = (await client.query('SELECT id, name FROM brands')).rows;
  const productRows = (await client.query('SELECT id, name, brand_id FROM products WHERE is_active = true')).rows;
  const spRows     = (await client.query('SELECT id, name FROM salespeople')).rows;

  const spIdByName = {};
  for (const r of spRows) spIdByName[r.name.toLowerCase()] = r.id;

  function resolveBrandIds(brandKey) {
    if (brandKey.endsWith('*')) {
      const prefix = brandKey.slice(0, -1).toLowerCase();
      return brandRows.filter(b => b.name.toLowerCase().startsWith(prefix)).map(b => b.id);
    }
    const brand = brandRows.find(b => b.name.toLowerCase() === brandKey.toLowerCase());
    return brand ? [brand.id] : [];
  }

  function resolveProductId(brandId, productName) {
    const p = productRows.find(
      r => r.brand_id === brandId && r.name.toLowerCase() === productName.toLowerCase()
    );
    return p?.id ?? null;
  }

  const priceInserts = [];
  const enabledBySp  = {};
  const errors       = [];

  for (const section of SECTIONS) {
    const spIds = section.salespeople.map(name => {
      const id = spIdByName[name.toLowerCase()];
      if (!id) errors.push(`Salesperson not found: ${name}`);
      return id;
    });

    for (const [brandKey, products] of Object.entries(section.prices)) {
      const brandIds = resolveBrandIds(brandKey);
      if (brandIds.length === 0) { errors.push(`Brand not found: ${brandKey}`); continue; }

      for (const [productName, priceVal] of Object.entries(products)) {
        for (const brandId of brandIds) {
          const productId = resolveProductId(brandId, productName);
          if (!productId) { errors.push(`Product not found: [brand ${brandId}] ${productName}`); continue; }

          spIds.forEach((spId, i) => {
            if (!spId) return;
            const price = Array.isArray(priceVal) ? priceVal[i] : priceVal;
            priceInserts.push([spId, productId, price]);
            (enabledBySp[spId] ??= new Set()).add(productId);
          });
        }
      }
    }
  }

  if (errors.length) {
    console.error('Resolution errors — aborting, nothing written:');
    errors.forEach(e => console.error('  -', e));
    await client.end();
    process.exit(1);
  }

  const spIdsAll = Object.keys(enabledBySp).map(Number);
  console.log(`Salespeople: ${spIdsAll.length}, price rows: ${priceInserts.length}, effective from: ${EFFECTIVE_FROM}`);

  if (DRY_RUN) {
    console.log('Dry run — nothing written.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const [spId, productId, price] of priceInserts) {
      await client.query(
        `INSERT INTO salesperson_prices (salesperson_id, product_id, selling_price, effective_from)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (salesperson_id, product_id, effective_from)
         DO UPDATE SET selling_price = EXCLUDED.selling_price`,
        [spId, productId, price, new Date(`${EFFECTIVE_FROM}T00:00:00.000Z`)]
      );
    }

    await client.query('DELETE FROM salesperson_products WHERE salesperson_id = ANY($1)', [spIdsAll]);
    let visRows = 0;
    for (const [spId, productIds] of Object.entries(enabledBySp)) {
      for (const productId of productIds) {
        await client.query(
          'INSERT INTO salesperson_products (salesperson_id, product_id, is_enabled) VALUES ($1, $2, true)',
          [Number(spId), productId]
        );
        visRows++;
      }
    }

    await client.query('COMMIT');
    console.log(`Done. Upserted ${priceInserts.length} prices, enabled ${visRows} products.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    process.exit(1);
  }
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
