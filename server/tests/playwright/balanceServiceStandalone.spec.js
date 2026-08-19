'use strict';

/**
 * services/balanceService.js — standalone (no-tx) call path.
 *
 * Every controller in this app threads its own `tx` through
 * recalculateDairyBalance/recalculateSalespersonBalance (CLAUDE.md's stated
 * pattern), so the "no tx passed — open our own transaction" branch never
 * runs via the HTTP surface. It's still valid public API (documented in
 * CLAUDE.md's own example), so it's exercised here directly against a fresh
 * mock Prisma, bypassing the Express app entirely.
 */

const path = require('path');
const { test, expect } = require('@playwright/test');
const { createMockPrisma } = require('../helpers/create-mock-prisma');
const { mockDairyCascade, mockSalespersonCascade } = require('../helpers/mock-cascade');

const PRISMA_PATH = path.resolve(__dirname, '../../lib/prisma.js');
const SERVICE_PATH = path.resolve(__dirname, '../../services/balanceService.js');

/** Loads a fresh balanceService bound to a fresh mock prisma. */
function loadServiceWithMock(mockPrisma) {
  const resolved = require.resolve(PRISMA_PATH);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: mockPrisma, parent: null, children: [] };
  delete require.cache[require.resolve(SERVICE_PATH)];
  return require(SERVICE_PATH);
}

test.describe('recalculateDairyBalance — called without a tx', () => {
  test('opens its own serializable transaction and completes', async () => {
    const mockPrisma = createMockPrisma();
    mockDairyCascade(mockPrisma);
    let capturedOpts = null;
    const originalTx = mockPrisma.$transaction;
    mockPrisma.$transaction = async (fn, opts) => { capturedOpts = opts; return originalTx(fn, opts); };
    const { recalculateDairyBalance } = loadServiceWithMock(mockPrisma);

    await expect(recalculateDairyBalance(1, '2026-04-30')).resolves.toBeUndefined();
    expect(capturedOpts).toEqual({ isolationLevel: 'Serializable' });
  });
});

test.describe('recalculateSalespersonBalance — called without a tx', () => {
  test('opens its own serializable transaction and completes', async () => {
    const mockPrisma = createMockPrisma();
    mockSalespersonCascade(mockPrisma);
    let capturedOpts = null;
    const originalTx = mockPrisma.$transaction;
    mockPrisma.$transaction = async (fn, opts) => { capturedOpts = opts; return originalTx(fn, opts); };
    const { recalculateSalespersonBalance } = loadServiceWithMock(mockPrisma);

    await expect(recalculateSalespersonBalance(1, '2026-04-30')).resolves.toBeUndefined();
    expect(capturedOpts).toEqual({ isolationLevel: 'Serializable' });
  });
});
