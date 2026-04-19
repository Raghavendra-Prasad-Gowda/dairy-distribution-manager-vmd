'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../lib/prisma');

// ─── 140 Nandini products from rate chart photos ──────────────────────────────
const PRODUCTS = [
  // TONED MILK
  { category: 'TONED MILK', name: 'Toned Milk 500ml',  unitType: 'ml',   unitSize: 500,   mlPerCrate: 6000,  dairyPrice: 24 },
  { category: 'TONED MILK', name: 'Toned Milk 1000ml', unitType: 'ml',   unitSize: 1000,  mlPerCrate: 12000, dairyPrice: 46 },

  // HOMOGINSED MILK
  { category: 'HOMOGINSED MILK', name: 'Homoginsed Milk 250ml', unitType: 'ml', unitSize: 250, mlPerCrate: 3000, dairyPrice: 14 },
  { category: 'HOMOGINSED MILK', name: 'Homoginsed Milk 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, dairyPrice: 24 },

  // HOMOGINSED COW MILK
  { category: 'HOMOGINSED COW MILK', name: 'Homogensed Cow Milk 500ml',   unitType: 'ml', unitSize: 500, mlPerCrate: 6000, dairyPrice: 26 },
  { category: 'HOMOGINSED COW MILK', name: 'Homogenised Cow Milk 160ml',  unitType: 'ml', unitSize: 160, mlPerCrate: 1920, dairyPrice: 10 },

  // SHUBAM MILK
  { category: 'SHUBAM MILK', name: 'Shubam Milk 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, dairyPrice: 27 },

  // NANDINI SPECIAL MILK
  { category: 'NANDINI SPECIAL MILK', name: 'Nandini Special Milk 250ml',  unitType: 'ml', unitSize: 250,  mlPerCrate: 3000,  dairyPrice: 15 },
  { category: 'NANDINI SPECIAL MILK', name: 'Nandini Special Milk 500ml',  unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  dairyPrice: 27 },
  { category: 'NANDINI SPECIAL MILK', name: 'Nandini Special Milk 1000ml', unitType: 'ml', unitSize: 1000, mlPerCrate: 12000, dairyPrice: 52 },

  // CURD
  { category: 'CURD', name: 'Curd 140g', unitType: 'gram', unitSize: 140,  dairyPrice: 10 },
  { category: 'CURD', name: 'Curd 200g', unitType: 'gram', unitSize: 200,  dairyPrice: 13 },
  { category: 'CURD', name: 'Curd 500g', unitType: 'gram', unitSize: 500,  dairyPrice: 28 },
  { category: 'CURD', name: 'Curd 1kg',  unitType: 'gram', unitSize: 1000, dairyPrice: 54 },

  // SAMRUDHI
  { category: 'SAMRUDHI', name: 'Samrudhi 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, dairyPrice: 28 },

  // MANGO LASSI
  { category: 'MANGO LASSI', name: 'Mango Lassi 180ml',         unitType: 'ml', unitSize: 180, mlPerCrate: 2160, dairyPrice: 15 },
  { category: 'MANGO LASSI', name: 'Mango Lassi Pet Bottle 180ml', unitType: 'ml', unitSize: 180, mlPerCrate: 2160, dairyPrice: 25 },

  // SWEET LASSI
  { category: 'SWEET LASSI', name: 'Lassi 200ml',                   unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 14 },
  { category: 'SWEET LASSI', name: 'Sweet Lassi Pet Bottle 180ml',  unitType: 'ml', unitSize: 180, mlPerCrate: 2160, dairyPrice: 20 },
  { category: 'SWEET LASSI', name: 'Lassi Mango Tetra Pack 200ml',  unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 25 },

  // BUTTER MILK
  { category: 'BUTTER MILK', name: 'Masala Majjige 200ml',              unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 10 },
  { category: 'BUTTER MILK', name: 'Tetra Pack Spiced Butter Milk 200ml', unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 15 },
  { category: 'BUTTER MILK', name: 'Butter Milk Pet Bottle 180ml',      unitType: 'ml', unitSize: 180, mlPerCrate: 2160, dairyPrice: 15 },

  // RAGI MALT
  { category: 'RAGI MALT', name: 'Ragi Ambli 200ml', unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 9 },

  // PROBIOTIC CURD
  { category: 'PROBIOTIC CURD', name: 'Probiotic Butter Milk 200ml', unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, dairyPrice: 10 },
  { category: 'PROBIOTIC CURD', name: 'Probiotic Curd 200g',         unitType: 'gram', unitSize: 200, dairyPrice: 35 },

  // PEDA
  { category: 'PEDA', name: 'Peda 25g',           unitType: 'gram', unitSize: 25,  dairyPrice: 14 },
  { category: 'PEDA', name: 'Peda 100g',          unitType: 'gram', unitSize: 100, dairyPrice: 60 },
  { category: 'PEDA', name: 'Peda 250g',          unitType: 'gram', unitSize: 250, dairyPrice: 140 },
  { category: 'PEDA', name: 'Kesar Peda 200g',    unitType: 'gram', unitSize: 200, dairyPrice: 130 },
  { category: 'PEDA', name: 'Elachi Peda 200g',   unitType: 'gram', unitSize: 200, dairyPrice: 130 },
  { category: 'PEDA', name: 'Sugarfree Peda 200g', unitType: 'gram', unitSize: 200, dairyPrice: 170 },
  { category: 'PEDA', name: 'Jaggery Peda 200g',  unitType: 'gram', unitSize: 200, dairyPrice: 125 },

  // MYSORE PAK
  { category: 'MYSORE PAK', name: 'Mysore Pak 25g',  unitType: 'gram', unitSize: 25,  dairyPrice: 15 },
  { category: 'MYSORE PAK', name: 'Mysore Pak 100g', unitType: 'gram', unitSize: 100, dairyPrice: 60 },
  { category: 'MYSORE PAK', name: 'Mysore Pak 250g', unitType: 'gram', unitSize: 250, dairyPrice: 160 },
  { category: 'MYSORE PAK', name: 'Mysore Pak 500g', unitType: 'gram', unitSize: 500, dairyPrice: 280 },

  // CASHEW BURFY
  { category: 'CASHEW BURFY', name: 'Cashew Burfy 100g', unitType: 'gram', unitSize: 100, dairyPrice: 90 },
  { category: 'CASHEW BURFY', name: 'Cashew Burfy 250g', unitType: 'gram', unitSize: 250, dairyPrice: 225 },

  // GHEE
  { category: 'GHEE', name: 'Ghee 12ml',          unitType: 'ml',   unitSize: 12,    mlPerCrate: 144,   dairyPrice: 11 },
  { category: 'GHEE', name: 'Ghee 50ml Jar',      unitType: 'ml',   unitSize: 50,    mlPerCrate: 600,   dairyPrice: 52 },
  { category: 'GHEE', name: 'Ghee 100ml Jar',     unitType: 'ml',   unitSize: 100,   mlPerCrate: 1200,  dairyPrice: 85 },
  { category: 'GHEE', name: 'Ghee 200ml',         unitType: 'ml',   unitSize: 200,   mlPerCrate: 2400,  dairyPrice: 155 },
  { category: 'GHEE', name: 'Ghee Pet Jar 200ml', unitType: 'ml',   unitSize: 200,   mlPerCrate: 2400,  dairyPrice: 165 },
  { category: 'GHEE', name: 'Ghee 500ml',         unitType: 'ml',   unitSize: 500,   mlPerCrate: 6000,  dairyPrice: 350 },
  { category: 'GHEE', name: 'Ghee Pet Jar 500ml', unitType: 'ml',   unitSize: 500,   mlPerCrate: 6000,  dairyPrice: 360 },
  { category: 'GHEE', name: 'Ghee 1000ml',        unitType: 'ml',   unitSize: 1000,  mlPerCrate: 12000, dairyPrice: 700 },
  { category: 'GHEE', name: 'Ghee Pet Jar 1000ml', unitType: 'ml',  unitSize: 1000,  mlPerCrate: 12000, dairyPrice: 720 },
  { category: 'GHEE', name: 'Ghee Pet Jar 5L',    unitType: 'ml',   unitSize: 5000,  mlPerCrate: 60000, dairyPrice: 3525 },
  { category: 'GHEE', name: 'Ghee 15kg Tin',      unitType: 'gram', unitSize: 15000, dairyPrice: 11475 },

  // BADAM POWDER
  { category: 'BADAM POWDER', name: 'Badam Powder 10g',  unitType: 'gram', unitSize: 10,  dairyPrice: 4.50 },
  { category: 'BADAM POWDER', name: 'Badam Powder 200g', unitType: 'gram', unitSize: 200, dairyPrice: 107 },
  { category: 'BADAM POWDER', name: 'Badam Powder 500g', unitType: 'gram', unitSize: 500, dairyPrice: 196 },

  // T-BUTTER
  { category: 'T-BUTTER', name: 'T-Butter 8g',           unitType: 'gram', unitSize: 8,    dairyPrice: 5 },
  { category: 'T-BUTTER', name: 'T-Butter 10g',          unitType: 'gram', unitSize: 10,   dairyPrice: 6 },
  { category: 'T-BUTTER', name: 'T-Butter Salted 100g',  unitType: 'gram', unitSize: 100,  dairyPrice: 62 },
  { category: 'T-BUTTER', name: 'T-Butter Unsalted 200g', unitType: 'gram', unitSize: 200, dairyPrice: 120 },
  { category: 'T-BUTTER', name: 'T-Butter Unsalted 500g', unitType: 'gram', unitSize: 500, dairyPrice: 305 },

  // BASUNDI MIX
  { category: 'BASUNDI MIX', name: 'Basundi Mix 200g', unitType: 'gram', unitSize: 200, dairyPrice: 100 },

  // JAMOON MIX
  { category: 'JAMOON MIX', name: 'Jamoon Mix 200g', unitType: 'gram', unitSize: 200, dairyPrice: 71 },

  // NANDINI INSTANT PAYASAM MIX
  { category: 'NANDINI INSTANT PAYASAM MIX', name: 'Nandini Instant Payasa Mix 200g', unitType: 'gram', unitSize: 200, dairyPrice: 80 },

  // PANEER
  { category: 'PANEER', name: 'Paneer 200g',    unitType: 'gram', unitSize: 200,  dairyPrice: 96 },
  { category: 'PANEER', name: 'Paneer 500g',    unitType: 'gram', unitSize: 500,  dairyPrice: 211 },
  { category: 'PANEER', name: 'Paneer 1kg',     unitType: 'gram', unitSize: 1000, dairyPrice: 408 },
  { category: 'PANEER', name: 'Paneer 1kg (B)', unitType: 'gram', unitSize: 1000, dairyPrice: 408 },

  // SKIM MILK POWDER
  { category: 'SKIM MILK POWDER', name: 'SMP 100g',   unitType: 'gram', unitSize: 100,  dairyPrice: 44 },
  { category: 'SKIM MILK POWDER', name: 'SMP 200g',   unitType: 'gram', unitSize: 200,  dairyPrice: 78 },
  { category: 'SKIM MILK POWDER', name: 'SMP 500g',   unitType: 'gram', unitSize: 500,  dairyPrice: 190 },
  { category: 'SKIM MILK POWDER', name: 'SMP 1000g',  unitType: 'gram', unitSize: 1000, dairyPrice: 370 },
  { category: 'SKIM MILK POWDER', name: 'SMP 1kg PP', unitType: 'gram', unitSize: 1000, dairyPrice: 321.81 },

  // STERILISED FLAVOURED MILK
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Badam 180ml',      unitType: 'ml',   unitSize: 180, mlPerCrate: 2160, dairyPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Strawberry 180ml', unitType: 'ml',   unitSize: 180, mlPerCrate: 2160, dairyPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Pista 180ml',      unitType: 'ml',   unitSize: 180, mlPerCrate: 2160, dairyPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Pet Bottle Kesar Badam 180ml', unitType: 'ml',  unitSize: 180, mlPerCrate: 2160, dairyPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'Ayurvedic Milk Combo',            unitType: 'piece', unitSize: null, dairyPrice: 100 },
  { category: 'STERILISED FLAVOURED MILK', name: 'Herbal Spiced Milk 200ml',        unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, dairyPrice: 25 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM CH Pet Bottle 200ml',         unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, dairyPrice: 30 },
  { category: 'STERILISED FLAVOURED MILK', name: 'SFM Bottle 200ml',                unitType: 'ml',   unitSize: 200, mlPerCrate: 2400, dairyPrice: 20 },

  // GOOD LIFE SLIM
  { category: 'GOOD LIFE SLIM', name: 'Slim Milk 500ml', unitType: 'ml', unitSize: 500, mlPerCrate: 6000, dairyPrice: 30 },

  // GOOD LIFE MILK
  { category: 'GOOD LIFE MILK', name: 'Good Life Milk 500ml',      unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  dairyPrice: 31 },
  { category: 'GOOD LIFE MILK', name: 'Good Life Fino 180ml',      unitType: 'ml', unitSize: 180,  mlPerCrate: 2160,  dairyPrice: 13 },
  { category: 'GOOD LIFE MILK', name: 'Good Life Brick 500ml',     unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  dairyPrice: 35 },
  { category: 'GOOD LIFE MILK', name: 'Good Life Milk Brick 1000ml', unitType: 'ml', unitSize: 1000, mlPerCrate: 12000, dairyPrice: 68 },

  // FLAVOURED MILK TETRA-PCK
  { category: 'FLAVOURED MILK TETRA-PCK', name: 'FM Tetra Badam 200ml',      unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 25 },
  { category: 'FLAVOURED MILK TETRA-PCK', name: 'FM Tetra Pista 200ml',      unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 25 },
  { category: 'FLAVOURED MILK TETRA-PCK', name: 'FM Tetra Strawberry 200ml', unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 25 },

  // ULLAS GULLA
  { category: 'ULLAS GULLA', name: 'Ullas Gulla 100g', unitType: 'gram', unitSize: 100, dairyPrice: 50 },
  { category: 'ULLAS GULLA', name: 'Ullas Gulla 200g', unitType: 'gram', unitSize: 200, dairyPrice: 90 },

  // MILK SHAKE
  { category: 'MILK SHAKE', name: 'Milk Shake Chocolate 180ml', unitType: 'ml', unitSize: 180, mlPerCrate: 2160, dairyPrice: 30 },
  { category: 'MILK SHAKE', name: 'Milk Shake Vanilla 180ml',   unitType: 'ml', unitSize: 180, mlPerCrate: 2160, dairyPrice: 30 },
  { category: 'MILK SHAKE', name: 'Milk Shake Banana 200ml',    unitType: 'ml', unitSize: 200, mlPerCrate: 2400, dairyPrice: 30 },

  // KARA BOONDI
  { category: 'KARA BOONDI', name: 'Kara Boondi 180g', unitType: 'gram', unitSize: 180, dairyPrice: 56 },
  { category: 'KARA BOONDI', name: 'Kara Boondi 30g',  unitType: 'gram', unitSize: 30,  dairyPrice: 9.50 },

  // BOMBAY MIXTURE
  { category: 'BOMBAY MIXTURE', name: 'Bombay Mixture 180g', unitType: 'gram', unitSize: 180, dairyPrice: 56 },
  { category: 'BOMBAY MIXTURE', name: 'Bombay Mixture 30g',  unitType: 'gram', unitSize: 30,  dairyPrice: 9.50 },

  // KODUBALE
  { category: 'KODUBALE', name: 'Kodubale 180g',       unitType: 'gram', unitSize: 180, dairyPrice: 56 },
  { category: 'KODUBALE', name: 'Masala Kodubale 30g', unitType: 'gram', unitSize: 30,  dairyPrice: 9.50 },

  // BENNE MURUKU
  { category: 'BENNE MURUKU', name: 'Benne Muruku 180g',              unitType: 'gram', unitSize: 180, dairyPrice: 56 },
  { category: 'BENNE MURUKU', name: 'Benne Muruku 30g',               unitType: 'gram', unitSize: 30,  dairyPrice: 9.50 },
  { category: 'BENNE MURUKU', name: 'Paneer Muruku Pepper/Chilli 180g', unitType: 'gram', unitSize: 180, dairyPrice: 70 },

  // BADAM HALWA
  { category: 'BADAM HALWA', name: 'Badam Halwa 100g', unitType: 'gram', unitSize: 100, dairyPrice: 60 },

  // GULAB JAMOON
  { category: 'GULAB JAMOON', name: 'Gulab Jamoon Tin 500g',          unitType: 'gram', unitSize: 500, dairyPrice: 150 },
  { category: 'GULAB JAMOON', name: 'Sugarfree Gulab Jamoon Tin 500g', unitType: 'gram', unitSize: 500, dairyPrice: 220 },

  // KUNDA
  { category: 'KUNDA', name: 'Kunda 200g', unitType: 'gram', unitSize: 200, dairyPrice: 125 },
  { category: 'KUNDA', name: 'Kunda 250g', unitType: 'gram', unitSize: 250, dairyPrice: 145 },
  { category: 'KUNDA', name: 'Kunda 400g', unitType: 'gram', unitSize: 400, dairyPrice: 240 },

  // KHOVA
  { category: 'KHOVA', name: 'Khova 200g',              unitType: 'gram', unitSize: 200,  dairyPrice: 90 },
  { category: 'KHOVA', name: 'Khova 1kg',               unitType: 'gram', unitSize: 1000, dairyPrice: 400 },
  { category: 'KHOVA', name: 'Khova 5kg',               unitType: 'gram', unitSize: 5000, dairyPrice: 1850 },
  { category: 'KHOVA', name: 'Khova 5kg Kalakand',      unitType: 'gram', unitSize: 5000, dairyPrice: 1850 },
  { category: 'KHOVA', name: 'Khova Peanut Chikki 12g', unitType: 'gram', unitSize: 12,   dairyPrice: 5 },
  { category: 'KHOVA', name: 'Khova Peanut Chikki 25g', unitType: 'gram', unitSize: 25,   dairyPrice: 10 },
  { category: 'KHOVA', name: 'Khova Peanut Chikki 100g', unitType: 'gram', unitSize: 100, dairyPrice: 45 },

  // NANDINI COOKIES
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies 100g',        unitType: 'gram', unitSize: 100,  dairyPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies Pepper 100g', unitType: 'gram', unitSize: 100,  dairyPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies Chilli 100g', unitType: 'gram', unitSize: 100,  dairyPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Butter Cookies 100g',         unitType: 'gram', unitSize: 100,  dairyPrice: 31 },
  { category: 'NANDINI COOKIES', name: 'Choco Cookies 100g',          unitType: 'gram', unitSize: 100,  dairyPrice: 36 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies 1kg',         unitType: 'gram', unitSize: 1000, dairyPrice: 275 },
  { category: 'NANDINI COOKIES', name: 'Nandini Cookies Salted 1kg',  unitType: 'gram', unitSize: 1000, dairyPrice: 270 },

  // NANDINI SEEDS DELIGHT
  { category: 'NANDINI SEEDS DELIGHT', name: 'Nandini Seeds Delight 12g',  unitType: 'gram', unitSize: 12,   dairyPrice: 10 },
  { category: 'NANDINI SEEDS DELIGHT', name: 'Nandini Seeds Delight 1kg',  unitType: 'gram', unitSize: 1000, dairyPrice: 833.33 },

  // NANDINI RUSK
  { category: 'NANDINI RUSK', name: 'Nandini Milk Rusk 20g', unitType: 'gram', unitSize: 20, dairyPrice: 5 },
  { category: 'NANDINI RUSK', name: 'Nandini Milk Rusk 75g', unitType: 'gram', unitSize: 75, dairyPrice: 20 },

  // NANDINI CHEESE
  { category: 'NANDINI CHEESE', name: 'Cheese Squeeze 100g',          unitType: 'gram', unitSize: 100,  dairyPrice: 65 },
  { category: 'NANDINI CHEESE', name: 'Cheese Dips 200g',             unitType: 'gram', unitSize: 200,  dairyPrice: 110 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Slice 100g',  unitType: 'gram', unitSize: 100,  dairyPrice: 75 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Slice 200g',  unitType: 'gram', unitSize: 200,  dairyPrice: 131 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Block 200g',  unitType: 'gram', unitSize: 200,  dairyPrice: 113 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Block 400g',  unitType: 'gram', unitSize: 400,  dairyPrice: 206 },
  { category: 'NANDINI CHEESE', name: 'Processed Cheese Cubes 200g',  unitType: 'gram', unitSize: 200,  dairyPrice: 113 },
  { category: 'NANDINI CHEESE', name: 'Cheddar Cheese Block 200g',    unitType: 'gram', unitSize: 200,  dairyPrice: 141 },
  { category: 'NANDINI CHEESE', name: 'Mozzarella Cheese Shredded 200g', unitType: 'gram', unitSize: 200, dairyPrice: 108 },
  { category: 'NANDINI CHEESE', name: 'Mozzarella Cheese Block 1kg',  unitType: 'gram', unitSize: 1000, dairyPrice: 441 },
  { category: 'NANDINI CHEESE', name: 'Mozzarella Cheese Diced 1kg',  unitType: 'gram', unitSize: 1000, dairyPrice: 460 },

  // KAJU KATLI
  { category: 'KAJU KATLI', name: 'Kaju Katli 200g', unitType: 'gram', unitSize: 200, dairyPrice: 220 },

  // NANDINI AQUA DRINKING WATER
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 250ml',  unitType: 'ml', unitSize: 250,  mlPerCrate: 3000,  dairyPrice: 6 },
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 500ml',  unitType: 'ml', unitSize: 500,  mlPerCrate: 6000,  dairyPrice: 10 },
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 1000ml', unitType: 'ml', unitSize: 1000, mlPerCrate: 12000, dairyPrice: 20 },
  { category: 'NANDINI AQUA DRINKING WATER', name: 'Nandini Aqua 2000ml', unitType: 'ml', unitSize: 2000, mlPerCrate: 24000, dairyPrice: 30 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Find Nandini brand
  const brand = await prisma.brand.findFirst({ where: { name: 'Nandini' } });
  if (!brand) throw new Error('Nandini brand not found in database');
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
      dairyPrice:        p.dairyPrice,
      isActive:          true,
      showInStockReceipt: true,
    })),
  });
  console.log(`✓ Created ${prodCount} products`);
  console.log('\nDone! Nandini product catalogue is ready.');
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
