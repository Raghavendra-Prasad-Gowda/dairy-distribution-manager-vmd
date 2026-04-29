'use strict';
const prisma = require('../lib/prisma');

// ─── 140 Nandini products from rate chart photos ──────────────────────────────
const PRODUCTS = [
  // TONED MILK
  { category: 'TONED MILK', name: 'Toned Milk 500ml',  unitType: 'ml',   unitSize: 500,   mlPerCrate: 6000,  sellingPrice: 24 },
  { category: 'TONED MILK', name: 'Toned Milk 1000ml', unitType: 'ml',   unitSize: 1000,  mlPerCrate: 12000, sellingPrice: 46 },

  // HOMOGINSED MILK
  { category: 'HOMOGINSED MILK', name: 'Homoginsed Milk 250ml', unitType: 'ml', unitSize: 250, mlPerCrate: 3000, sellingPrice: 14 },
  { category: 'HOMOGINSED MILK', name: 'Homoginsed Milk 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, sellingPrice: 24 },

  // HOMOGINSED COW MILK
  { category: 'HOMOGINSED COW MILK', name: 'Homogensed Cow Milk 500ml',   unitType: 'ml', unitSize: 500, mlPerCrate: 6000, sellingPrice: 26 },
  { category: 'HOMOGINSED COW MILK', name: 'Homogenised Cow Milk 160ml',  unitType: 'ml', unitSize: 160, mlPerCrate: 1920, sellingPrice: 10 },

  // SHUBAM MILK
  { category: 'SHUBAM MILK', name: 'Shubam Milk 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, sellingPrice: 27 },

  // NANDINI SPECIAL MILK
  { category: 'NANDINI SPECIAL MILK', name: 'Nandini Special Milk 250ml',  unitType: 'ml', unitSize: 250,  mlPerCrate: 3000,  sellingPrice: 15 },
  { category: 'NANDINI SPECIAL MILK', name: 'Nandini Special Milk 500ml',  unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  sellingPrice: 27 },
  { category: 'NANDINI SPECIAL MILK', name: 'Nandini Special Milk 1000ml', unitType: 'ml', unitSize: 1000, mlPerCrate: 12000, sellingPrice: 52 },

  // CURD
  { category: 'CURD', name: 'Curd 140g', unitType: 'gram', unitSize: 140,  sellingPrice: 10 },
  { category: 'CURD', name: 'Curd 200g', unitType: 'gram', unitSize: 200,  sellingPrice: 13 },
  { category: 'CURD', name: 'Curd 500g', unitType: 'gram', unitSize: 500,  sellingPrice: 28 },
  { category: 'CURD', name: 'Curd 1kg',  unitType: 'gram', unitSize: 1000, sellingPrice: 54 },

  // SAMRUDHI
  { category: 'SAMRUDHI', name: 'Samrudhi 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, sellingPrice: 28 },

  // MANGO LASSI
  { category: 'MANGO LASSI', name: 'Mango Lassi 180ml',         unitType: 'ml', unitSize: 180, mlPerCrate: 2160, sellingPrice: 15 },
  { category: 'MANGO LASSI', name: 'Mango Lassi Pet Bottle 180ml', unitType: 'ml', unitSize: 180, mlPerCrate: 2160, sellingPrice: 25 },

  // SWEET LASSI
  { category: 'SWEET LASSI', name: 'Lassi 200ml',                   unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 14 },
  { category: 'SWEET LASSI', name: 'Sweet Lassi Pet Bottle 180ml',  unitType: 'ml', unitSize: 180, mlPerCrate: 2160, sellingPrice: 20 },
  { category: 'SWEET LASSI', name: 'Lassi Mango Tetra Pack 200ml',  unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 25 },

  // BUTTER MILK
  { category: 'BUTTER MILK', name: 'Masala Majjige 200ml',              unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 10 },
  { category: 'BUTTER MILK', name: 'Tetra Pack Spiced Butter Milk 200ml', unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 15 },
  { category: 'BUTTER MILK', name: 'Butter Milk Pet Bottle 180ml',      unitType: 'ml', unitSize: 180, mlPerCrate: 2160, sellingPrice: 15 },

  // RAGI MALT
  { category: 'RAGI MALT', name: 'Ragi Ambli 200ml', unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 9 },

  // PROBIOTIC CURD
  { category: 'PROBIOTIC CURD', name: 'Probiotic Butter Milk 200ml', unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, sellingPrice: 10 },
  { category: 'PROBIOTIC CURD', name: 'Probiotic Curd 200g',         unitType: 'gram', unitSize: 200, sellingPrice: 35 },

  // PEDA
  { category: 'PEDA', name: 'Peda 25g',           unitType: 'gram', unitSize: 25,  sellingPrice: 14 },
  { category: 'PEDA', name: 'Peda 100g',          unitType: 'gram', unitSize: 100, sellingPrice: 60 },
  { category: 'PEDA', name: 'Peda 250g',          unitType: 'gram', unitSize: 250, sellingPrice: 140 },
  { category: 'PEDA', name: 'Kesar Peda 200g',    unitType: 'gram', unitSize: 200, sellingPrice: 130 },
  { category: 'PEDA', name: 'Elachi Peda 200g',   unitType: 'gram', unitSize: 200, sellingPrice: 130 },
  { category: 'PEDA', name: 'Sugarfree Peda 200g', unitType: 'gram', unitSize: 200, sellingPrice: 170 },
  { category: 'PEDA', name: 'Jaggery Peda 200g',  unitType: 'gram', unitSize: 200, sellingPrice: 125 },

  // MYSORE PAK
  { category: 'MYSORE PAK', name: 'Mysore Pak 25g',  unitType: 'gram', unitSize: 25,  sellingPrice: 15 },
  { category: 'MYSORE PAK', name: 'Mysore Pak 100g', unitType: 'gram', unitSize: 100, sellingPrice: 60 },
  { category: 'MYSORE PAK', name: 'Mysore Pak 250g', unitType: 'gram', unitSize: 250, sellingPrice: 160 },
  { category: 'MYSORE PAK', name: 'Mysore Pak 500g', unitType: 'gram', unitSize: 500, sellingPrice: 280 },

  // CASHEW BURFY
  { category: 'CASHEW BURFY', name: 'Cashew Burfy 100g', unitType: 'gram', unitSize: 100, sellingPrice: 90 },
  { category: 'CASHEW BURFY', name: 'Cashew Burfy 250g', unitType: 'gram', unitSize: 250, sellingPrice: 225 },

  // GHEE
  { category: 'GHEE', name: 'Ghee 12ml',          unitType: 'ml',   unitSize: 12,    mlPerCrate: 144,   sellingPrice: 11 },
  { category: 'GHEE', name: 'Ghee 50ml Jar',      unitType: 'ml',   unitSize: 50,    mlPerCrate: 600,   sellingPrice: 52 },
  { category: 'GHEE', name: 'Ghee 100ml Jar',     unitType: 'ml',   unitSize: 100,   mlPerCrate: 1200,  sellingPrice: 85 },
  { category: 'GHEE', name: 'Ghee 200ml',         unitType: 'ml',   unitSize: 200,   mlPerCrate: 2400,  sellingPrice: 155 },
  { category: 'GHEE', name: 'Ghee Pet Jar 200ml', unitType: 'ml',   unitSize: 200,   mlPerCrate: 2400,  sellingPrice: 165 },
  { category: 'GHEE', name: 'Ghee 500ml',         unitType: 'ml',   unitSize: 500,   mlPerCrate: 6000,  sellingPrice: 350 },
  { category: 'GHEE', name: 'Ghee Pet Jar 500ml', unitType: 'ml',   unitSize: 500,   mlPerCrate: 6000,  sellingPrice: 360 },
  { category: 'GHEE', name: 'Ghee 1000ml',        unitType: 'ml',   unitSize: 1000,  mlPerCrate: 12000, sellingPrice: 700 },
  { category: 'GHEE', name: 'Ghee Pet Jar 1000ml', unitType: 'ml',  unitSize: 1000,  mlPerCrate: 12000, sellingPrice: 720 },
  { category: 'GHEE', name: 'Ghee Pet Jar 5L',    unitType: 'ml',   unitSize: 5000,  mlPerCrate: 60000, sellingPrice: 3525 },
  { category: 'GHEE', name: 'Ghee 15kg Tin',      unitType: 'gram', unitSize: 15000, sellingPrice: 11475 },

  // BADAM POWDER
  { category: 'BADAM POWDER', name: 'Badam Powder 10g',  unitType: 'gram', unitSize: 10,  sellingPrice: 4.50 },
  { category: 'BADAM POWDER', name: 'Badam Powder 200g', unitType: 'gram', unitSize: 200, sellingPrice: 107 },
  { category: 'BADAM POWDER', name: 'Badam Powder 500g', unitType: 'gram', unitSize: 500, sellingPrice: 196 },

  // T-BUTTER
  { category: 'T-BUTTER', name: 'T-Butter 8g',           unitType: 'gram', unitSize: 8,    sellingPrice: 5 },
  { category: 'T-BUTTER', name: 'T-Butter 10g',          unitType: 'gram', unitSize: 10,   sellingPrice: 6 },
  { category: 'T-BUTTER', name: 'T-Butter Salted 100g',  unitType: 'gram', unitSize: 100,  sellingPrice: 62 },
  { category: 'T-BUTTER', name: 'T-Butter Unsalted 200g', unitType: 'gram', unitSize: 200, sellingPrice: 120 },
  { category: 'T-BUTTER', name: 'T-Butter Unsalted 500g', unitType: 'gram', unitSize: 500, sellingPrice: 305 },

  // BASUNDI MIX
  { category: 'BASUNDI MIX', name: 'Basundi Mix 200g', unitType: 'gram', unitSize: 200, sellingPrice: 100 },

  // JAMOON MIX
  { category: 'JAMOON MIX', name: 'Jamoon Mix 200g', unitType: 'gram', unitSize: 200, sellingPrice: 71 },

  // NANDINI INSTANT PAYASAM MIX
  { category: 'NANDINI INSTANT PAYASAM MIX', name: 'Nandini Instant Payasa Mix 200g', unitType: 'gram', unitSize: 200, sellingPrice: 80 },

  // PANEER
  { category: 'PANEER', name: 'Paneer 200g',    unitType: 'gram', unitSize: 200,  sellingPrice: 96 },
  { category: 'PANEER', name: 'Paneer 500g',    unitType: 'gram', unitSize: 500,  sellingPrice: 211 },
  { category: 'PANEER', name: 'Paneer 1kg',     unitType: 'gram', unitSize: 1000, sellingPrice: 408 },
  { category: 'PANEER', name: 'Paneer 1kg (B)', unitType: 'gram', unitSize: 1000, sellingPrice: 408 },

  // SKIM MILK POWDER
  { category: 'SKIM MILK POWDER', name: 'SMP 100g',   unitType: 'gram', unitSize: 100,  sellingPrice: 44 },
  { category: 'SKIM MILK POWDER', name: 'SMP 200g',   unitType: 'gram', unitSize: 200,  sellingPrice: 78 },
  { category: 'SKIM MILK POWDER', name: 'SMP 500g',   unitType: 'gram', unitSize: 500,  sellingPrice: 190 },
  { category: 'SKIM MILK POWDER', name: 'SMP 1000g',  unitType: 'gram', unitSize: 1000, sellingPrice: 370 },
  { category: 'SKIM MILK POWDER', name: 'SMP 1kg PP', unitType: 'gram', unitSize: 1000, sellingPrice: 321.81 },

  // STERILISED FLAVOURED MILK
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Badam 180ml',      unitType: 'ml',   unitSize: 180, mlPerCrate: 2160, sellingPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Strawberry 180ml', unitType: 'ml',   unitSize: 180, mlPerCrate: 2160, sellingPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Pista 180ml',      unitType: 'ml',   unitSize: 180, mlPerCrate: 2160, sellingPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Kesar Badam 180ml', unitType: 'ml',  unitSize: 180, mlPerCrate: 2160, sellingPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'Ayurvedic Milk Combo',            unitType: 'piece', unitSize: null, sellingPrice: 100 },
  { category: 'STERILISED FLAVOURED MILK', name: 'Herbal Spiced Milk 200ml',        unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, sellingPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM CH Pet Bottle 200ml',         unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, sellingPrice: 30 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Bottle 200ml',                unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, sellingPrice: 20 },

  // GOOD LIFE SLIM
  { category: 'GOOD LIFE SLIM', name: 'Slim Milk 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, sellingPrice: 30 },

  // GOOD LIFE MILK
  { category: 'GOOD LIFE MILK', name: 'Good Life Milk 500ml',      unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  sellingPrice: 31 },
  { category: 'GOOD LIFE MILK', name: 'Good Life Fino 180ml',      unitType: 'ml', unitSize: 180,  mlPerCrate: 2160,  sellingPrice: 13 },
  { category: 'GOOD LIFE MILK', name: 'Good Life Brick 500ml',     unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  sellingPrice: 35 },
  { category: 'GOOD LIFE MILK', name: 'Good Life Milk Brick 1000ml', unitType: 'ml', unitSize: 1000, mlPerCrate: 12000, sellingPrice: 68 },

  // FLAVOURED MILK TETRA-PCK
  { category: 'FLAVOURED MILK TETRA-PCK', name: 'FM Tetra Badam 200ml',      unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 25 },
  { category: 'FLAVOURED MILK TETRA-PCK', name: 'FM Tetra Pista 200ml',      unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 25 },
  { category: 'FLAVOURED MILK TETRA-PCK', name: 'FM Tetra Strawberry 200ml', unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 25 },

  // ULLAS GULLA
  { category: 'ULLAS GULLA', name: 'Ullas Gulla 100g', unitType: 'gram', unitSize: 100, sellingPrice: 50 },
  { category: 'ULLAS GULLA', name: 'Ullas Gulla 200g', unitType: 'gram', unitSize: 200, sellingPrice: 90 },

  // MILK SHAKE
  { category: 'MILK SHAKE', name: 'Milk Shake Chocolate 180ml', unitType: 'ml', unitSize: 180, mlPerCrate: 2160, sellingPrice: 30 },
  { category: 'MILK SHAKE', name: 'Milk Shake Vanilla 180ml',   unitType: 'ml', unitSize: 180, mlPerCrate: 2160, sellingPrice: 30 },
  { category: 'MILK SHAKE', name: 'Milk Shake Banana 200ml',    unitType: 'ml', unitSize: 200, mlPerCrate: 2400, sellingPrice: 30 },

  // KARA BOONDI
  { category: 'KARA BOONDI', name: 'Kara Boondi 180g', unitType: 'gram', unitSize: 180, sellingPrice: 56 },
  { category: 'KARA BOONDI', name: 'Kara Boondi 30g',  unitType: 'gram', unitSize: 30,  sellingPrice: 9.50 },

  // BOMBAY MIXTURE
  { category: 'BOMBAY MIXTURE', name: 'Bombay Mixture 180g', unitType: 'gram', unitSize: 180, sellingPrice: 56 },
  { category: 'BOMBAY MIXTURE', name: 'Bombay Mixture 30g',  unitType: 'gram', unitSize: 30,  sellingPrice: 9.50 },

  // KODUBALE
  { category: 'KODUBALE', name: 'Kodubale 180g',       unitType: 'gram', unitSize: 180, sellingPrice: 56 },
  { category: 'KODUBALE', name: 'Masala Kodubale 30g', unitType: 'gram', unitSize: 30,  sellingPrice: 9.50 },

  // BENNE MURUKU
  { category: 'BENNE MURUKU', name: 'Benne Muruku 180g',              unitType: 'gram', unitSize: 180, sellingPrice: 56 },
  { category: 'BENNE MURUKU', name: 'Benne Muruku 30g',               unitType: 'gram', unitSize: 30,  sellingPrice: 9.50 },
  { category: 'BENNE MURUKU', name: 'Paneer Muruku Pepper/Chilli 180g', unitType: 'gram', unitSize: 180, sellingPrice: 70 },

  // BADAM HALWA
  { category: 'BADAM HALWA', name: 'Badam Halwa 100g', unitType: 'gram', unitSize: 100, sellingPrice: 60 },

  // GULAB JAMOON
  { category: 'GULAB JAMOON', name: 'Gulab Jamoon Tin 500g',          unitType: 'gram', unitSize: 500, sellingPrice: 150 },
  { category: 'GULAB JAMOON', name: 'Sugarfree Gulab Jamoon Tin 500g', unitType: 'gram', unitSize: 500, sellingPrice: 220 },

  // KUNDA
  { category: 'KUNDA', name: 'Kunda 200g', unitType: 'gram', unitSize: 200, sellingPrice: 125 },
  { category: 'KUNDA', name: 'Kunda 250g', unitType: 'gram', unitSize: 250, sellingPrice: 145 },
  { category: 'KUNDA', name: 'Kunda 400g', unitType: 'gram', unitSize: 400, sellingPrice: 240 },

  // KHOVA
  { category: 'KHOVA', name: 'Khova 200g',              unitType: 'gram', unitSize: 200,  sellingPrice: 90 },
  { category: 'KHOVA', name: 'Khova 1kg',               unitType: 'gram', unitSize: 1000, sellingPrice: 400 },
  { category: 'KHOVA', name: 'Khova 5kg',               unitType: 'gram', unitSize: 5000, sellingPrice: 1850 },
  { category: 'KHOVA', name: 'Khova 5kg Kalakand',      unitType: 'gram', unitSize: 5000, sellingPrice: 1850 },
  { category: 'KHOVA', name: 'Khova Peanut Chikki 12g', unitType: 'gram', unitSize: 12,   sellingPrice: 5 },
  { category: 'KHOVA', name: 'Khova Peanut Chikki 25g', unitType: 'gram', unitSize: 25,   sellingPrice: 10 },
  { category: 'KHOVA', name: 'Khova Peanut Chikki 100g', unitType: 'gram', unitSize: 100, sellingPrice: 45 },

  // NANDINI COOKIES
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies 100g',        unitType: 'gram', unitSize: 100,  sellingPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies Pepper 100g', unitType: 'gram', unitSize: 100,  sellingPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies Chilli 100g', unitType: 'gram', unitSize: 100,  sellingPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Butter Cookies 100g',         unitType: 'gram', unitSize: 100,  sellingPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Choco Cookies 100g',          unitType: 'gram', unitSize: 100,  sellingPrice: 36 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies 1kg',         unitType: 'gram', unitSize: 1000, sellingPrice: 275 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies Salted 1kg',  unitType: 'gram', unitSize: 1000, sellingPrice: 270 },

  // NANDINI SEEDS DELIGHT
  { category: 'NANDINI SEEDS DELIGHT', name: 'Nandini Seeds Delight 12g',  unitType: 'gram', unitSize: 12,   sellingPrice: 10 },
  { category: 'NANDINI SEEDS DELIGHT', name: 'Nandini Seeds Delight 1kg',  unitType: 'gram', unitSize: 1000, sellingPrice: 833.33 },

  // NANDINI RUSK
  { category: 'NANDINI RUSK', name: 'Nandini Milk Rusk 20g', unitType: 'gram', unitSize: 20, sellingPrice: 5 },
  { category: 'NANDINI RUSK', name: 'Nandini Milk Rusk 75g', unitType: 'gram', unitSize: 75, sellingPrice: 20 },

  // NANDINI CHEESE
  { category: 'NANDINI CHEESE', name: 'Cheese Squeeze 100g',          unitType: 'gram', unitSize: 100,  sellingPrice: 65 },
  { category: 'NANDINI CHEESE', name: 'Cheese Dips 200g',             unitType: 'gram', unitSize: 200,  sellingPrice: 110 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Slice 100g',  unitType: 'gram', unitSize: 100,  sellingPrice: 75 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Slice 200g',  unitType: 'gram', unitSize: 200,  sellingPrice: 131 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Block 200g',  unitType: 'gram', unitSize: 200,  sellingPrice: 113 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Block 400g',  unitType: 'gram', unitSize: 400,  sellingPrice: 206 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Cubes 200g',  unitType: 'gram', unitSize: 200,  sellingPrice: 113 },
  { category: 'NANDINI CHEESE', name: 'Cheddar Cheese Block 200g',    unitType: 'gram', unitSize: 200,  sellingPrice: 141 },
  { category: 'NANDINI CHEESE', name: 'Mozzarella Cheese Shredded 200g', unitType: 'gram', unitSize: 200, sellingPrice: 108 },
  { category: 'NANDINI CHEESE', name: 'Mozzarella Cheese Block 1kg',  unitType: 'gram', unitSize: 1000, sellingPrice: 441 },
  { category: 'NANDINI CHEESE', name: 'Mozzarella Cheese Diced 1kg',  unitType: 'gram', unitSize: 1000, sellingPrice: 460 },

  // KAJU KATLI
  { category: 'KAJU KATLI', name: 'Kaju Katli 200g', unitType: 'gram', unitSize: 200, sellingPrice: 220 },

  // NANDINI AQUA DRINKING WATER
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 250ml',  unitType: 'ml', unitSize: 250,  mlPerCrate: 3000,  sellingPrice: 6 },
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 500ml',  unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  sellingPrice: 10 },
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 1000ml', unitType: 'ml', unitSize: 1000, mlPerCrate: 12000, sellingPrice: 20 },
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 2000ml', unitType: 'ml', unitSize: 2000, mlPerCrate: 24000, sellingPrice: 30 },
];

// ─── Exported function (called from index.js on startup) ─────────────────────
async function seedNandiniProducts() {
  // 1. Find Nandini brand
  const brand = await prisma.brand.findFirst({ where: { name: 'Nandini' } });
  if (!brand) throw new Error('Nandini brand not found in database');

  // Guard: skip only if active products already exist for this brand
  const activeCount = await prisma.product.count({
    where: { brandId: brand.id, isActive: true },
  });
  if (activeCount >= 140) {
    console.log(`Nandini seed already applied (${activeCount} active products) — skipping.`);
    return;
  }
  console.log(`✓ Found Nandini brand (ID: ${brand.id})`);

  // 2. Archive existing active products (rename to avoid unique-constraint conflicts on re-run)
  const existing = await prisma.product.findMany({
    where: { brandId: brand.id },
    select: { id: true, name: true, isActive: true },
  });
  if (existing.length > 0) {
    const ts = Date.now();
    for (const p of existing) {
      await prisma.product.update({
        where: { id: p.id },
        data: { name: `${p.name} [archived-${ts}]`, isActive: false },
      });
    }
    console.log(`✓ Archived ${existing.length} existing products`);
  }

  // 3. Delete existing categories (no FK constraint — products store category as plain string)
  const { count: catCount } = await prisma.category.deleteMany({ where: { brandId: brand.id } });
  console.log(`✓ Deleted ${catCount} old categories`);

  // 4. Create new categories (deduplicated)
  const categoryNames = [...new Set(PRODUCTS.map(p => p.category))];
  await prisma.category.createMany({
    data: categoryNames.map(name => ({ brandId: brand.id, name })),
  });
  console.log(`✓ Created ${categoryNames.length} categories`);

  // 5. Create new products
  const { count: prodCount } = await prisma.product.createMany({
    data: PRODUCTS.map(p => ({
      brandId:           brand.id,
      name:              p.name,
      category:          p.category,
      unitType:          p.unitType,
      unitSize:          p.unitType !== 'piece' ? p.unitSize : null,
      mlPerCrate:        p.unitType === 'ml'    ? p.mlPerCrate : null,
      costPrice:         0,
      sellingPrice:      p.sellingPrice,
      isActive:          true,
      showInStockReceipt: true,
    })),
  });
  console.log(`✓ Created ${prodCount} products`);

  // 6. Seed Nandini routes (idempotent upsert)
  const NANDINI_ROUTES = ['220', '512', '127', '148', '155'];
  for (let i = 0; i < NANDINI_ROUTES.length; i++) {
    await prisma.route.upsert({
      where: { brandId_routeNumber: { brandId: brand.id, routeNumber: NANDINI_ROUTES[i] } },
      update: {},
      create: { brandId: brand.id, routeNumber: NANDINI_ROUTES[i], displayOrder: i },
    });
  }
  console.log(`✓ Seeded ${NANDINI_ROUTES.length} Nandini routes (${NANDINI_ROUTES.join(', ')})`);
  console.log('\nDone! Nandini product catalogue is ready.');
}

module.exports = { seedNandiniProducts };

// Allow direct execution: node scripts/seed-nandini.js
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  seedNandiniProducts()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
