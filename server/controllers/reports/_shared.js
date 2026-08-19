'use strict';

const { assertAdmin, assertRole } = require('../../utils/authz');

// Defense-in-depth: every report endpoint mounts under requireAdmin in app.js,
// but if that middleware is ever moved or misconfigured, the controller still
// refuses. dailyDispatch alone is also readable by a dispatcher (route-level
// gate is requireAdminOrDispatcher). Both delegate to the shared authz helper.
const assertAdminOrDispatcher = (req) => assertRole(req, 'admin', 'superadmin', 'dispatcher');

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

/** profit ÷ revenue as a percentage; 0 when nothing was dispatched. */
function marginPct(profit, revenue) {
  return revenue === 0 ? 0 : round2((profit / revenue) * 100);
}

module.exports = { assertAdmin, assertAdminOrDispatcher, round2, round3, marginPct };
