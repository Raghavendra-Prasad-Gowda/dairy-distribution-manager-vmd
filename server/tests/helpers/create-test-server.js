'use strict';

const http = require('http');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../../');

/**
 * Clears all app modules from require.cache (excludes node_modules and test files).
 * This ensures a fresh app load with the injected mocks.
 */
function clearAppCache() {
  const toDelete = Object.keys(require.cache).filter(
    (key) =>
      key.startsWith(SERVER_ROOT) &&
      !key.includes('/node_modules/') &&
      !key.includes('/tests/')
  );
  toDelete.forEach((key) => delete require.cache[key]);
}

/**
 * Injects an export into require.cache under the given module path.
 * Must be called before requiring any module that depends on it.
 */
function injectIntoCache(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id:       resolved,
    filename: resolved,
    loaded:   true,
    exports,
    parent:   null,
    children: [],
  };
}

/**
 * Starts the Express app with injected mock Prisma and bcrypt.
 * Returns the base URL and a stop() function.
 *
 * @param {object} mockPrisma  Mock prisma client from createMockPrisma()
 * @param {object} mockBcrypt  Mock bcrypt object { hash, compare }
 * @returns {{ baseURL: string, stop: () => Promise<void> }}
 */
async function createTestServer(mockPrisma, mockBcrypt) {
  clearAppCache();

  injectIntoCache('../../lib/prisma', mockPrisma);
  injectIntoCache('bcrypt', mockBcrypt);

  const app = require('../../app');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();
  const baseURL = `http://127.0.0.1:${port}`;

  const stop = () =>
    new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );

  return { baseURL, stop };
}

module.exports = { createTestServer };
