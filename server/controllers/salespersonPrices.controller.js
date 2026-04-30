const asyncHandler = require('../middleware/asyncHandler');
const { validate, parseId, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');

const getPrices = asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.params.id, 'Salesperson ID');

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ brandId: 'asc' }, { name: 'asc' }],
  });

  const today = new Date();
  const priceRows = await prisma.salespersonPrice.findMany({
    where: { salespersonId, effectiveFrom: { lte: today } },
    orderBy: { effectiveFrom: 'desc' },
  });

  const priceMap = {};
  for (const row of priceRows) {
    if (!priceMap[row.productId]) priceMap[row.productId] = row;
  }

  const result = products.map((p) => ({
    productId:    p.id,
    productName:  p.name,
    brandId:      p.brandId,
    brandName:    p.brand.name,
    sellingPrice: priceMap[p.id] ? Number(priceMap[p.id].sellingPrice) : null,
    effectiveFrom: priceMap[p.id]?.effectiveFrom ?? null,
  }));

  res.json({ success: true, data: result });
});

const bulkSave = asyncHandler(async (req, res) => {
  const salespersonId = parseId(req.params.id, 'Salesperson ID');
  const data = validate(schemas.bulkSalespersonPrices, req, res);
  if (!data) return;

  const effectiveFrom = new Date(data.effectiveFrom);
  const upserts = data.prices.map((item) =>
    prisma.salespersonPrice.upsert({
      where: { salespersonId_productId_effectiveFrom: { salespersonId, productId: item.productId, effectiveFrom } },
      update: { sellingPrice: item.sellingPrice },
      create: { salespersonId, productId: item.productId, sellingPrice: item.sellingPrice, effectiveFrom },
    })
  );

  await prisma.$transaction(upserts);
  res.json({ success: true, data: { message: `${data.prices.length} prices saved` } });
});

module.exports = { getPrices, bulkSave };
