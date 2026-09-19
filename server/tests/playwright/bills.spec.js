'use strict';

/**
 * Bills API Tests
 * Covers: GET /preview, GET, GET /:id, POST, DELETE /:id on /api/v1/bills
 *
 * The bill is the printed cash/credit pad the dairy hands to a salesperson, so
 * the cases that matter most are the six fixed rows, the frozen snapshot, and
 * bill-number allocation continuing the series.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const SALESPERSON = { id: 1, name: 'Ramesh', route: '220', isActive: true };

/** A dispatch whose lines reproduce the numbers on the client's paper bill. */
const DISPATCHES = [
  {
    id: 10,
    salespersonId: 1,
    dispatchDate: new Date('2026-08-05'),
    items: [
      { quantity: 6650, totalAmount: 172900, product: { category: 'Milk', unitType: 'ml', unitSize: 500 } },
      { quantity: 4702, totalAmount: 126954, product: { category: 'Curd', unitType: 'ml', unitSize: 500 } },
    ],
  },
];

const BILL_LINES = [
  { label: 'MILK',           unit: 'ltr',  quantity: 3325, rate: 52, amount: 172900 },
  { label: 'CURD',           unit: 'ltr',  quantity: 2351, rate: 54, amount: 126954 },
  { label: 'GHEE',           unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'PANNEER / KOVA', unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'BUTTER',         unit: null, quantity: null, rate: null, amount: 0 },
  { label: 'OTHERS',         unit: null, quantity: null, rate: null, amount: 0 },
];

const BILL = {
  id: 7,
  billNumber: 799,
  poNumber: '798',
  partyName: 'A.T & S',
  salespersonId: 1,
  fromDate: new Date('2026-08-01'),
  toDate: new Date('2026-08-31'),
  totalAmount: 299854,
  lines: BILL_LINES,
  createdBy: 'admin',
  createdAt: new Date('2026-09-01T06:00:00Z'),
  salesperson: { name: 'Ramesh' },
};

const auth = () => ({ Authorization: `Bearer ${makeAuthToken()}` });

/**
 * Records the arguments a mock is called with and returns `returnValue`.
 * The shared mockFn() helper deliberately keeps no call history, so a test
 * that needs to assert on what the handler passed Prisma captures it here.
 */
function capture(mock, returnValue) {
  const calls = [];
  mock.mockImplementation(async (...args) => { calls.push(args); return returnValue; });
  return calls;
}

// ─── GET /api/v1/bills/preview ────────────────────────────────────────────────

test.describe('GET /api/v1/bills/preview', () => {
  test.beforeEach(() => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue(DISPATCHES);
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31');
    expect(res.status()).toBe(403);
  });

  test('returns 401 for an expired token', async ({ request }) => {
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 for a salesman token', async ({ request }) => {
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 for a malformed date', async ({ request }) => {
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=01-08-2026&to=2026-08-31', {
      headers: auth(),
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when from is after to', async ({ request }) => {
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-31&to=2026-08-01', {
      headers: auth(),
    });
    expect(res.status()).toBe(400);
  });

  test('returns 404 for an unknown salesperson', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);
    const res = await request.get('/api/v1/bills/preview?salespersonId=99&from=2026-08-01&to=2026-08-31', {
      headers: auth(),
    });
    expect(res.status()).toBe(404);
  });

  test('returns the six fixed rows with derived per-litre rates', async ({ request }) => {
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31', {
      headers: auth(),
    });

    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.lines).toHaveLength(6);
    expect(data.lines.map((l) => l.label)).toEqual([
      'MILK', 'CURD', 'GHEE', 'PANNEER / KOVA', 'BUTTER', 'OTHERS',
    ]);
    expect(data.lines[0]).toMatchObject({ unit: 'ltr', quantity: 3325, rate: 52, amount: 172900 });
    expect(data.lines[1]).toMatchObject({ unit: 'ltr', quantity: 2351, rate: 54, amount: 126954 });
    expect(data.totalAmount).toBe(299854);
    expect(data.salespersonName).toBe('Ramesh');
  });

  test('still returns all six rows when nothing was dispatched', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31', {
      headers: auth(),
    });

    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.lines).toHaveLength(6);
    expect(data.totalAmount).toBe(0);
  });

  test('reports amount only when one row mixes litre- and kg-priced products', async ({ request }) => {
    // A single category holding both a litre product and a kg product: summing
    // them into one quantity would make the printed rate meaningless, so the
    // row carries the amount alone.
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([{
      id: 12,
      items: [
        { quantity: 100, totalAmount: 2600, product: { category: 'Others', unitType: 'ml',   unitSize: 500 } },
        { quantity: 20,  totalAmount: 6400, product: { category: 'Others', unitType: 'gram', unitSize: 500 } },
      ],
    }]);

    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31', {
      headers: auth(),
    });

    const { data } = await res.json();
    const others = data.lines.find((l) => l.label === 'OTHERS');
    expect(others).toMatchObject({ unit: null, quantity: null, rate: null, amount: 9000 });
    expect(data.totalAmount).toBe(9000);
  });

  test('bills an unrecognised category under OTHERS', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([{
      id: 11,
      items: [{ quantity: 10, totalAmount: 500, product: { category: 'Lassi', unitType: 'piece', unitSize: null } }],
    }]);

    const res = await request.get('/api/v1/bills/preview?salespersonId=1&from=2026-08-01&to=2026-08-31', {
      headers: auth(),
    });

    const { data } = await res.json();
    const others = data.lines.find((l) => l.label === 'OTHERS');
    expect(others).toMatchObject({ unit: 'pcs', quantity: 10, rate: 50, amount: 500 });
  });
});

