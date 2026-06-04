require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const prisma = require('../lib/prisma');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../utils/constants');

// ─── Salesperson list (order matches price column order) ──────────────────────

const SALESPEOPLE = [
  { dbName: 'K PANDU',  username: 'kpandu'  },
  { dbName: 'HARI',     username: 'hari'    },
  { dbName: 'SEENA',    username: 'seena'   },
  { dbName: 'VITALA',   username: 'vitala'  },
  { dbName: 'NAGRAJ',   username: 'nagraj'  },
  { dbName: 'SUKHAN',   username: 'sukhan'  },
  { dbName: 'SHABARI',  username: 'shabari' },
  { dbName: 'S Manu',   username: 'smanu'   },
  { dbName: 'NAGU',     username: 'nagu'    },  // new salesperson — will be created
  { dbName: 'RAJU',     username: 'raju'    },
  { dbName: 'CHETHAN',  username: 'chethan' },
  { dbName: 'P Swamy',  username: 'pswamy'  },
];

// ─── Price table ──────────────────────────────────────────────────────────────
// Columns match SALESPEOPLE order: kpandu,hari,seena,vitala,nagraj,sukhan,shabari,smanu,nagu,raju,chethan,pswamy
// null = salesman does not sell this product (will disable SalespersonProduct)

const PRICE_ROWS = [
  // [brand, productName, ...12 prices]

  // Jersey
  ['Jersey', 'HTM 500ml',           44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50],
  ['Jersey', 'HTM 225ml',           42,    42,    42,    42,    42,    42,    42,    42,    42,    42,    42,    42   ],
  ['Jersey', 'DTM Curd 1000g',      48,    48,    48,    48,    48,    48,    48,    48,    48,    48,    48,    48   ],
  ['Jersey', 'DTM Curd 140g',       40,    40,    40,    40,    40,    40,    40,    40,    40,    40,    40,    40   ],
  ['Jersey', 'HFCM 500ml',          null,  61,    61,    61,    61,    61,    61,    61,    61,    61,    61,    61   ],
  ['Jersey', 'STM 500ml',           null,  48,    48,    48,    48,    48,    48,    48,    48,    48,    48,    48   ],

  // Gowardhan
  ['Gowardhan', 'TM 450ml',         43,    43,    43,    43,    43,    43,    43,    43,    43,    43,    43,    43   ],
  ['Gowardhan', 'TM 225ml',         45,    45,    45,    45,    45,    45,    45,    45,    45,    45,    45,    45   ],
  ['Gowardhan', 'DTM Curd 500g',    49,    49,    49,    49,    49,    49,    49,    49,    49,    49,    49,    49   ],
  ['Gowardhan', 'DTM Curd 200g',    50,    50,    50,    50,    50,    50,    50,    50,    50,    50,    50,    50   ],
  ['Gowardhan', 'GOLD Milk 1000ml', null,  null,  null,  null,  null,  null,  null,  null,  49,    null,  49,    null ],

  // Nandini
  ['Nandini', 'Homoginsed Milk 500ml',       47,    47,    47,    46.50, 46.50, 46.50, 46.50, 46.50, 46.50, 46.50, 47,    46.50],
  ['Nandini', 'Toned Milk 1000ml',           45,    45,    45,    44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50, 44.50],
  ['Nandini', 'Homoginsed Milk 250ml',       55,    55,    55,    54.50, 54.50, 54.50, 54.50, 54.50, 54.50, 54.50, 55,    55   ],
  ['Nandini', 'Homogensed Cow Milk 500ml',   50,    50,    null,  50,    50,    50,    50,    50,    50,    50,    50,    50   ],
  ['Nandini', 'Shubam Milk 500ml',           53,    53,    53,    53,    52.50, 52.50, 52.50, 52.50, 52.50, 52.50, 53,    52.50],
  ['Nandini', 'Nandini Special Milk 1000ml', 51,    51,    51,    50,    50,    50,    50,    50,    50,    51,    50.50, 50.50],
  ['Nandini', 'Nandini Special Milk 500ml',  52,    52,    52,    52,    51,    51,    51,    51,    51,    51,    51.50, 51   ],
  ['Nandini', 'Nandini Special Milk 250ml',  57,    57,    57,    57,    57,    57,    57,    57,    57,    56,    56,    57   ],
  ['Nandini', 'Curd 1000g',                  53,    53,    53,    52,    52,    52,    52,    52,    52,    53,    52,    52   ],
  ['Nandini', 'Curd 500g',                   54,    54,    54,    54,    53,    53,    53,    53,    53,    53,    54,    53   ],
  ['Nandini', 'Curd 200g',                   62,    62,    62,    62,    61.50, 61.50, 61.50, 61.50, 61.50, 61.50, 61.50, 61.50],
];

const EFFECTIVE_FROM = new Date('2026-06-04');

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Salesman setup script started ===\n');

  // 1. Fix name mismatches
  console.log('Step 1: Fixing name mismatches...');
  const nameFixResult1 = await prisma.salesperson.updateMany({
    where: { name: 'Apsar Manik' },
    data:  { name: 'Apsar Manu' },
  });
  if (nameFixResult1.count) console.log(`  Renamed "Apsar Manik" → "Apsar Manu"`);

  const nameFixResult2 = await prisma.salesperson.updateMany({
    where: { name: 'Sky' },
    data:  { name: 'SKP' },
  });
  if (nameFixResult2.count) console.log(`  Renamed "Sky" → "SKP"`);
  console.log();

  // 2. Hash password once (shared by all)
  console.log('Step 2: Hashing password...');
  const passwordHash = await bcrypt.hash('test1234', BCRYPT_ROUNDS);
  console.log('  Done.\n');

  // 3. Build product lookup map: "BrandName:ProductName" → productId
  console.log('Step 3: Loading products from DB...');
  const allProducts = await prisma.product.findMany({ include: { brand: true } });
  const productMap = new Map();
  for (const p of allProducts) {
    productMap.set(`${p.brand.name}:${p.name}`, p.id);
  }
  console.log(`  Loaded ${allProducts.length} products.\n`);

  // 4. Collect all distinct product IDs referenced in PRICE_ROWS
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

  // 5. Enable all involved products globally
  console.log('Step 4: Enabling products globally (salespersonEnabled = true)...');
  const { count: globalCount } = await prisma.product.updateMany({
    where: { id: { in: [...allProductIds] } },
    data:  { salespersonEnabled: true },
  });
  console.log(`  Updated ${globalCount} products.\n`);

  // 6. Ensure NAGU exists
  console.log('Step 5: Ensuring NAGU salesperson exists...');
  let naguRow = await prisma.salesperson.findFirst({
    where: { name: { equals: 'NAGU', mode: 'insensitive' } },
  });
  if (!naguRow) {
    naguRow = await prisma.salesperson.create({
      data: { name: 'NAGU', isActive: true },
    });
    console.log(`  Created new salesperson: NAGU (id=${naguRow.id})`);
  } else {
    console.log(`  NAGU already exists (id=${naguRow.id})`);
  }
  console.log();

  // 7. Process each salesperson
  console.log('Step 6: Setting credentials + product visibility + prices...\n');
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
      if (productId == null) continue; // already warned above

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
