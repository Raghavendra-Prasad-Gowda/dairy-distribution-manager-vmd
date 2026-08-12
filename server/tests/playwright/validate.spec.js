'use strict';

/**
 * utils/validate.js — direct unit coverage
 *
 * `parseId()` and `validate()` gate almost every request in the API (every
 * `:id` route param goes through parseId; every POST/PUT body goes through
 * validate + a Zod schema), yet neither had a dedicated test file — only
 * incidental coverage via specific endpoints' "non-numeric ID → 400" cases.
 * This pins parseId's actual boundary behaviour (some of it — decimal and
 * trailing-garbage truncation — is more lenient than it looks at a glance,
 * since it's built on parseInt) and validate()'s error-shaping contract.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');
const { parseId, validate, schemas } = require('../../utils/validate');
const { getIndiaDateStr, getIndiaTomorrowStr } = require('../../utils/dateUtils');

const { test } = setupSuite();

test.describe('parseId — valid input', () => {
  test('parses a plain positive integer string', () => {
    expect(parseId('5')).toBe(5);
  });

  test('tolerates surrounding whitespace', () => {
    expect(parseId('  5  ')).toBe(5);
  });

  test('uses the custom name in the error, not the value, when invalid', () => {
    expect(() => parseId('abc', 'Brand ID')).toThrow('Invalid Brand ID');
  });
});

test.describe('parseId — rejected input', () => {
  for (const bad of ['0', '-1', 'abc', 'Infinity', 'NaN', '', null, undefined]) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      expect(() => parseId(bad)).toThrow('Invalid ID');
    });
  }
});

test.describe('parseId — parseInt-inherited leniency (documented, not a bug fix)', () => {
  // parseId is built on parseInt(value, 10), which stops at the first
  // non-digit character rather than rejecting the whole string. These pin
  // the actual current behaviour so a refactor can't silently change it
  // without a failing test flagging the change either way.
  test('"1.5" truncates to 1 rather than being rejected', () => {
    expect(parseId('1.5')).toBe(1);
  });

  test('"5abc" truncates to 5 rather than being rejected — trailing garbage is silently dropped', () => {
    expect(parseId('5abc')).toBe(5);
  });

  test('"1e3" parses as 1, not 1000 — scientific notation is not understood', () => {
    expect(parseId('1e3')).toBe(1);
  });
});

test.describe('validate() — success path', () => {
  test('returns the parsed data unchanged when the body is valid', () => {
    const req = { body: { username: 'raghav', password: 'secret1' } };
    const res = { status: () => res, json: () => {} };
    const result = validate(schemas.login, req, res);
    expect(result).toEqual({ username: 'raghav', password: 'secret1' });
  });

  test('applies schema defaults to the returned data', () => {
    const req = { body: { brandId: 1, name: 'Toned Milk' } };
    const res = { status: () => res, json: () => {} };
    const result = validate(schemas.createProduct, req, res);
    expect(result.unitType).toBe('piece'); // default
    expect(result.costPrice).toBe(0);      // default
  });
});

test.describe('validate() — failure path', () => {
  function fakeRes() {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    return res;
  }

  test('returns null and sends a 400 with code VALIDATION_ERROR', () => {
    const req = { body: {} }; // missing both username and password
    const res = fakeRes();
    const result = validate(schemas.login, req, res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('a completely absent field fails Zod\'s base type check before the custom .min() message runs', () => {
    const req = { body: {} }; // fields entirely absent, not empty strings
    const res = fakeRes();
    validate(schemas.login, req, res);
    expect(res.body.error).toBe('Required; Required'); // NOT the custom "Username/Password is required" text
  });

  test('joins every field error into one "; "-separated message, not just the first', () => {
    // Present-but-empty strings DO reach the custom .min(1, message) — unlike
    // the absent-field case above, which fails Zod's base type check first.
    const req = { body: { username: '', password: '' } };
    const res = fakeRes();
    validate(schemas.login, req, res);
    expect(res.body.error).toContain('Username is required');
    expect(res.body.error).toContain('Password is required');
    expect(res.body.error).toContain('; ');
  });
});

test.describe('todayOrLaterDateString — used by product/price effective-from fields', () => {
  test('rejects an invalid date format with a format-specific message, not the past-date one', () => {
    const req = { body: { effectiveFrom: 'not-a-date', prices: [] } };
    const res = { statusCode: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    validate(schemas.bulkSalespersonPrices, req, res);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
    expect(res.body.error).not.toMatch(/today or later/);
  });
});

test.describe('notBeyondTomorrowDateString — used by stock receipts / dispatches', () => {
  const makeRes = () => ({ statusCode: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

  test('accepts today', () => {
    const req = { body: { brandId: 1, date: getIndiaDateStr(), items: [] } };
    expect(validate(schemas.bulkStockReceipt, req, makeRes())).not.toBeNull();
  });

  test('accepts tomorrow — one day ahead is allowed', () => {
    const req = { body: { brandId: 1, date: getIndiaTomorrowStr(), items: [] } };
    expect(validate(schemas.bulkStockReceipt, req, makeRes())).not.toBeNull();
  });

  test('rejects a date more than one day in the future, with a range-specific message', () => {
    const req = { body: { brandId: 1, date: '2099-01-01', items: [] } };
    const res = makeRes();
    expect(validate(schemas.bulkStockReceipt, req, res)).toBeNull();
    expect(res.body.error).toMatch(/more than one day in the future/);
  });

  test('rejects an invalid date format, including the format-specific message', () => {
    // Zod runs both string checks (regex + refine) and joins every failure,
    // so a non-date string like this also fails the range check by pure
    // lexical comparison ('n' > '2') — the format message is still present
    // either way, which is what actually matters to the caller.
    const req = { body: { brandId: 1, date: 'not-a-date', items: [] } };
    const res = makeRes();
    expect(validate(schemas.bulkStockReceipt, req, res)).toBeNull();
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  test('applies the same today+1 ceiling to salesman dispatches', () => {
    const req = { body: { dispatchDate: '2099-01-01', items: [] } };
    const res = makeRes();
    expect(validate(schemas.createDispatch, req, res)).toBeNull();
    expect(res.body.error).toMatch(/more than one day in the future/);
  });
});
