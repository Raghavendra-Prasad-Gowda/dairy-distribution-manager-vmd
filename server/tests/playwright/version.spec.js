'use strict';

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { versionLabel } = require('../../utils/version');
const { buildCard, SLACK_EVENTS } = require('../../utils/slack');

const { test } = setupSuite();

test.describe('versionLabel', () => {
  test('joins tag and commit', () => {
    expect(versionLabel({ version: '1.4.0', commit: 'a3f9c21' })).toBe('v1.4.0 · a3f9c21');
  });
  test('falls back to the commit alone when untagged', () => {
    expect(versionLabel({ version: null, commit: 'a3f9c21' })).toBe('a3f9c21');
  });
  test('reports unknown when nothing could be detected', () => {
    expect(versionLabel({ version: null, commit: null })).toBe('unknown');
  });
});

test.describe('Slack cards carry the build', () => {
  test('server-online card shows the build', () => {
    const json = JSON.stringify(buildCard(SLACK_EVENTS.SERVER_STARTED, { env: 'production', build: 'v1.4.0 · a3f9c21' }));
    expect(json).toContain('v1.4.0 · a3f9c21');
  });
  test('client-crash card shows the (escaped) frontend build', () => {
    const json = JSON.stringify(buildCard(SLACK_EVENTS.CLIENT_ERROR, { message: 'x', page: '/', version: 'v1.4.0 · a3f9c21' }));
    expect(json).toContain('v1.4.0 · a3f9c21');
  });
});

test.describe('POST /errors/client', () => {
  test('accepts a version field and rejects an oversized one', async ({ request }) => {
    const ok = await request.post('/api/v1/errors/client', { data: { message: 'boom', version: 'v1.4.0 · a3f9c21' } });
    expect(ok.status()).toBe(200);
    const bad = await request.post('/api/v1/errors/client', { data: { message: 'boom', version: 'x'.repeat(61) } });
    expect(bad.status()).toBe(400);
  });
});

test.describe('detectVersion', () => {
  test('falls back to the package.json version when there is no tag', () => {
    const { detectVersion } = require('../../utils/version');
    const prev = process.env.APP_VERSION;
    delete process.env.APP_VERSION;
    const v = detectVersion();
    if (prev !== undefined) process.env.APP_VERSION = prev;
    expect(v.version).toBeTruthy();
    expect(typeof v.builtAt).toBe('string');
  });
});
