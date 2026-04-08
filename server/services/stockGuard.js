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
  const errors = [];

  for (const item of items) {
    // Total received for this product on this date
    const receivedAgg = await prisma.stockReceipt.aggregate({
      where: { productId: item.productId, receiptDate },
      _sum: { quantity: true },
    });
    const received = Number(receivedAgg._sum.quantity ?? 0);

    // Total already dispatched, excluding the current dispatch if updating
    const dispatchedAgg = await prisma.stockDispatchItem.aggregate({
      where: {
        productId: item.productId,
        dispatch: {
          dispatchDate: receiptDate,
          ...(excludeDispatchId ? { NOT: { id: excludeDispatchId } } : {}),
        },
      },
      _sum: { quantity: true },
    });
    const dispatched = Number(dispatchedAgg._sum.quantity ?? 0);
    const available = received - dispatched;

    if (item.quantity > available) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true },
      });
      errors.push({
        productId: item.productId,
        productName: product?.name ?? 'Unknown',
        requested: item.quantity,
        available: Math.max(0, available),
      });
    }
  }

  return errors;
}

module.exports = { validateDispatchStock };
