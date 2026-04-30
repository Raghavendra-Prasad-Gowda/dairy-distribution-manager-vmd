'use strict';

/**
 * Shared test setup for all API spec files.
 *
 * Usage in every spec:
 *
 *   const { test, ctx, makeAuthToken } = setupSuite();
 *
 *   test('...', async ({ request }) => {
 *     ctx.mockPrisma.brand.findMany.mockResolvedValue([...]);
 *     const res = await request.get('/api/v1/brands', {
 *       headers: { Authorization: `Bearer ${makeAuthToken()}` },
 *     });
 *     expect(res.status()).toBe(200);
 *   });
 */

process.env.JWT_SECRET  = 'test-secret-for-ci';
process.env.NODE_ENV    = 'test';
process.env.EDIT_PIN    = '123456';

const { test: base } = require('@playwright/test');
const jwt = require('jsonwebtoken');
const { createMockPrisma }  = require('./create-mock-prisma');
const { createTestServer }  = require('./create-test-server');

const SECRET = 'test-secret-for-ci';

/** Returns a signed JWT for the single admin user. */
const makeAuthToken = () =>
  jwt.sign({ id: 1 }, SECRET, { expiresIn: '1h' });

/**
 * Sets up a complete test suite with a fresh server + mock per file.
 * Mocks are reset before each test.
 *
 * @param {object} [bcryptDefaults]  Override default mockBcrypt behaviour.
 */
function setupSuite(bcryptDefaults = {}) {
  let serverBaseURL;
  let stopServer;

  const ctx = {
    mockPrisma: null,
    mockBcrypt: {
      hash:    bcryptDefaults.hash    ?? (async () => 'hashed_password'),
      compare: bcryptDefaults.compare ?? (async () => false),
    },
  };

  const defaultHash    = bcryptDefaults.hash    ?? (async () => 'hashed_password');
  const defaultCompare = bcryptDefaults.compare ?? (async () => false);

  const test = base.extend({
    request: async ({ playwright }, use) => {
      const reqCtx = await playwright.request.newContext({ baseURL: serverBaseURL });
      await use(reqCtx);
      await reqCtx.dispose();
    },
  });

  test.beforeAll(async () => {
    ctx.mockPrisma = createMockPrisma();
    ({ baseURL: serverBaseURL, stop: stopServer } = await createTestServer(
      ctx.mockPrisma,
      ctx.mockBcrypt,
    ));
  });

  test.afterAll(async () => {
    await stopServer();
  });

  test.beforeEach(() => {
    ctx.mockPrisma.reset();
    ctx.mockBcrypt.hash    = defaultHash;
    ctx.mockBcrypt.compare = defaultCompare;
  });

  return { test, ctx, makeAuthToken };
}

module.exports = { setupSuite, makeAuthToken };
