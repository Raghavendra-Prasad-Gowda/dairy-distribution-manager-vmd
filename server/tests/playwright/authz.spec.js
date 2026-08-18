'use strict';

/**
 * utils/authz.js — role assertion helpers.
 * Unit-level (no HTTP round trip needed): assertRole/assertAdmin are pure
 * functions over a plain req.user object.
 */

const { test, expect } = require('@playwright/test');
const { assertRole, assertAdmin, ADMIN_ROLES } = require('../../utils/authz');

test.describe('assertRole', () => {
  test('does not throw when req.user.role is in the allowed list', () => {
    expect(() => assertRole({ user: { role: 'dispatcher' } }, 'admin', 'dispatcher')).not.toThrow();
  });

  test('throws AppError(403) when req.user.role is not in the allowed list', () => {
    expect(() => assertRole({ user: { role: 'salesman' } }, 'admin', 'dispatcher')).toThrow(/Admin access required/);
  });

  test('falls back to ADMIN_ROLES when called with no explicit roles', () => {
    // No roles passed → `roles.length` is 0 → uses the ADMIN_ROLES default.
    expect(() => assertRole({ user: { role: 'admin' } })).not.toThrow();
    expect(() => assertRole({ user: { role: 'superadmin' } })).not.toThrow();
    expect(() => assertRole({ user: { role: 'salesman' } })).toThrow(/Admin access required/);
  });
});

test.describe('assertAdmin', () => {
  test('allows admin and superadmin', () => {
    expect(() => assertAdmin({ user: { role: 'admin' } })).not.toThrow();
    expect(() => assertAdmin({ user: { role: 'superadmin' } })).not.toThrow();
  });

  test('rejects every other role', () => {
    expect(() => assertAdmin({ user: { role: 'dispatcher' } })).toThrow();
    expect(() => assertAdmin({ user: { role: 'salesman' } })).toThrow();
    expect(() => assertAdmin({ user: {} })).toThrow();
  });

  test('ADMIN_ROLES is exactly ["admin", "superadmin"]', () => {
    expect(ADMIN_ROLES).toEqual(['admin', 'superadmin']);
  });
});
