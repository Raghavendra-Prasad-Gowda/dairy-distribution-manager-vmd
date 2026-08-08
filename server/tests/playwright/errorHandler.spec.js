'use strict';

/**
 * Global Error Handler + Misc Root Endpoint Tests
 *
 * app.js's final error-handling middleware maps known Prisma error codes to
 * clean, safe API responses and never leaks raw Prisma internals or stack
 * traces outside development. This is exercised implicitly all over the
 * suite via AppError (isOperational) paths, but the Prisma-code branches
 * (P2002 / P2003) and the generic "unexpected error" branch had no direct
 * coverage anywhere — added here.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSuperAdminToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── Root / health (no auth required) ─────────────────────────────────────────

test.describe('Root and health endpoints', () => {
  test('GET / returns API identity', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ name: 'Dairy Distribution Manager API', status: 'ok' });
  });

  test('GET /health returns ok with uptime', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });
});

// ─── Global error handler — Prisma error code mapping ─────────────────────────

test.describe('Global error handler — Prisma error codes', () => {
  test('P2002 (unique constraint) → 400 with code DUPLICATE, no raw Prisma error leaked', async ({ request }) => {
    // Simulates a race condition: the app-level case-insensitive uniqueness
    // check passes (findFirst → null), but the DB's own unique constraint
    // still catches a concurrent duplicate at the create step.
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on the fields: (`username`)'), { code: 'P2002' })
    );

    const res = await request.post('/api/v1/salespeople', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { name: 'Raju', username: 'raju', password: 'password123' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('DUPLICATE');
    expect(body.error).not.toMatch(/prisma/i);
    expect(body.error).not.toMatch(/username/i); // no raw constraint/column names leaked
  });

  test('P2003 (foreign key constraint) → 400 with code FK_CONSTRAINT', async ({ request }) => {
    ctx.mockPrisma.category.findUnique.mockResolvedValue({ id: 1, brandId: 1, name: 'Milk' });
    ctx.mockPrisma.category.delete.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed on the field: `category_id`'), { code: 'P2003' })
    );

    const res = await request.delete('/api/v1/categories/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('FK_CONSTRAINT');
    expect(body.error).not.toMatch(/prisma/i);
  });

  test('P2025 (record not found) → 404 with code NOT_FOUND', async ({ request }) => {
    ctx.mockPrisma.brand.update.mockRejectedValue(
      Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
    );

    const res = await request.put('/api/v1/brands/999', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` }, // renaming requires superadmin
      data: { name: 'Updated' },
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
  });

  test('unexpected non-operational error → 500 with generic message, no stack leaked (non-dev env)', async ({ request }) => {
    ctx.mockPrisma.brand.findMany.mockRejectedValue(new Error('Connection terminated unexpectedly'));

    const res = await request.get('/api/v1/brands', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/unexpected error/i);
    expect(body.error).not.toMatch(/Connection terminated/); // raw message not leaked
    expect(body).not.toHaveProperty('stack'); // NODE_ENV=test in the harness, not 'development'
  });
});
