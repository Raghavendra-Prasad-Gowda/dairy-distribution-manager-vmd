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

/**
 * Mocks all reads/writes used by the salesperson balance cascade.
 *
 * The cascade aggregates salespersonPayment twice per date — once for real
 * payments (`isTopUp: false`, subtracted) and once for admin top-ups
 * (`isTopUp: true`, added). `onPaymentAggregate` answers only the payment
 * call; use `onTopUpAggregate` for the top-up call. Without it, top-ups
 * default to 0 so existing payment-only tests keep their old arithmetic.
 */
function mockSalespersonCascade(mockPrisma, { subsequentDates = [], onPaymentAggregate, onTopUpAggregate, outstanding = 1e9 } = {}) {
  mockPrisma.salespersonBalance.findFirst.mockImplementation(makeFindFirstRouter(outstanding));
  mockPrisma.salespersonBalance.findMany.mockResolvedValue(
    subsequentDates.map(d => ({ balanceDate: new Date(d) }))
  );
  mockPrisma.stockDispatch.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });

  const empty = { _sum: { amount: null } };
  const payments = onPaymentAggregate ?? (async () => empty);
  const topUps   = onTopUpAggregate   ?? (async () => empty);
  mockPrisma.salespersonPayment.aggregate.mockImplementation(async (args) =>
    args?.where?.isTopUp === true ? topUps(args) : payments(args)
  );

  mockPrisma.salespersonBalance.upsert.mockResolvedValue({});
}

module.exports = { mockDairyCascade, mockSalespersonCascade };