// ─── POST /api/v1/bills ───────────────────────────────────────────────────────

test.describe('POST /api/v1/bills', () => {
  let createCalls;

  test.beforeEach(() => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue(DISPATCHES);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    ctx.mockPrisma.bill.findFirst.mockResolvedValue({ billNumber: 798 });
    createCalls = capture(ctx.mockPrisma.bill.create, BILL);
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/bills', {
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a salesman token', async ({ request }) => {
    const res = await request.post('/api/v1/bills', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when salespersonId is missing', async ({ request }) => {
    const res = await request.post('/api/v1/bills', {
      headers: auth(),
      data: { from: '2026-08-01', to: '2026-08-31' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when the period has no dispatches', async ({ request }) => {
    ctx.mockPrisma.stockDispatch.findMany.mockResolvedValue([]);
    const res = await request.post('/api/v1/bills', {
      headers: auth(),
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('nothing to bill');
  });

  test('returns 201 and freezes the computed lines on the bill', async ({ request }) => {
    const res = await request.post('/api/v1/bills', {
      headers: auth(),
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31', partyName: 'A.T & S', poNumber: '798' },
    });

    expect(res.status()).toBe(201);
    const { data } = await res.json();
    expect(data.billNumber).toBe(799);
    expect(data.totalAmount).toBe(299854);

    const created = createCalls[0][0].data;
    expect(created.lines).toHaveLength(6);
    expect(created.lines[0]).toMatchObject({ label: 'MILK', quantity: 3325, rate: 52 });
    expect(created.totalAmount).toBe(299854);
    expect(created.partyName).toBe('A.T & S');
    expect(created.createdBy).toBe('admin');
  });

  test('allocates the next bill number after the highest issued', async ({ request }) => {
    await request.post('/api/v1/bills', {
      headers: auth(),
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });

    expect(createCalls[0][0].data.billNumber).toBe(799);
  });

  test('starts the series from the configured start number when no bills exist', async ({ request }) => {
    ctx.mockPrisma.bill.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue({ key: 'bill_number_start', value: '750' });

    await request.post('/api/v1/bills', {
      headers: auth(),
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });

    expect(createCalls[0][0].data.billNumber).toBe(750);
  });

  test('starts at 1 when there are no bills and no configured start', async ({ request }) => {
    ctx.mockPrisma.bill.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(null);

    await request.post('/api/v1/bills', {
      headers: auth(),
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });

    expect(createCalls[0][0].data.billNumber).toBe(1);
  });

  test('defaults M/s to the salesperson name when not supplied', async ({ request }) => {
    await request.post('/api/v1/bills', {
      headers: auth(),
      data: { salespersonId: 1, from: '2026-08-01', to: '2026-08-31' },
    });

    expect(createCalls[0][0].data.partyName).toBe('Ramesh');
  });
});

// ─── GET /api/v1/bills and /:id ───────────────────────────────────────────────

test.describe('GET /api/v1/bills', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/bills');
    expect(res.status()).toBe(403);
  });

  test('returns the register newest first', async ({ request }) => {
    const findManyCalls = capture(ctx.mockPrisma.bill.findMany, [BILL]);

    const res = await request.get('/api/v1/bills', { headers: auth() });

    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ billNumber: 799, salespersonName: 'Ramesh', fromDate: '2026-08-01', toDate: '2026-08-31' });
    expect(findManyCalls[0][0].orderBy).toEqual({ billNumber: 'desc' });
  });

  test('filters by salespersonId', async ({ request }) => {
    const findManyCalls = capture(ctx.mockPrisma.bill.findMany, []);

    await request.get('/api/v1/bills?salespersonId=3', { headers: auth() });

    expect(findManyCalls[0][0].where).toEqual({ salespersonId: 3 });
  });

  test('returns 400 for a non-numeric id', async ({ request }) => {
    const res = await request.get('/api/v1/bills/abc', { headers: auth() });
    expect(res.status()).toBe(400);
  });

  test('returns 404 for an unknown bill', async ({ request }) => {
    ctx.mockPrisma.bill.findUnique.mockResolvedValue(null);
    const res = await request.get('/api/v1/bills/999', { headers: auth() });
    expect(res.status()).toBe(404);
  });

  test('returns a single bill with its frozen lines', async ({ request }) => {
    ctx.mockPrisma.bill.findUnique.mockResolvedValue(BILL);

    const res = await request.get('/api/v1/bills/7', { headers: auth() });

    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.lines).toHaveLength(6);
    expect(data.partyName).toBe('A.T & S');
  });
});

// ─── DELETE /api/v1/bills/:id ─────────────────────────────────────────────────

test.describe('DELETE /api/v1/bills/:id', () => {
  test('returns 403 for a salesman token', async ({ request }) => {
    const res = await request.delete('/api/v1/bills/7', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 404 for an unknown bill', async ({ request }) => {
    ctx.mockPrisma.bill.findUnique.mockResolvedValue(null);
    const res = await request.delete('/api/v1/bills/999', { headers: auth() });
    expect(res.status()).toBe(404);
  });

  test('deletes an issued bill', async ({ request }) => {
    ctx.mockPrisma.bill.findUnique.mockResolvedValue(BILL);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin' });
    const deleteCalls = capture(ctx.mockPrisma.bill.delete, BILL);

    const res = await request.delete('/api/v1/bills/7', { headers: auth() });

    expect(res.status()).toBe(200);
    expect(deleteCalls[0][0]).toEqual({ where: { id: 7 } });
  });
});
