'use strict';

const AppError = require('../utils/AppError');

/**
 * Shared payment-ledger logic used by both the dairy and salesperson payment
 * controllers, which are otherwise near-identical. Only the genuinely shared
 * ALGORITHMIC core lives here (the date-change cascade and bulk-entity
 * validation); per-entity wiring (Slack event names, payload keys, log lines)
 * stays explicit in each controller where it reads clearly.
 */

/**
 * Recalculate balances around a payment whose date may have changed.
 * Cascades the earlier date first, then the later date only if the date moved —
 * so a moved payment fixes both the date it left and the date it arrived.
 *
 * @param {(entityId:number, date:string, tx:object)=>Promise<void>} recalc
 * @param {number} entityId  brandId or salespersonId
 * @param {string} oldDate   YYYY-MM-DD
 * @param {string} newDate   YYYY-MM-DD
 * @param {object} tx        Prisma transaction client
 */
async function cascadeAroundDateChange(recalc, entityId, oldDate, newDate, tx) {
  const earliest = oldDate < newDate ? oldDate : newDate;
  await recalc(entityId, earliest, tx);
  if (newDate !== oldDate) {
    const later = oldDate < newDate ? newDate : oldDate;
    await recalc(entityId, later, tx);
  }
}

/**
 * Validate the entity ids for a bulk top-up:
 *   - each entity may appear at most once
 *   - every id must exist
 * Returns the found rows (id + name) for downstream Slack naming.
 *
 * @param {object}   opts
 * @param {number[]} opts.ids
 * @param {(args:object)=>Promise<Array>} opts.findMany  e.g. prisma.brand.findMany
 * @param {string}   opts.label  Singular, lowercase entity label ("brand" / "salesperson").
 * @param {object}   [opts.select]  Prisma select (defaults to id+name); pass extra fields
 *                                   when the caller needs them for further checks.
 * @returns {Promise<Array<{id:number,name:string}>>}
 */
async function validateBulkEntities({ ids, findMany, label, select = { id: true, name: true } }) {
  if (new Set(ids).size !== ids.length) {
    throw new AppError(`Each ${label} can only appear once`, 400);
  }
  const found = await findMany({ where: { id: { in: ids } }, select });
  if (found.length !== ids.length) {
    const missing = ids.filter((id) => !found.some((r) => r.id === id));
    const Label = label.charAt(0).toUpperCase() + label.slice(1);
    throw new AppError(`${Label} not found: ${missing.join(', ')}`, 404);
  }
  return found;
}

module.exports = { cascadeAroundDateChange, validateBulkEntities };
