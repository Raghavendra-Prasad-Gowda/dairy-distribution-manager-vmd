'use strict';

/**
 * utils/pagination.js — opt-in server-side pagination helpers.
 * Pure functions, tested directly (no HTTP needed).
 */

const { test, expect } = require('@playwright/test');
const { getPaginationParams, buildPaginationMeta, DEFAULT_LIMIT, MAX_LIMIT } = require('../../utils/pagination');

test.describe('getPaginationParams', () => {
  test('returns null when neither page nor limit is present (opt-out, unpaginated)', () => {
    expect(getPaginationParams({})).toBeNull();
  });

  test('defaults page to 1 and limit to DEFAULT_LIMIT when only the other is supplied', () => {
    expect(getPaginationParams({ page: '2' })).toEqual({ page: 2, limit: DEFAULT_LIMIT, skip: DEFAULT_LIMIT });
    expect(getPaginationParams({ limit: '5' })).toEqual({ page: 1, limit: 5, skip: 0 });
  });

  test('clamps page below 1 up to 1', () => {
    expect(getPaginationParams({ page: '0' }).page).toBe(1);
    expect(getPaginationParams({ page: '-5' }).page).toBe(1);
  });

  test('falls back to page 1 when page is not a number', () => {
    expect(getPaginationParams({ page: 'abc' }).page).toBe(1);
  });

  test('clamps a negative limit up to 1', () => {
    expect(getPaginationParams({ limit: '-5' }).limit).toBe(1);
  });

  test('limit=0 falls back to DEFAULT_LIMIT (0 is falsy, so the || default wins before clamping)', () => {
    expect(getPaginationParams({ limit: '0' }).limit).toBe(DEFAULT_LIMIT);
  });

  test('clamps limit above MAX_LIMIT down to MAX_LIMIT', () => {
    expect(getPaginationParams({ limit: String(MAX_LIMIT + 50) }).limit).toBe(MAX_LIMIT);
  });

  test('falls back to DEFAULT_LIMIT when limit is not a number', () => {
    expect(getPaginationParams({ limit: 'abc' }).limit).toBe(DEFAULT_LIMIT);
  });

  test('computes skip from page and limit', () => {
    expect(getPaginationParams({ page: '3', limit: '10' }).skip).toBe(20);
  });
});

test.describe('buildPaginationMeta', () => {
  test('computes pages and hasMore', () => {
    expect(buildPaginationMeta(45, 1, 20)).toEqual({ total: 45, page: 1, limit: 20, pages: 3, hasMore: true });
  });

  test('hasMore is false on the last page', () => {
    expect(buildPaginationMeta(45, 3, 20).hasMore).toBe(false);
  });

  test('pages is 0 and hasMore false when total is 0', () => {
    expect(buildPaginationMeta(0, 1, 20)).toEqual({ total: 0, page: 1, limit: 20, pages: 0, hasMore: false });
  });
});
