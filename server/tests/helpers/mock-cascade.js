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

/** Mocks all reads/writes used by the dairy balance cascade. */
function mockDairyCascade(mockPrisma, { subsequentDates = [], onPaymentAggregate } = {}) {
  mockPrisma.dairyBalance.findFirst.mockResolvedValue(null);
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
function mockSalespersonCascade(mockPrisma, { subsequentDates = [], onPaymentAggregate } = {}) {
  mockPrisma.salespersonBalance.findFirst.mockResolvedValue(null);
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
