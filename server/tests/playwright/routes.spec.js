'use strict';

/**
 * Routes API Tests
 * Covers: GET, POST, PUT /:id, DELETE /:id /api/v1/routes
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken, makeSuperAdminToken, makeDispatcherToken } = setupSuite();

const ROUTE = { id: 1, brandId: 1, routeNumber: '220', displayOrder: 0, isActive: true };

// ─── GET /api/v1/routes ───────────────────────────────────────────────────────

test.describe('GET /api/v1/routes', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/routes');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with route list', async ({ request }) => {
    ctx.mockPrisma.route.findMany.mockResolvedValue([ROUTE]);

    const res = await request.get('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('returns 200 filtered by brandId', async ({ request }) => {
    ctx.mockPrisma.route.findMany.mockResolvedValue([ROUTE]);

    const res = await request.get('/api/v1/routes?brandId=1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 with empty list when no routes', async ({ request }) => {
    ctx.mockPrisma.route.findMany.mockResolvedValue([]);

    const res = await request.get('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ─── POST /api/v1/routes ──────────────────────────────────────────────────────

test.describe('POST /api/v1/routes', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/routes', {
      data: { brandId: 1, routeNumber: '220' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when route is created', async ({ request }) => {
    ctx.mockPrisma.route.create.mockResolvedValue(ROUTE);

    const res = await request.post('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1, routeNumber: '220' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('routeNumber', '220');
  });

  test('returns 400 when brandId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '220' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when routeNumber is missing', async ({ request }) => {
    const res = await request.post('/api/v1/routes', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { brandId: 1 },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/routes/:id ───────────────────────────────────────────────────

test.describe('PUT /api/v1/routes/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/routes/1', { data: { routeNumber: '999' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when route is updated', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockResolvedValue({ ...ROUTE, routeNumber: '999' });

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('routeNumber', '999');
  });

  test('returns 404 when route does not exist', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(null);

    const res = await request.put('/api/v1/routes/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric route ID', async ({ request }) => {
    const res = await request.put('/api/v1/routes/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when routeNumber is an empty string', async ({ request }) => {
    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/routes/:id — extended coverage ───────────────────────────────

test.describe('PUT /api/v1/routes/:id — auth & roles', () => {
  test('returns 401 when token is malformed', async ({ request }) => {
    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: 'Bearer bad.token.here' },
      data: { routeNumber: '999' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 when token is expired', async ({ request }) => {
    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: { routeNumber: '999' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 for a salesman token and never touches the DB', async ({ request }) => {
    let touched = false;
    ctx.mockPrisma.route.findUnique.mockImplementation(async () => { touched = true; return ROUTE; });
    ctx.mockPrisma.route.update.mockImplementation(async () => { touched = true; return ROUTE; });

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { routeNumber: '999' },
    });

    expect(res.status()).toBe(403);
    expect(touched).toBe(false);
  });

  test('returns 403 for a dispatcher token', async ({ request }) => {
    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
      data: { routeNumber: '999' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 for a superadmin token', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockResolvedValue({ ...ROUTE, routeNumber: '999' });

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { routeNumber: '999' },
    });
    expect(res.status()).toBe(200);
  });
});

test.describe('PUT /api/v1/routes/:id — ID validation', () => {
  for (const badId of ['0', '-1']) {
    test(`returns 400 for route ID "${badId}"`, async ({ request }) => {
      const res = await request.put(`/api/v1/routes/${badId}`, {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data: { routeNumber: '999' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  }
});

test.describe('PUT /api/v1/routes/:id — body validation', () => {
  const invalidBodies = [
    ['routeNumber is a number',          { routeNumber: 220 }],
    ['displayOrder is negative',         { displayOrder: -1 }],
    ['displayOrder is a fraction',       { displayOrder: 1.5 }],
    ['displayOrder is a string',         { displayOrder: '2' }],
    ['isActive is a string',             { isActive: 'false' }],
  ];

  for (const [label, data] of invalidBodies) {
    test(`returns 400 when ${label} and skips the DB`, async ({ request }) => {
      let touched = false;
      ctx.mockPrisma.route.findUnique.mockImplementation(async () => { touched = true; return ROUTE; });

      const res = await request.put('/api/v1/routes/1', {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data,
      });

      expect(res.status()).toBe(400);
      expect((await res.json()).success).toBe(false);
      expect(touched).toBe(false);
    });
  }
});

test.describe('PUT /api/v1/routes/:id — update behaviour', () => {
  /** Captures the args passed to route.update and echoes the merged row back. */
  function captureUpdate() {
    const captured = {};
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockImplementation(async (args) => {
      Object.assign(captured, args);
      return { ...ROUTE, ...args.data };
    });
    return captured;
  }

  test('updates only displayOrder', async ({ request }) => {
    const captured = captureUpdate();

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { displayOrder: 5 },
    });

    expect(res.status()).toBe(200);
    expect(captured.where).toEqual({ id: 1 });
    expect(captured.data).toEqual({ displayOrder: 5 });
    const body = await res.json();
    expect(body.data.displayOrder).toBe(5);
    expect(body.data.routeNumber).toBe('220');
  });

  test('deactivates a route with isActive=false', async ({ request }) => {
    const captured = captureUpdate();

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { isActive: false },
    });

    expect(res.status()).toBe(200);
    expect(captured.data).toEqual({ isActive: false });
    expect((await res.json()).data.isActive).toBe(false);
  });

  test('accepts displayOrder=0', async ({ request }) => {
    const captured = captureUpdate();

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { displayOrder: 0 },
    });

    expect(res.status()).toBe(200);
    expect(captured.data).toEqual({ displayOrder: 0 });
  });

  test('updates all editable fields at once', async ({ request }) => {
    const captured = captureUpdate();

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '221', displayOrder: 3, isActive: true },
    });

    expect(res.status()).toBe(200);
    expect(captured.data).toEqual({ routeNumber: '221', displayOrder: 3, isActive: true });
  });

  test('empty body is a no-op update that still returns 200', async ({ request }) => {
    const captured = captureUpdate();

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });

    expect(res.status()).toBe(200);
    expect(captured.data).toEqual({});
    expect((await res.json()).data).toMatchObject(ROUTE);
  });

  test('strips non-editable fields (brandId, id) so a route cannot move brands', async ({ request }) => {
    const captured = captureUpdate();

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999', brandId: 2, id: 42 },
    });

    expect(res.status()).toBe(200);
    expect(captured.data).toEqual({ routeNumber: '999' });
    expect(captured.data).not.toHaveProperty('brandId');
    expect(captured.data).not.toHaveProperty('id');
  });

  test('looks up the route by the ID from the URL', async ({ request }) => {
    let lookedUp;
    ctx.mockPrisma.route.findUnique.mockImplementation(async (args) => { lookedUp = args; return { ...ROUTE, id: 7 }; });
    ctx.mockPrisma.route.update.mockImplementation(async (args) => ({ ...ROUTE, id: 7, ...args.data }));

    const res = await request.put('/api/v1/routes/7', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '777' },
    });

    expect(res.status()).toBe(200);
    expect(lookedUp).toEqual({ where: { id: 7 } });
  });

  test('does not call update when the route is missing', async ({ request }) => {
    let updated = false;
    ctx.mockPrisma.route.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.route.update.mockImplementation(async () => { updated = true; return ROUTE; });

    const res = await request.put('/api/v1/routes/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '999' },
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Route not found');
    expect(updated).toBe(false);
  });
});

