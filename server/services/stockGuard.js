const prisma = require('../lib/prisma');

/**
 * Validates that each requested dispatch quantity does not exceed
 * available stock (received − already dispatched) for that date.
 *
 * @param {Array<{productId: number, quantity: number}>} items
 * @param {string} date  YYYY-MM-DD
 * @param {number|null} excludeDispatchId  Exclude this dispatch when recalculating (for updates)
 * @returns {Array<{productId, productName, requested, available}>} — empty = OK
 */
async function validateDispatchStock(items, date, excludeDispatchId = null) {
  const receiptDate = new Date(date);

  // Run all aggregate queries in parallel (was: sequential N×2 queries)
  const results = await Promise.all(
    items.map(async (item) => {
      const [receivedAgg, dispatchedAgg] = await Promise.all([
        prisma.stockReceipt.aggregate({
          where: { productId: item.productId, receiptDate },
          _sum: { quantity: true },
        }),
        prisma.stockDispatchItem.aggregate({
          where: {
            productId: item.productId,
            dispatch: {
              dispatchDate: receiptDate,
              ...(excludeDispatchId ? { NOT: { id: excludeDispatchId } } : {}),
            },
          },
          _sum: { quantity: true },
        }),
      ]);
      const received   = Number(receivedAgg._sum.quantity ?? 0);
      const dispatched = Number(dispatchedAgg._sum.quantity ?? 0);
      return { item, available: received - dispatched };
    })
  );

  const overLimit = results.filter(({ item, available }) => item.quantity > available);
  if (overLimit.length === 0) return [];

  // Batch-fetch product names for all error items in one query
  const errorIds = overLimit.map(({ item }) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: errorIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(products.map(p => [p.id, p.name]));

  return overLimit.map(({ item, available }) => ({
    productId:   item.productId,
    productName: nameMap[item.productId] ?? 'Unknown',
    requested:   item.quantity,
    available:   Math.max(0, available),
  }));
}

module.exports = { validateDispatchStock };
