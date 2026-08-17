'use strict';

/**
 * Salespeople API — username/password cross-field rules on create/update.
 *
 * Split into its own file (its own test server + rate-limit budget) rather
 * than living inside salespeople.spec.js — every /api/v1/salespeople/*
 * request an authenticated admin makes shares the same 30/min
 * `bulkWriteLimiter` budget (it sits in front of the whole mount, not just
 * the bulk routes), and salespeople.spec.js is already close to that
 * ceiling on its own.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SALESPERSON = { id: 1, name: 'Raju', phone: '9999999999', route: 'North', isActive: true };

test.describe('POST /api/v1/salespeople — username/password rules', () => {
  test('returns 400 when username is set without a password', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Raju', username: 'raju1' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/password is required/i);
  });

  test('returns 400 when password is set without a username', async ({ request }) => {
    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Raju', password: 'secret123' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/username is required/i);
  });

  test('returns 201 and hashes the password when both username and password are set', async ({ request }) => {
    let createArgs = null;
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.create.mockImplementation(async (args) => { createArgs = args; return { ...SALESPERSON, ...args.data }; });

    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Raju', username: 'raju1', password: 'secret123' },
    });

    expect(res.status()).toBe(201);
    expect(createArgs.data).toHaveProperty('passwordHash');
    expect(createArgs.data.passwordHash).not.toBe('secret123');
  });
});

test.describe('PUT /api/v1/salespeople/:id — password/username update rules', () => {
  test('returns 200 and rehashes the password when password is included', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.salesperson.update.mockImplementation(async (args) => { updateArgs = args; return { ...SALESPERSON, ...args.data }; });

    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { password: 'newsecret1' },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toHaveProperty('passwordHash');
    expect(updateArgs.data.passwordHash).not.toBe('newsecret1');
  });

  test('clears username and password hash when username is explicitly set to null', async ({ request }) => {
    let updateArgs = null;
    ctx.mockPrisma.salesperson.update.mockImplementation(async (args) => { updateArgs = args; return { ...SALESPERSON, username: null }; });

    const res = await request.put('/api/v1/salespeople/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { username: null },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data.username).toBeNull();
    expect(updateArgs.data.passwordHash).toBeNull();
  });
});