test.describe('PUT /api/v1/routes/:id — database errors', () => {
  test('returns 400 DUPLICATE when routeNumber clashes within the brand (P2002)', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on the fields: (`brandId`,`routeNumber`)'), { code: 'P2002' })
    );

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '221' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE');
    expect(body.error).not.toMatch(/routeNumber/);
  });

  test('returns 404 NOT_FOUND when the route is deleted mid-update (P2025)', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockRejectedValue(
      Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
    );

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '221' },
    });

    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe('NOT_FOUND');
  });

  test('returns 500 without leaking internals on an unexpected DB error', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.update.mockRejectedValue(new Error('connection terminated: secret-host:5432'));

    const res = await request.put('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { routeNumber: '221' },
    });

    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/secret-host/);
  });
});

// ─── DELETE /api/v1/routes/:id ────────────────────────────────────────────────

test.describe('DELETE /api/v1/routes/:id', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.delete('/api/v1/routes/1');
    expect(res.status()).toBe(403);
  });

  test('returns 200 when route is deleted', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(ROUTE);
    ctx.mockPrisma.route.delete.mockResolvedValue(ROUTE);

    const res = await request.delete('/api/v1/routes/1', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe('Route deleted');
  });

  test('returns 404 when route does not exist', async ({ request }) => {
    ctx.mockPrisma.route.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/routes/999', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 for non-numeric route ID', async ({ request }) => {
    const res = await request.delete('/api/v1/routes/abc', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(400);
  });
});
