'use strict';

const AppError = require('./AppError');

const ADMIN_ROLES = ['admin', 'superadmin'];

/**
 * Defense-in-depth role assertion for use INSIDE controllers.
 *
 * Every admin route already mounts behind the `requireAdmin`/`requireSuperAdmin`
 * middleware in app.js; this is the belt-and-suspenders check so a controller
 * still refuses if that middleware is ever moved or misconfigured. Replaces the
 * three competing idioms (inline `role !== 'admin' && role !== 'superadmin'`
 * throws, an `assertAdmin` helper, and an `ADMIN_TIER` Set) with one helper.
 *
 * @param {import('express').Request} req
 * @param {...string} roles Allowed roles (defaults to admin + superadmin).
 */
function assertRole(req, ...roles) {
  const allowed = roles.length ? roles : ADMIN_ROLES;
  if (!allowed.includes(req.user?.role)) {
    throw new AppError('Admin access required', 403);
  }
}

/** Shorthand for the common admin/superadmin gate. */
function assertAdmin(req) {
  assertRole(req, ...ADMIN_ROLES);
}

module.exports = { assertRole, assertAdmin, ADMIN_ROLES };
