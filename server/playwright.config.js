'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir:  './tests/playwright',
  timeout:  15000,
  reporter: 'list',
});
