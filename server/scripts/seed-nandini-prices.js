'use strict';

/**
 * seed-nandini-prices.js
 *
 * Updates all 140 Nandini products with cost prices (Rate column) and
 * selling prices (MRP column) sourced from the official Nandini rate chart app.
 *
 * Guard: skips if 140+ Nandini products already have costPrice > 0.
 *
 * Usage:
 *   cd server && node scripts/seed-nandini-prices.js
 */

const prisma = require('../lib/prisma');

// name must exactly match the product name in the DB (from seed-nandini.js)
// costPrice  = "Rate" column from the Nandini rate chart app
// sellingPrice = "MRP" column from the Nandini rate chart app
const PRICE_DATA = [
  // ── TONED MILK ────────────────────────────────────────────────────────────────
  { name: 'Toned Milk 500ml',                    costPrice:  22.45,    sellingPrice:  24,  containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Toned Milk 1000ml',                   costPrice:  43.00,    sellingPrice:  46,  containerType: 'crate', unitsPerContainer: 12 },

  // ── HOMOGENISED MILK ──────────────────────────────────────────────────────────
  { name: 'Homoginsed Milk 250ml',               costPrice:  13.125,   sellingPrice:  14,  containerType: 'crate', unitsPerContainer: 48 },
  { name: 'Homoginsed Milk 500ml',               costPrice:  22.45,    sellingPrice:  24,  containerType: 'crate', unitsPerContainer: 24 },

  // ── HOMOGENISED COW MILK ──────────────────────────────────────────────────────
  { name: 'Homogensed Cow Milk 500ml',           costPrice:  24.35,    sellingPrice:  26,  containerType: 'crate', unitsPerContainer: 48 },
  { name: 'Homogenised Cow Milk 160ml',          costPrice:   8.50,    sellingPrice:  10   },

  // ── SHUBAM MILK ───────────────────────────────────────────────────────────────
  { name: 'Shubam Milk 500ml',                   costPrice:  25.30,    sellingPrice:  27,  containerType: 'crate', unitsPerContainer: 48 },

  // ── NANDINI SPECIAL MILK ──────────────────────────────────────────────────────
  { name: 'Nandini Special Milk 250ml',          costPrice:  13.825,   sellingPrice:  15,  containerType: 'crate', unitsPerContainer: 48 },
  { name: 'Nandini Special Milk 500ml',          costPrice:  25.15,    sellingPrice:  27,  containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Nandini Special Milk 1000ml',         costPrice:  48.30,    sellingPrice:  52,  containerType: 'crate', unitsPerContainer: 24 },

  // ── CURD ──────────────────────────────────────────────────────────────────────
  { name: 'Curd 140g',                           costPrice:   8.42,    sellingPrice:  10   },
  { name: 'Curd 200g',                           costPrice:  11.79,    sellingPrice:  13,  containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Curd 500g',                           costPrice:  25.34,    sellingPrice:  28,  containerType: 'crate', unitsPerContainer: 24 },
  { name: 'Curd 1kg',                            costPrice:  48.84,    sellingPrice:  54,  containerType: 'crate', unitsPerContainer: 12 },

  // ── SAMRUDHI ──────────────────────────────────────────────────────────────────
  { name: 'Samrudhi 500ml',                      costPrice:  26.25,    sellingPrice:  28,  containerType: 'crate', unitsPerContainer: 24 },

  // ── MANGO LASSI ───────────────────────────────────────────────────────────────
  { name: 'Mango Lassi 180ml',                   costPrice:  12.17,    sellingPrice:  15,  containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Mango Lassi Pet Bottle 180ml',        costPrice:  20.83,    sellingPrice:  25   },

  // ── SWEET LASSI ───────────────────────────────────────────────────────────────
  { name: 'Lassi 200ml',                         costPrice:  12.50,    sellingPrice:  14,  containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Sweet Lassi Pet Bottle 180ml',        costPrice:  16.67,    sellingPrice:  20   },
  { name: 'Lassi Mango Tetra Pack 200ml',        costPrice:  20.83,    sellingPrice:  25   },

  // ── BUTTER MILK ───────────────────────────────────────────────────────────────
  { name: 'Masala Majjige 200ml',                costPrice:   8.33,    sellingPrice:  10,  containerType: 'crate', unitsPerContainer: 60 },
  { name: 'Tetra Pack Spiced Butter Milk 200ml', costPrice:  12.50,    sellingPrice:  15   },
  { name: 'Butter Milk Pet Bottle 180ml',        costPrice:  12.50,    sellingPrice:  15   },

  // ── RAGI MALT ─────────────────────────────────────────────────────────────────
  { name: 'Ragi Ambli 200ml',                    costPrice:   7.50,    sellingPrice:   9,  containerType: 'crate', unitsPerContainer: 60 },

  // ── PROBIOTIC CURD ────────────────────────────────────────────────────────────
  { name: 'Probiotic Butter Milk 200ml',         costPrice:   8.33,    sellingPrice:  10   },
  { name: 'Probiotic Curd 200g',                 costPrice:  25.00,    sellingPrice:  35   },

  // ── PEDA ──────────────────────────────────────────────────────────────────────
  { name: 'Peda 25g',                            costPrice:  12.50,    sellingPrice:  14   },
  { name: 'Peda 100g',                           costPrice:  53.571,   sellingPrice:  60   },
  { name: 'Peda 250g',                           costPrice: 125.00,    sellingPrice: 140   },
  { name: 'Kesar Peda 200g',                     costPrice: 113.044,   sellingPrice: 130   },
  { name: 'Elachi Peda 200g',                    costPrice: 113.044,   sellingPrice: 130   },
  { name: 'Sugarfree Peda 200g',                 costPrice: 151.786,   sellingPrice: 170   },
  { name: 'Jaggery Peda 200g',                   costPrice: 111.608,   sellingPrice: 125   },

  // ── MYSORE PAK ────────────────────────────────────────────────────────────────
  { name: 'Mysore Pak 25g',                      costPrice:  13.393,   sellingPrice:  15   },
  { name: 'Mysore Pak 100g',                     costPrice:  53.571,   sellingPrice:  60   },
  { name: 'Mysore Pak 250g',                     costPrice: 142.858,   sellingPrice: 160   },
  { name: 'Mysore Pak 500g',                     costPrice: 250.00,    sellingPrice: 280   },

  // ── CASHEW BURFY ──────────────────────────────────────────────────────────────
  { name: 'Cashew Burfy 100g',                   costPrice:  80.357,   sellingPrice:  90   },
  { name: 'Cashew Burfy 250g',                   costPrice: 200.893,   sellingPrice: 225   },

  // ── GHEE ──────────────────────────────────────────────────────────────────────
  { name: 'Ghee 12ml',                           costPrice:   9.17,    sellingPrice:  11   },
  { name: 'Ghee 50ml Jar',                       costPrice:  47.273,   sellingPrice:  52   },
  { name: 'Ghee 100ml Jar',                      costPrice:  77.273,   sellingPrice:  85   },
  { name: 'Ghee 200ml',                          costPrice: 140.91,    sellingPrice: 155   },
  { name: 'Ghee Pet Jar 200ml',                  costPrice: 150.00,    sellingPrice: 165   },
  { name: 'Ghee 500ml',                          costPrice: 318.182,   sellingPrice: 350   },
  { name: 'Ghee Pet Jar 500ml',                  costPrice: 327.275,   sellingPrice: 360   },
  { name: 'Ghee 1000ml',                         costPrice: 636.36,    sellingPrice: 700   },
  { name: 'Ghee Pet Jar 1000ml',                 costPrice: 654.55,    sellingPrice: 720   },
  { name: 'Ghee Pet Jar 5L',                     costPrice: 3233.95,   sellingPrice: 3525  },
  { name: 'Ghee 15kg Tin',                       costPrice: 10724.30,  sellingPrice: 11475 },

  // ── BADAM POWDER ──────────────────────────────────────────────────────────────
  { name: 'Badam Powder 10g',                    costPrice:   4.018,   sellingPrice:   4.5 },
  { name: 'Badam Powder 200g',                   costPrice:  95.536,   sellingPrice: 107   },
  { name: 'Badam Powder 500g',                   costPrice: 175.00,    sellingPrice: 196   },

  // ── T-BUTTER ──────────────────────────────────────────────────────────────────
  { name: 'T-Butter 8g',                         costPrice:   4.464,   sellingPrice:   5   },
  { name: 'T-Butter 10g',                        costPrice:   5.357,   sellingPrice:   6   },
  { name: 'T-Butter Salted 100g',                costPrice:  55.357,   sellingPrice:  62   },
  { name: 'T-Butter Unsalted 200g',              costPrice: 107.142,   sellingPrice: 120   },
  { name: 'T-Butter Unsalted 500g',              costPrice: 272.325,   sellingPrice: 305   },

  // ── BASUNDI MIX ───────────────────────────────────────────────────────────────
  { name: 'Basundi Mix 200g',                    costPrice:  89.286,   sellingPrice: 100   },

  // ── JAMOON MIX ────────────────────────────────────────────────────────────────
  { name: 'Jamoon Mix 200g',                     costPrice:  63.392,   sellingPrice:  71   },

  // ── NANDINI INSTANT PAYASAM MIX ───────────────────────────────────────────────
  { name: 'Nandini Instant Payasa Mix 200g',     costPrice:  71.428,   sellingPrice:  80   },

  // ── PANEER ────────────────────────────────────────────────────────────────────
  { name: 'Paneer 200g',                         costPrice:  81.472,   sellingPrice:  96   },
  { name: 'Paneer 500g',                         costPrice: 179.04,    sellingPrice: 211   },
  { name: 'Paneer 1kg',                          costPrice: 352.17,    sellingPrice: 408   },
  { name: 'Paneer 1kg (B)',                      costPrice: 408.00,    sellingPrice: 408   },

  // ── SKIM MILK POWDER ──────────────────────────────────────────────────────────
  { name: 'SMP 100g',                            costPrice:  38.94,    sellingPrice:  44   },
  { name: 'SMP 200g',                            costPrice:  70.91,    sellingPrice:  78   },
  { name: 'SMP 500g',                            costPrice: 172.73,    sellingPrice: 190   },
  { name: 'SMP 1000g',                           costPrice: 336.36,    sellingPrice: 370   },
  { name: 'SMP 1kg PP',                          costPrice: 321.81,    sellingPrice: 321.81},

  // ── STERILISED FLAVOURED MILK ─────────────────────────────────────────────────
  { name: 'SFM Pet Bottle Badam 180ml',          costPrice:  20.833,   sellingPrice:  25   },
  { name: 'SFM Pet Bottle Strawberry 180ml',     costPrice:  20.833,   sellingPrice:  25   },
  { name: 'SFM Pet Bottle Pista 180ml',          costPrice:  20.833,   sellingPrice:  25   },
  { name: 'SFM Pet Bottle Kesar Badam 180ml',    costPrice:  20.83,    sellingPrice:  25   },
  { name: 'SFM Pet Bottle Vanilla 180ml',        costPrice:  20.833,   sellingPrice:  25   },
  { name: 'SFM Pet Bottle Chocolate 180ml',      costPrice:  20.833,   sellingPrice:  25   },
  { name: 'Ayurvedic Milk Combo',                costPrice:  83.33,    sellingPrice: 100   },
  { name: 'Herbal Spiced Milk 200ml',            costPrice:  20.833,   sellingPrice:  25   },
  { name: 'SFM CH Pet Bottle 200ml',             costPrice:  25.00,    sellingPrice:  30   },
  { name: 'SFM Bottle 200ml',                    costPrice:  20.833,   sellingPrice:  25   },

  // ── GOOD LIFE SLIM ────────────────────────────────────────────────────────────
  { name: 'Slim Milk 500ml',                     costPrice:  27.32,    sellingPrice:  30   },

  // ── GOOD LIFE MILK ────────────────────────────────────────────────────────────
  { name: 'Good Life Milk 500ml',                costPrice:  28.23,    sellingPrice:  31   },
  { name: 'Good Life Fino 180ml',                costPrice:  11.87,    sellingPrice:  13   },
  { name: 'Good Life Brick 500ml',               costPrice:  31.89,    sellingPrice:  35   },
  { name: 'Good Life Milk Brick 1000ml',         costPrice:  61.94,    sellingPrice:  68   },

  // ── FLAVOURED MILK TETRA-PCK ──────────────────────────────────────────────────
  { name: 'FM Tetra Badam 200ml',                costPrice:  20.833,   sellingPrice:  25   },
  { name: 'FM Tetra Pista 200ml',                costPrice:  20.833,   sellingPrice:  25   },
  { name: 'FM Tetra Strawberry 200ml',           costPrice:  20.833,   sellingPrice:  25   },

  // ── ULLAS GULLA ───────────────────────────────────────────────────────────────
  { name: 'Ullas Gulla 100g',                    costPrice:  44.64,    sellingPrice:  50   },
  { name: 'Ullas Gulla 200g',                    costPrice:  80.36,    sellingPrice:  90   },

  // ── MILK SHAKE ────────────────────────────────────────────────────────────────
  { name: 'Milk Shake Chocolate 180ml',          costPrice:  25.00,    sellingPrice:  30   },
  { name: 'Milk Shake Vanilla 180ml',            costPrice:  25.00,    sellingPrice:  30   },
  { name: 'Milk Shake Banana 200ml',             costPrice:  25.00,    sellingPrice:  30   },

  // ── KARA BOONDI ───────────────────────────────────────────────────────────────
  { name: 'Kara Boondi 180g',                    costPrice:  44.80,    sellingPrice:  56   },
  { name: 'Kara Boondi 30g',                     costPrice:   7.92,    sellingPrice:   9.5 },

  // ── BOMBAY MIXTURE ────────────────────────────────────────────────────────────
  { name: 'Bombay Mixture 180g',                 costPrice:  44.80,    sellingPrice:  56   },
  { name: 'Bombay Mixture 30g',                  costPrice:   7.92,    sellingPrice:   9.5 },

  // ── KODUBALE ──────────────────────────────────────────────────────────────────
  { name: 'Kodubale 180g',                       costPrice:  44.80,    sellingPrice:  56   },
  { name: 'Masala Kodubale 30g',                 costPrice:   7.92,    sellingPrice:   9.5 },

  // ── BENNE MURUKU ──────────────────────────────────────────────────────────────
  { name: 'Benne Muruku 180g',                   costPrice:  44.80,    sellingPrice:  56   },
  { name: 'Benne Muruku 30g',                    costPrice:   7.92,    sellingPrice:   9.5 },
  { name: 'Paneer Muruku Pepper/Chilli 180g',    costPrice:  62.50,    sellingPrice:  70   },

  // ── BADAM HALWA ───────────────────────────────────────────────────────────────
  { name: 'Badam Halwa 100g',                    costPrice:  52.174,   sellingPrice:  60   },

  // ── GULAB JAMOON ──────────────────────────────────────────────────────────────
  { name: 'Gulab Jamoon Tin 500g',               costPrice: 133.93,    sellingPrice: 150   },
  { name: 'Sugarfree Gulab Jamoon Tin 500g',     costPrice: 196.429,   sellingPrice: 220   },

  // ── KUNDA ─────────────────────────────────────────────────────────────────────
  { name: 'Kunda 200g',                          costPrice: 111.608,   sellingPrice: 125   },
  { name: 'Kunda 250g',                          costPrice: 129.465,   sellingPrice: 145   },
  { name: 'Kunda 400g',                          costPrice: 214.29,    sellingPrice: 240   },

  // ── KHOVA ─────────────────────────────────────────────────────────────────────
  { name: 'Khova 200g',                          costPrice:  78.26,    sellingPrice:  90   },
  { name: 'Khova 1kg',                           costPrice: 357.14,    sellingPrice: 400   },
  { name: 'Khova 5kg',                           costPrice: 1850.00,   sellingPrice: 1850  },
  { name: 'Khova 5kg Kalakand',                  costPrice: 1850.00,   sellingPrice: 1850  },
  { name: 'Khova Peanut Chikki 100g',            costPrice:  40.179,   sellingPrice:  45   },
  { name: 'Khova Peanut Chikki 12g',             costPrice:   4.24,    sellingPrice:   5   },
  { name: 'Khova Peanut Chikki 25g',             costPrice:   8.47,    sellingPrice:  10   },

  // ── NANDINI COOKIES ───────────────────────────────────────────────────────────
  { name: 'Nandini Cookies 100g',                costPrice:  28.182,   sellingPrice:  31   },
  { name: 'Nandini Cookies Pepper 100g',         costPrice:  28.182,   sellingPrice:  31   },
  { name: 'Nandini Cookies Chilli 100g',         costPrice:  28.182,   sellingPrice:  31   },
  { name: 'Butter Cookies 100g',                 costPrice:  27.679,   sellingPrice:  31   },
  { name: 'Choco Cookies 100g',                  costPrice:  32.143,   sellingPrice:  36   },
  { name: 'Nandini Cookies 1kg',                 costPrice: 245.54,    sellingPrice: 275   },
  { name: 'Nandini Cookies Salted 1kg',          costPrice: 245.45,    sellingPrice: 270   },

  // ── NANDINI SEEDS DELIGHT ─────────────────────────────────────────────────────
  { name: 'Nandini Seeds Delight 1kg',           costPrice: 744.04,    sellingPrice: 833.33},
  { name: 'Nandini Seeds Delight 12g',           costPrice:   8.93,    sellingPrice:  10   },

  // ── NANDINI RUSK ─────────────────────────────────────────────────────────────
  { name: 'Nandini Milk Rusk 75g',               costPrice:  17.39,    sellingPrice:  20   },
  { name: 'Nandini Milk Rusk 20g',               costPrice:   4.24,    sellingPrice:   5   },

  // ── NANDINI CHEESE ────────────────────────────────────────────────────────────
  { name: 'Cheese Squeeze 100g',                 costPrice:  54.167,   sellingPrice:  65   },
  { name: 'Cheese Dips 200g',                    costPrice:  91.666,   sellingPrice: 110   },
  { name: 'Processed Cheese Slice 100g',         costPrice:  60.00,    sellingPrice:  75   },
  { name: 'Processed Cheese Slice 200g',         costPrice: 105.646,   sellingPrice: 131   },
  { name: 'Processed Cheese Block 200g',         costPrice:  94.166,   sellingPrice: 113   },
  { name: 'Processed Cheese Block 400g',         costPrice: 171.668,   sellingPrice: 206   },
  { name: 'Processed Cheese Cubes 200g',         costPrice:  94.166,   sellingPrice: 113   },
  { name: 'Cheddar Cheese Block 200g',           costPrice: 117.50,    sellingPrice: 141   },
  { name: 'Mozzarella Cheese Shredded 200g',     costPrice:  92.308,   sellingPrice: 108   },
  { name: 'Mozzarella Cheese Block 1kg',         costPrice: 376.92,    sellingPrice: 441   },
  { name: 'Mozzarella Cheese Diced 1kg',         costPrice: 410.71,    sellingPrice: 460   },

  // ── KAJU KATLI ────────────────────────────────────────────────────────────────
  { name: 'Kaju Katli 200g',                     costPrice: 196.428,   sellingPrice: 220   },

  // ── NANDINI AQUA DRINKING WATER ───────────────────────────────────────────────
  { name: 'Nandini Aqua 250ml',                  costPrice:   4.61,    sellingPrice:   6   },
  { name: 'Nandini Aqua 500ml',                  costPrice:   7.10,    sellingPrice:  10   },
  { name: 'Nandini Aqua 1000ml',                 costPrice:  14.18,    sellingPrice:  20   },
  { name: 'Nandini Aqua 2000ml',                 costPrice:  22.38,    sellingPrice:  30   },
];

async function seedNandiniPrices() {
  const brand = await prisma.brand.findFirst({ where: { name: 'Nandini' } });
  if (!brand) throw new Error('Nandini brand not found');

  // Guard: skip if all 140 products already have a non-zero cost price
  const pricedCount = await prisma.product.count({
    where: { brandId: brand.id, isActive: true, costPrice: { gt: 0 } },
  });
  if (pricedCount >= PRICE_DATA.length) {
    console.log(`Nandini prices already set (${pricedCount} products priced) — skipping.`);
    return;
  }

  console.log('💰  Updating Nandini product prices…');

  let updated = 0;
  let notFound = 0;

  for (const entry of PRICE_DATA) {
    const product = await prisma.product.findFirst({
      where: { brandId: brand.id, name: entry.name, isActive: true },
    });

    if (!product) {
      console.warn(`  ⚠️  Not found: "${entry.name}"`);
      notFound++;
      continue;
    }

    const data = {
      costPrice:          entry.costPrice,
      sellingPrice:       entry.sellingPrice,
      showInStockReceipt: true,
    };
    if (entry.containerType)     data.containerType     = entry.containerType;
    if (entry.unitsPerContainer) data.unitsPerContainer = entry.unitsPerContainer;

    await prisma.product.update({ where: { id: product.id }, data });
    updated++;
  }

  console.log(`  ✅  Updated ${updated} products${notFound ? `, ⚠️  ${notFound} not found` : ''}`);
}

module.exports = { seedNandiniPrices };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  seedNandiniPrices()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
