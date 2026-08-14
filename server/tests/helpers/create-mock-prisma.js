'use strict';

const { mockFn } = require('./mock-fn');

/**
 * Creates a fresh Prisma mock with all models and methods used by the app.
 * Each method is a mockFn() that can be configured per test.
 */
function createMockPrisma() {
  const mock = {
    adminUser: {
      findFirst:  mockFn(),
      findUnique: mockFn(),
      findMany:   mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      count:      mockFn(),
    },
    brand: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      findFirst:  mockFn(),
    },
    product: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      updateMany: mockFn(),
      delete:     mockFn(),
    },
    category: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      updateMany: mockFn(),
    },
    route: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
    },
    stockReceipt: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      createMany: mockFn(),
      upsert:     mockFn(),
      delete:     mockFn(),
      deleteMany: mockFn(),
      aggregate:  mockFn(),
      groupBy:    mockFn(),
    },
    dairyBalance: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      findFirst:  mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      upsert:     mockFn(),
      deleteMany: mockFn(),
    },
    dairyPayment: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      aggregate:  mockFn(),
    },
    dairyDepositTopUp: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      aggregate:  mockFn(),
    },
    salesperson: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      findFirst:  mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      count:      mockFn(),
    },
    productCostPrice: {
      findMany:   mockFn(),
      findFirst:  mockFn(),
      create:     mockFn(),
      upsert:     mockFn(),
    },
    productSellingPrice: {
      findMany:   mockFn(),
      findFirst:  mockFn(),
      create:     mockFn(),
      upsert:     mockFn(),
    },
    salespersonPrice: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      deleteMany: mockFn(),
      upsert:     mockFn(),
    },
    stockDispatch: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      updateMany: mockFn(),
      delete:     mockFn(),
      deleteMany: mockFn(),
      aggregate:  mockFn(),
      count:      mockFn(),
    },
    dispatchDayFinalization: {
      findUnique: mockFn(),
      create:     mockFn(),
    },
    stockDispatchItem: {
      findMany:   mockFn(),
      createMany: mockFn(),
      deleteMany: mockFn(),
      aggregate:  mockFn(),
      groupBy:    mockFn(),
    },
    salespersonBalance: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      findFirst:  mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      upsert:     mockFn(),
      deleteMany: mockFn(),
      count:      mockFn(),
    },
    salespersonPayment: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      deleteMany: mockFn(),
      aggregate:  mockFn(),
      count:      mockFn(),
    },
    salespersonProduct: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      upsert:     mockFn(),
      delete:     mockFn(),
      deleteMany: mockFn(),
      createMany: mockFn(),
      updateMany: mockFn(),
    },
    $transaction: mockFn(),
    $queryRaw:    mockFn(),
  };

  // Make $transaction execute callback-form transactions against the mock by default.
  // Tests that need to override the return value can still call mockResolvedValue(),
  // which clears _impl and returns the fixed value (skipping the callback).
  const txDefault = async (arg) => {
    if (typeof arg === 'function') return arg(mock);
    return arg; // array form — each element is already a promise from mockFn calls
  };
  mock.$transaction.mockImplementation(txDefault);

  // Ensure reset() restores the default transaction behavior
  const origTxReset = mock.$transaction.reset;
  mock.$transaction.reset = () => {
    origTxReset();
    mock.$transaction.mockImplementation(txDefault);
  };

  mock.reset = () => {
    const resetAll = (obj) => {
      for (const val of Object.values(obj)) {
        if (typeof val === 'function' && val.reset) {
          val.reset();
        } else if (val && typeof val === 'object') {
          resetAll(val);
        }
      }
    };
    resetAll(mock);
  };

  return mock;
}

module.exports = { createMockPrisma };
