'use strict';

/**
 * services/paymentLedger.js — shared payment-ledger algorithmic core.
 * Tested directly against a fake recalc function (no HTTP/Prisma needed).
 */

const { test, expect } = require('@playwright/test');
const { cascadeAroundDateChange, validateBulkEntities } = require('../../services/paymentLedger');

test.describe('cascadeAroundDateChange', () => {
  test('recalculates only once when the date did not change', async () => {
    const calls = [];
    const recalc = async (id, date) => { calls.push(date); };

    await cascadeAroundDateChange(recalc, 1, '2026-04-30', '2026-04-30', {});

    expect(calls).toEqual(['2026-04-30']);
  });

  test('recalculates the earlier date first, then the later date, when the date moved forward', async () => {
    const calls = [];
    const recalc = async (id, date) => { calls.push(date); };

    await cascadeAroundDateChange(recalc, 1, '2026-04-10', '2026-04-20', {});

    expect(calls).toEqual(['2026-04-10', '2026-04-20']);
  });

  test('recalculates the earlier date first even when the payment moved backward in time', async () => {
    const calls = [];
    const recalc = async (id, date) => { calls.push(date); };

    await cascadeAroundDateChange(recalc, 1, '2026-04-20', '2026-04-10', {});

    expect(calls).toEqual(['2026-04-10', '2026-04-20']);
  });
});

test.describe('validateBulkEntities', () => {
  test('returns the found rows when every id is unique and exists', async () => {
    const found = await validateBulkEntities({
      ids: [1, 2],
      findMany: async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      label: 'brand',
    });
    expect(found).toHaveLength(2);
  });

  test('throws 400 when the same id appears twice', async () => {
    await expect(validateBulkEntities({
      ids: [1, 1],
      findMany: async () => [],
      label: 'brand',
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/only appear once/) });
  });

  test('throws 404 listing the missing ids when some are not found', async () => {
    await expect(validateBulkEntities({
      ids: [1, 2, 3],
      findMany: async () => [{ id: 1, name: 'A' }],
      label: 'salesperson',
    })).rejects.toMatchObject({ statusCode: 404, message: expect.stringMatching(/Salesperson not found: 2, 3/) });
  });
});
