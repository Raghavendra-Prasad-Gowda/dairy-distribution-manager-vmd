'use strict';

/**
 * Dispatches controller — barrel.
 *
 * Split into controllers/dispatches/ by concern rather than one-file-per-handler
 * (unlike reports.controller.js's 7 independent aggregations, these handlers
 * share tight infrastructure — actor resolution, lock semantics, price
 * re-derivation — so grouping by concern keeps that shared state in one place
 * instead of scattering imports across ten files):
 *   - _shared.js        actor resolution, lock-state helpers, price re-derivation
 *   - read.js            getAll, getSummary
 *   - write.js            createOrUpdate, remove
 *   - lockLifecycle.js   submit, lock, unlock, openForEntry
 *   - dayFinalization.js finalizeDay, unfinalizeDay
 *
 * This file preserves the original `dispatches.controller` import surface so
 * the router and tests need no change.
 */

const { getAll, getSummary } = require('./dispatches/read');
const { createOrUpdate, remove } = require('./dispatches/write');
const { submit, lock, unlock, openForEntry } = require('./dispatches/lockLifecycle');
const { finalizeDay, unfinalizeDay } = require('./dispatches/dayFinalization');

module.exports = {
  getAll,
  getSummary,
  createOrUpdate,
  submit,
  lock,
  unlock,
  openForEntry,
  finalizeDay,
  unfinalizeDay,
  remove,
};
