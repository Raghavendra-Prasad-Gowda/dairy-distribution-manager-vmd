'use strict';

const asyncHandler = require('../../middleware/asyncHandler');
const prisma = require('../../lib/prisma');
const { assertAdmin } = require('./_shared');

const outstanding = asyncHandler(async (req, res) => {
  assertAdmin(req);
  const [dairyBalances, spBalances] = await Promise.all([
    prisma.dairyBalance.findMany({
      where: { brand: { isActive: true } },
      orderBy: { balanceDate: 'desc' },
      distinct: ['brandId'],
      include: { brand: { select: { id: true, name: true } } },
    }),
    prisma.salespersonBalance.findMany({
      where: { salesperson: { isActive: true } },
      orderBy: { balanceDate: 'desc' },
      distinct: ['salespersonId'],
      include: { salesperson: { select: { id: true, name: true } } },
    }),
  ]);

  res.json({
    success: true,
    data: {
      dairy: dairyBalances.map((b) => ({
        brandId:     b.brand.id,
        brandName:   b.brand.name,
        outstanding: Number(b.closingBalance),
      })),
      salespeople: spBalances.map((b) => ({
        salespersonId:   b.salesperson.id,
        salespersonName: b.salesperson.name,
        outstanding:     Number(b.closingBalance),
      })),
    },
  });
});

module.exports = { outstanding };
