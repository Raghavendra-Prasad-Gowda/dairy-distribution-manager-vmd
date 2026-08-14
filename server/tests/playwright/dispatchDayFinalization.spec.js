'use strict';

/**
 * services/dispatchDayFinalization.js — direct unit coverage
 *
 * isDayFinalizedForDispatcher() is the single rule deciding whether a
 * dispatcher can still lock/unlock/finalize a given date. It's deliberately
 * derived rather than backed by a real cron job: any date before today is
 * auto-finalized by pure string comparison (no DB row ever needed), a future
 * date is never finalized, and only "today" actually needs to look up a
 * DispatchDayFinalization row. This pins that boundary behaviour directly,
 * including confirming the DB is never hit for past/future dates.
 *
 * NOTE: the service is require()'d lazily inside each test, not at module
 * load time — setupSuite()'s beforeAll swaps lib/prisma for the mock via
 * require.cache injection, which only takes effect for modules required
 * after that hook runs. A top-level require here would capture the real
 * (unmocked) Prisma client instead.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx } = setupSuite();

const TODAY = '2026-08-14';

test.describe('isDayFinalizedForDispatcher', () => {
  test('a date before today is finalized, without querying the database', async () => {
    const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
    let called = false;
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockImplementation(async () => {
      called = true;
      return null;
    });

    const result = await isDayFinalizedForDispatcher('2026-08-13', TODAY);

    expect(result).toBe(true);
    expect(called).toBe(false);
  });

  test('today with no finalization row is not finalized', async () => {
    const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue(null);

    const result = await isDayFinalizedForDispatcher(TODAY, TODAY);

    expect(result).toBe(false);
  });

  test('today with an existing finalization row is finalized', async () => {
    const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockResolvedValue({
      id: 1, date: new Date(TODAY), finalizedByAdminUserId: 2, isAuto: false,
    });

    const result = await isDayFinalizedForDispatcher(TODAY, TODAY);

    expect(result).toBe(true);
  });

  test('a date after today is never finalized, without querying the database', async () => {
    const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
    let called = false;
    ctx.mockPrisma.dispatchDayFinalization.findUnique.mockImplementation(async () => {
      called = true;
      return null;
    });

    const result = await isDayFinalizedForDispatcher('2026-08-15', TODAY);

    expect(result).toBe(false);
    expect(called).toBe(false);
  });

  test('todayStr defaults so a date far in the past is still finalized', async () => {
    const { isDayFinalizedForDispatcher } = require('../../services/dispatchDayFinalization');
    // Sanity check the default parameter wiring — a date far in the past is
    // finalized regardless of what "today" actually resolves to right now.
    const result = await isDayFinalizedForDispatcher('2000-01-01');
    expect(result).toBe(true);
  });
});
