'use strict';

/**
 * prisma/seed.js — superadmin sync.
 * Unit-level (a fake Prisma): the real database cannot be put into "two superadmins and an env username that
 * matches one of them" without breaking a live environment, so these branches are proven here and listed in
 * server/automation/COVERAGE.md.
 */

const { test, expect } = require('@playwright/test');
const { syncSuperAdmin } = require('../../prisma/seed');

/** A tiny in-memory AdminUser table that enforces the unique username like the real one. */
function fakePrisma(rows) {
  const table = rows.map((r) => ({ ...r }));
  const calls = { update: [], create: [], findFirst: [] };
  return {
    table,
    calls,
    adminUser: {
      findUnique: async ({ where }) => table.find((r) => r.username === where.username) ?? null,
      findFirst: async (args) => {
        calls.findFirst.push(args);
        const matches = table.filter((r) => r.role === args.where.role);
        matches.sort((a, b) => a.id - b.id);
        return matches[0] ?? null;
      },
      update: async ({ where, data }) => {
        calls.update.push({ where, data });
        if (data.username && table.some((r) => r.username === data.username && r.id !== where.id)) {
          throw new Error('Unique constraint failed on the constraint: `admin_users_username_key`');
        }
        Object.assign(table.find((r) => r.id === where.id), data);
      },
      create: async ({ data }) => {
        calls.create.push(data);
        if (table.some((r) => r.username === data.username)) throw new Error('Unique constraint failed');
        table.push({ id: Math.max(0, ...table.map((r) => r.id)) + 1, ...data });
      },
    },
  };
}

test.describe('syncSuperAdmin', () => {
  test('creates the superadmin when there is none', async () => {
    const db = fakePrisma([{ id: 1, username: 'nagaraju', role: 'admin' }]);
    await syncSuperAdmin(db, 'owner', 'Secret-123');
    expect(db.calls.create).toHaveLength(1);
    expect(db.calls.create[0]).toMatchObject({ username: 'owner', role: 'superadmin' });
    // Never the plaintext. (bcrypt may be stubbed by other specs in this worker, so the hash itself is not compared.)
    expect(typeof db.calls.create[0].passwordHash).toBe('string');
    expect(db.calls.create[0].passwordHash).not.toBe('Secret-123');
  });

  test('syncs only the password when the env username is already the superadmin', async () => {
    const db = fakePrisma([{ id: 2, username: 'owner', role: 'superadmin' }]);
    await syncSuperAdmin(db, 'owner', 'New-Pass-1');
    expect(db.calls.update).toHaveLength(1);
    expect(db.calls.update[0].where).toEqual({ id: 2 });
    expect(Object.keys(db.calls.update[0].data)).toEqual(['passwordHash']); // username untouched
    expect(typeof db.table[0].passwordHash).toBe('string');
    expect(db.table[0].passwordHash).not.toBe('New-Pass-1');
  });

  test('two superadmins: whichever one the env names is synced and the other is left alone (the production crash)', async () => {
    // Before the fix the seed renamed the first superadmin the database returned to the env username, which
    // collided with the other superadmin whenever the env named the one that was NOT returned first.
    for (const [envName, targetId, otherId] of [['owner', 2, 7], ['test_super', 7, 2]]) {
      const db = fakePrisma([
        { id: 2, username: 'owner', role: 'superadmin' },
        { id: 7, username: 'test_super', role: 'superadmin' },
      ]);
      await syncSuperAdmin(db, envName, 'Secret-123');
      expect(db.table.find((r) => r.id === targetId).username).toBe(envName);
      expect(db.table.find((r) => r.id === otherId).username).not.toBe(envName);
      expect(db.calls.update).toHaveLength(1);
      expect(db.calls.update[0].where).toEqual({ id: targetId });
      expect(Object.keys(db.calls.update[0].data)).toEqual(['passwordHash']);
    }
  });

  test('renames the lowest-id superadmin when no account has the env username, deterministically', async () => {
    const db = fakePrisma([
      { id: 7, username: 'second', role: 'superadmin' },
      { id: 2, username: 'first', role: 'superadmin' },
    ]);
    await syncSuperAdmin(db, 'renamed', 'Secret-123');
    expect(db.calls.findFirst[0].orderBy).toEqual({ id: 'asc' });
    expect(db.table.find((r) => r.id === 2).username).toBe('renamed');
    expect(db.table.find((r) => r.id === 7).username).toBe('second');
  });

  test('refuses to take over a username held by an admin, with a message that says what to change', async () => {
    const db = fakePrisma([
      { id: 2, username: 'owner', role: 'superadmin' },
      { id: 6, username: 'automation', role: 'admin' },
    ]);
    await expect(syncSuperAdmin(db, 'automation', 'Secret-123')).rejects.toThrow(
      /SUPERADMIN_USERNAME "automation" already belongs to a admin account/,
    );
    expect(db.calls.update).toHaveLength(0); // nothing was changed, in particular no promotion
    expect(db.table.find((r) => r.id === 6).role).toBe('admin');
  });

  test('refuses a username held by a dispatcher too', async () => {
    const db = fakePrisma([{ id: 3, username: 'dispatcher', role: 'dispatcher' }]);
    await expect(syncSuperAdmin(db, 'dispatcher', 'Secret-123')).rejects.toThrow(/belongs to a dispatcher account/);
    expect(db.calls.create).toHaveLength(0);
  });
});
