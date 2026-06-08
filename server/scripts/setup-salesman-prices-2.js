require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const prisma = require('../lib/prisma');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../utils/constants');

// ─── Salesperson list (order matches price column order) ──────────────────────

const SALESPEOPLE = [
  { dbName: 'GPK',      username: 'gpk'      },
  { dbName: 'Madappa',  username: 'madappa'  },
  { dbName: 'Madhu',    username: 'madhu'    },
  { dbName: 'Subanna',  username: 'subanna'  },
  { dbName: 'Rashid',   username: 'rashid'   },
  { dbName: 'Jyothi',   username: 'jyothi'   },
  { dbName: 'Mah Jss',  username: 'mahjss'   },
  { dbName: 'Sidhu',    username: 'sidhu'    },
  { dbName: 'SKP',      username: 'skp'      },
  { dbName: 'Prasanna', username: 'prasanna' }, // new — will be created
];

// ─── Price table ──────────────────────────────────────────────────────────────
// Columns match SALESPEOPLE order:
//   gpk, madappa, madhu, subanna, rashid, jyothi, mahjss, sidhu, skp, prasanna
// null = salesman does not sell this product (disables SalespersonProduct)

const PRICE_ROWS = [
  // [brand, productName, ...10 prices]

  // Jersey
  ['Jersey', 'HTM 500ml',      44,   null, null, null, null, null, null, 40,   null, 38  ],
  ['Jersey', 'HTM 225ml',      null, 42,   44,   44,   44,   null, null, 40,   null, null],
  ['Jersey', 'DTM Curd 1000g', 48,   null, null, null, null, null, null, 48,   null, 41  ],
  ['Jersey', 'DTM Curd 140g',  null, null, null, null, null, null, null, 35.7, null, 40  ],
  ['Jersey', 'HFCM 500ml',     null, null, null, null, null, null, null, null, null, null],
  ['Jersey', 'STM 500ml',      null, null, null, null, null, null, null, null, null, null],

  // Nandini
  ['Nandini', 'Homoginsed Milk 500ml',       46,   46,   46.5, 46.5, 46.5, 46,   46,   46,   45.6,  null],
  ['Nandini', 'Toned Milk 1000ml',           44.5, 44.5, 44.5, 44.5, 44.5, 44.5, 44.5, 44.5, 43.7,  null],
  ['Nandini', 'Homoginsed Milk 250ml',       null, null, 54.5, 54.5, null, 54.5, 54.5, 54,   53.2,  null],
  ['Nandini', 'Homogensed Cow Milk 500ml',   null, null, null, null, null, 50,   50,   null, null,   null],
  ['Nandini', 'Shubam Milk 500ml',           null, null, 52.5, 52.5, null, 52,   52,   null, 51.3,  null],
  ['Nandini', 'Nandini Special Milk 1000ml', 49,   null, null, null, 50,   49,   49,   50,   49,    null],
  ['Nandini', 'Nandini Special Milk 500ml',  51,   51,   51,   51,   50,   51,   51,   50,   51.4,  null],
  ['Nandini', 'Nandini Special Milk 250ml',  56,   null, null, null, null, 56,   56,   null, null,  null],
  ['Nandini', 'Curd 1000g',                  50.5, 51,   null, 52,   null, 51,   51,   null, 49.54, null],
  ['Nandini', 'Curd 500g',                   52.5, 52,   53,   53,   null, 52,   52,   52,   51.4,  null],
  ['Nandini', 'Curd 200g',                   61,   61,   61.5, 61.5, null, 61,   61,   60,   59.65, null],
];

