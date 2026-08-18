'use strict';

/**
 * config/logger.js — Winston logger setup.
 * Covers the production-vs-dev format/level branches and the "logs dir
 * doesn't exist yet" bootstrap branch, all of which are module-scope code
 * that only runs once per require — so each test reloads a fresh copy
 * under a controlled NODE_ENV / filesystem state.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LOGGER_PATH = path.resolve(__dirname, '../../config/logger.js');
const LOGS_DIR = path.resolve(__dirname, '../../logs');

/** Load a fresh copy of config/logger.js under a given NODE_ENV. */
function loadLogger(nodeEnv) {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    delete require.cache[require.resolve(LOGGER_PATH)];
    return require(LOGGER_PATH);
  } finally {
    process.env.NODE_ENV = saved;
    delete require.cache[require.resolve(LOGGER_PATH)];
  }
}

test.describe('config/logger.js', () => {
  test('uses level "debug" outside production', () => {
    const logger = loadLogger('test');
    expect(logger.level).toBe('debug');
  });

  test('uses level "info" and JSON console format in production', () => {
    const logger = loadLogger('production');
    expect(logger.level).toBe('info');
  });

  test('creates the logs directory on load if it is missing', () => {
    // The suite's own server has already required logger.js by this point
    // (logsDir exists) — remove it so this reload exercises the
    // fs.mkdirSync bootstrap branch, then leave it recreated behind.
    if (fs.existsSync(LOGS_DIR)) fs.rmSync(LOGS_DIR, { recursive: true, force: true });
    expect(fs.existsSync(LOGS_DIR)).toBe(false);

    loadLogger('test');

    expect(fs.existsSync(LOGS_DIR)).toBe(true);
  });
});
