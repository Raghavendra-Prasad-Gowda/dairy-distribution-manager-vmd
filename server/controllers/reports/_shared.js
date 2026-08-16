'use strict';

const AppError = require('../../utils/AppError');

// Defense-in-depth: every report endpoint mounts under requireAdmin in app.js,
// but if that middleware is ever moved or misconfigured, the controller still
// refuses. Salespeople have no business reading aggregate reports.
function assertAdmin(req) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    throw new AppError('Admin access required', 403);
  }
}

// dailyDispatch alone is also readable by dispatcher (route-level gate is
// requireAdminOrDispatcher) — same defense-in-depth purpose as assertAdmin.
function assertAdminOrDispatcher(req) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'superadmin' && role !== 'dispatcher') {
    throw new AppError('Admin access required', 403);
  }
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

/** profit ÷ revenue as a percentage; 0 when nothing was dispatched. */
function marginPct(profit, revenue) {
  return revenue === 0 ? 0 : round2((profit / revenue) * 100);
}

module.exports = { assertAdmin, assertAdminOrDispatcher, round2, round3, marginPct };