const EFFECTIVE_FROM = new Date('2026-06-05');

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Salesman setup script 2 started ===\n');

  // 1. Hash password once (shared by all)
  console.log('Step 1: Hashing password...');
  const passwordHash = await bcrypt.hash('test1234', BCRYPT_ROUNDS);
  console.log('  Done.\n');

  // 2. Build product lookup map: "BrandName:ProductName" → productId
  console.log('Step 2: Loading products from DB...');
  const allProducts = await prisma.product.findMany({ include: { brand: true } });
  const productMap = new Map();
  for (const p of allProducts) {
    productMap.set(`${p.brand.name}:${p.name}`, p.id);
  }
  console.log(`  Loaded ${allProducts.length} products.\n`);

  // 3. Collect all distinct product IDs referenced in PRICE_ROWS
  const allProductIds = new Set();
  const missingProducts = [];
  for (const row of PRICE_ROWS) {
    const [brand, name] = row;
    const key = `${brand}:${name}`;
    const id = productMap.get(key);
    if (id == null) {
      missingProducts.push(key);
    } else {
      allProductIds.add(id);
    }
  }
  if (missingProducts.length) {
    console.warn('⚠ WARNING: These products were not found in DB and will be skipped:');
    missingProducts.forEach(k => console.warn(`  - ${k}`));
    console.warn();
  }

  // 4. Enable all involved products globally
  console.log('Step 3: Enabling products globally (salespersonEnabled = true)...');
  const { count: globalCount } = await prisma.product.updateMany({
    where: { id: { in: [...allProductIds] } },
    data:  { salespersonEnabled: true },
  });
  console.log(`  Updated ${globalCount} products.\n`);

  // 5. Ensure Prasanna exists
  console.log('Step 4: Ensuring Prasanna salesperson exists...');
  let prasannaRow = await prisma.salesperson.findFirst({
    where: { name: { equals: 'Prasanna', mode: 'insensitive' } },
  });
  if (!prasannaRow) {
    prasannaRow = await prisma.salesperson.create({
      data: { name: 'Prasanna', isActive: true },
    });
    console.log(`  Created new salesperson: Prasanna (id=${prasannaRow.id})`);
  } else {
    console.log(`  Prasanna already exists (id=${prasannaRow.id})`);
  }
  console.log();

  // 6. Process each salesperson
  console.log('Step 5: Setting credentials + product visibility + prices...\n');
  const stats = { processed: 0, skipped: 0, pricesSet: 0, productsEnabled: 0, productsDisabled: 0 };

  for (let spIdx = 0; spIdx < SALESPEOPLE.length; spIdx++) {
    const { dbName, username } = SALESPEOPLE[spIdx];

    const sp = await prisma.salesperson.findFirst({
      where: { name: { equals: dbName, mode: 'insensitive' } },
    });
    if (!sp) {
      console.error(`  ✗ SKIPPED: "${dbName}" not found in DB.`);
      stats.skipped++;
      continue;
    }

    // Set credentials (enables login)
    await prisma.salesperson.update({
      where: { id: sp.id },
      data:  { username, passwordHash },
    });

    // Process each product row
    for (const row of PRICE_ROWS) {
      const [brand, productName, ...prices] = row;
      const key = `${brand}:${productName}`;
      const productId = productMap.get(key);
      if (productId == null) continue;

      const price = prices[spIdx];
      const isEnabled = price !== null;

      // Upsert SalespersonProduct
      await prisma.salespersonProduct.upsert({
        where:  { salespersonId_productId: { salespersonId: sp.id, productId } },
        create: { salespersonId: sp.id, productId, isEnabled },
        update: { isEnabled },
      });
      if (isEnabled) stats.productsEnabled++; else stats.productsDisabled++;

      // Upsert SalespersonPrice only when the salesman sells this product
      if (isEnabled) {
        await prisma.salespersonPrice.upsert({
          where: {
            salespersonId_productId_effectiveFrom: {
              salespersonId: sp.id,
              productId,
              effectiveFrom: EFFECTIVE_FROM,
            },
          },
          create: { salespersonId: sp.id, productId, sellingPrice: price, effectiveFrom: EFFECTIVE_FROM },
          update: { sellingPrice: price },
        });
        stats.pricesSet++;
      }
    }

    console.log(`  ✓ ${dbName} (id=${sp.id}, username="${username}")`);
    stats.processed++;
  }

  console.log('\n=== Summary ===');
  console.log(`  Salespeople processed : ${stats.processed}`);
  console.log(`  Salespeople skipped   : ${stats.skipped}`);
  console.log(`  Product rows enabled  : ${stats.productsEnabled}`);
  console.log(`  Product rows disabled : ${stats.productsDisabled}`);
  console.log(`  Prices upserted       : ${stats.pricesSet}`);
  console.log('\nDone.');
}

main()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
