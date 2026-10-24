'use strict';

/**
 * Health probes — liveness (/health) and readiness (/health/ready).
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx } = setupSuite();

test.describe('health probes', () => {
  test('GET /health is a fast liveness probe (no DB, always 200)', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('GET /health reports the build identity (version, commit, builtAt) and nothing secret', async ({ request }) => {
    const res = await request.get('/health');
    const body = await res.json();
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('commit');
    expect(typeof body.builtAt).toBe('string');
    expect(Object.keys(body).sort()).toEqual(['builtAt', 'commit', 'status', 'uptime', 'version']);
  });

  test('GET /health/ready returns 200 when the database is reachable', async ({ request }) => {
    ctx.mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await request.get('/health/ready');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
  });

  test('GET /health/ready returns 503 when the database is unreachable', async ({ request }) => {
    ctx.mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request.get('/health/ready');
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('unavailable');
  });
});
