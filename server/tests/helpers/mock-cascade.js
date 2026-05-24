'use strict';

/**
 * Helpers for stubbing the balance-cascade dependencies.
 *
 * Both controllers and the cascade service run inside a single $transaction
 * callback now. The default `$transaction(fn)` mock runs the callback against
 * the mock prisma, so the cascade reads/writes go through these same mocks.
 *
 * Call one of these helpers in tests that touch balance writes (dispatches,
 * stock-receipts, dairy-payments, salesperson-payments) to give the cascade
 * sane no-op responses.
 */

/**
 * findFirst routing: the payment over-payment guard and the cascade both
 * call findFirst on the balance table, but with different WHERE clauses:
 *   - guard:   where: { brandId }                  → returns latest balance
 *   - cascade: where: { brandId, balanceDate:{lt} } → returns prior balance
 * Discriminate on `where.balanceDate` to give each call the right answer.
 */
function makeFindFirstRouter(outstanding) {
  return async ({ where }) => {
    if (where && where.balanceDate) return null;       // cascade "prior" lookup
    return outstanding > 0 ? { closingBalance: outstanding } : null; // guard lookup
  };
}

/** Mocks all reads/writes used by the dairy balance cascade. */
function mockDairyCascade(mockPrisma, { subsequentDates = [], onPaymentAggregate, outstanding = 1e9 } = {}) {
  mockPrisma.dairyBalance.findFirst.mockImplementation(makeFindFirstRouter(outstanding));
  mockPrisma.dairyBalance.findMany.mockResolvedValue(
    subsequentDates.map(d => ({ balanceDate: new Date(d) }))
  );
  mockPrisma.brand.findUnique.mockResolvedValue({ depositEnabled: false, depositPerLitre: 0 });
  mockPrisma.stockReceipt.findMany.mockResolvedValue([]);
  mockPrisma.category.findMany.mockResolvedValue([]);
  if (onPaymentAggregate) {
    mockPrisma.dairyPayment.aggregate.mockImplementation(onPaymentAggregate);
  } else {
    mockPrisma.dairyPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
  }
  mockPrisma.dairyBalance.upsert.mockResolvedValue({});
}

/** Mocks all reads/writes used by the salesperson balance cascade. */
function mockSalespersonCascade(mockPrisma, { subsequentDates = [], onPaymentAggregate, outstanding = 1e9 } = {}) {
  mockPrisma.salespersonBalance.findFirst.mockImplementation(makeFindFirstRouter(outstanding));
  mockPrisma.salespersonBalance.findMany.mockResolvedValue(
    subsequentDates.map(d => ({ balanceDate: new Date(d) }))
  );
  mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
  if (onPaymentAggregate) {
    mockPrisma.salespersonPayment.aggregate.mockImplementation(onPaymentAggregate);
  } else {
    mockPrisma.salespersonPayment.aggregate.mockResolvedValue({ _sum: { amount: null } });
  }
  mockPrisma.salespersonBalance.upsert.mockResolvedValue({});
}

module.exports = { mockDairyCascade, mockSalespersonCascade };
