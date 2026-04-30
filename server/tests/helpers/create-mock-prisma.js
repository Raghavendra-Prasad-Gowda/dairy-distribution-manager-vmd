'use strict';

const { mockFn } = require('./mock-fn');

/**
 * Creates a fresh Prisma mock with all models and methods used by the app.
 * Each method is a mockFn() that can be configured per test.
 */
function createMockPrisma() {
  const mock = {
    appSettings: {
      findFirst:  mockFn(),
      findMany:   mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      upsert:     mockFn(),
    },
    brand: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
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
    salesperson: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
    },
    salespersonPrice: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      upsert:     mockFn(),
    },
    stockDispatch: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      update:     mockFn(),
      delete:     mockFn(),
      aggregate:  mockFn(),
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
    },
    salespersonPayment: {
      findMany:   mockFn(),
      findUnique: mockFn(),
      create:     mockFn(),
      delete:     mockFn(),
      aggregate:  mockFn(),
    },
    $transaction: mockFn(),
    $queryRaw:    mockFn(),
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
