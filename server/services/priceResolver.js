const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

/**
 * Resolves the selling price for a salesperson + product on a given date.
 * Picks the most recently effective price on or before the date.
 * Throws AppError(400) if no price is configured.
 */
async function getSalespersonPrice(salespersonId, productId, date) {
  const priceRecord = await prisma.salespersonPrice.findFirst({
    where: {
      salespersonId,
      productId,
      effectiveFrom: { lte: new Date(date) },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!priceRecord) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    throw new AppError(
      `No selling price configured for product "${product?.name ?? productId}". Please set up prices in Salesperson Setup.`,
      400
    );
  }

  return Number(priceRecord.sellingPrice);
}

module.exports = { getSalespersonPrice };
