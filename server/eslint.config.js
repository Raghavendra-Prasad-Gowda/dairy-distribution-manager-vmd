'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

/**
 * Server ESLint (flat config, ESLint 9). CommonJS + Node globals.
 * Enforces the server contract's hard rules as lint errors so regressions are
 * caught in CI, not by review discipline alone (e.g. "never console.log").
 */
module.exports = [
  { ignores: ['node_modules/**', 'prisma/migrations/**', 'test-results/**', 'coverage/**', 'automation/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // Contract: use the Winston logger, never console.* in server source.
      'no-console': 'error',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Tests and standalone scripts legitimately use console and test globals.
    // Test scaffolding (captured-but-unasserted mocks, retained token helpers)
    // is noisy under no-unused-vars without indicating a production defect, so
    // that rule is relaxed here while staying strict on production source.
    files: ['tests/**/*.js', 'scripts/**/*.js', 'prisma/seed.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', 'no-unused-vars': 'off' },
  },
  {
    // config/env.js writes to stderr before the logger exists (circular-dep safe).
    files: ['config/env.js'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
