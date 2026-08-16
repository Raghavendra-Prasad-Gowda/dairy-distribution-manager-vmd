'use strict';

/**
 * Reports controller — barrel.
 *
 * Each report is its own module under controllers/reports/ (one aggregation per
 * file) with shared role guards and rounding helpers in reports/_shared.js. This
 * file preserves the original `reports.controller` import surface so the router
 * and tests need no change.
 */

const { dairyStatement } = require('./reports/dairyStatement');
const { salespersonStatement } = require('./reports/salespersonStatement');
const { stockSummary } = require('./reports/stockSummary');
const { outstanding } = require('./reports/outstanding');
const { depositSummary } = require('./reports/depositSummary');
const { profitLoss } = require('./reports/profitLoss');
const { dailyDispatch } = require('./reports/dailyDispatch');

module.exports = {
  dairyStatement,
  salespersonStatement,
  stockSummary,
  outstanding,
  depositSummary,
  dailyDispatch,
  profitLoss,
};
