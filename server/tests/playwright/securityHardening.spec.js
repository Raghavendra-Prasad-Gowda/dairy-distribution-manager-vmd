'use strict';

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { buildCard, SLACK_EVENTS } = require('../../utils/slack');

const { test } = setupSuite();

test.describe('Slack client-error card escaping', () => {
  test('neutralises channel pings, links and code-fence breakouts from untrusted text', () => {
    const card = buildCard(SLACK_EVENTS.CLIENT_ERROR, {
      message: '<!channel> <https://evil.example|click>',
      page: '<@U123>',
      username: '<!here>',
      stack: 'boom ``` <!channel>',
    });
    const json = JSON.stringify(card);
    expect(json).not.toContain('<!channel>');
    expect(json).not.toContain('<!here>');
    expect(json).not.toContain('<@U123>');
    expect(json).not.toContain('<https://evil.example');
    expect(json).toContain('&lt;!channel&gt;');
  });
});
