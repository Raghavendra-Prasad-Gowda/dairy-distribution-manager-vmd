'use strict';

/**
 * JWT edge cases that need the server's signing secret.
 *
 * The role-by-endpoint matrix, dispatcher limits and salesman scoping that used to live here are now
 * checked against the real deployed backend in server/automation/ (access-control-matrix.feature,
 * security.feature, dispatches.feature, ...), which cannot sign a valid token. These two cases can only be
 * made with the secret, so they stay as mocked tests. See server/automation/COVERAGE.md.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const jwt = require('jsonwebtoken');

const { test } = setupSuite();

const SECRET = 'test-secret-for-ci';
const expiredToken = () => jwt.sign({ id: 1 }, SECRET, { expiresIn: '-1h' });

test.describe('RBAC — JWT lifecycle', () => {
  test('expired token → 401 across multiple endpoints', async ({ request }) => {
    const paths = [
      '/api/v1/brands',
      '/api/v1/dispatches',
      '/api/v1/dairy-payments',
    ];
    for (const path of paths) {
      const res = await request.get(path, {
        headers: { Authorization: `Bearer ${expiredToken()}` },
      });
      expect(res.status(), `${path} should reject expired token`).toBe(401);
    }
  });

  test('token with no role claim is rejected (fail-closed)', async ({ request }) => {
    // JWT only contains { id: 1 } — auth middleware rejects tokens without a role
    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: `Bearer ${jwt.sign({ id: 1 }, SECRET, { expiresIn: '1h' })}` },
    });
    expect(res.status()).toBe(401);
  });
});
