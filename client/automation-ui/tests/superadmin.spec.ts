import { expect, test } from '../src/fixtures';
import { env } from '../src/env';
import { AdminUsersPage } from '../src/pages/AdminUsersPage';
import { LoginPage } from '../src/pages/LoginPage';
import { newIpad, newSuperadminIpad } from '../src/pages/SalesmanPages';

/**
 * Superadmin-only duties: creating and retiring office logins and brands. These need a superadmin account
 * (E2E_SUPERADMIN_*), which signs in on its own browser so the shared admin session is left alone.
 */
test.describe('Superadmin', () => {
  test('creates a dispatcher who can sign in, then disables and deletes that login', async ({ browser, superSeed }) => {
    const ipad = await newSuperadminIpad(browser);

    const users = new AdminUsersPage(ipad);
    await users.open();
    const username = `e2e-${Date.now().toString(36)}`;
    const password = `Pass-${Date.now().toString(36)}-1A`;
    const created = await users.add(username, password, 'Dispatcher');
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.id as number;
    try {
      await users.acknowledgeNotice(/created successfully/i);
      await users.search.fill(username);
      await expect(users.row(username)).toContainText('Dispatcher');
      await expect(users.row(username)).toContainText('Active');

      const dispatcher = await newIpad(browser);
      const dLogin = new LoginPage(dispatcher);
      await dLogin.open();
      await dLogin.signIn(username, password);
      await expect(dispatcher).toHaveURL(/\/salesman\/dispatch-sheet$/);
      await dispatcher.context().close();

      await users.disable(username);
      await users.acknowledgeNotice(/disabled|deactivated/i);
      await expect(users.row(username)).toContainText(/Inactive|Disabled/i);

      const blocked = await newIpad(browser);
      const bLogin = new LoginPage(blocked);
      await bLogin.open();
      await bLogin.signIn(username, password);
      await expect(bLogin.error(/invalid|incorrect|wrong|disabled|deactivated|inactive/i)).toBeVisible();
      await blocked.context().close();

      await users.delete(username);
      await users.acknowledgeNotice(/deleted/i);
      await expect(users.row(username)).toHaveCount(0);
    } finally {
      await superSeed.call('superadmin', 'delete', `/admin-users/${id}`); // no-op once deleted through the UI
    }
    await ipad.context().close();
  });

  test('your own account cannot be disabled or deleted from the list', async ({ browser, superSeed: _ }) => {
    const ipad = await newSuperadminIpad(browser);
    const users = new AdminUsersPage(ipad);
    await users.open();
    await users.search.fill(env.superadminUsername);
    await expect(users.row(env.superadminUsername).getByRole('button', { name: `Disable ${env.superadminUsername}` })).toBeDisabled();
    await expect(users.row(env.superadminUsername).getByRole('button', { name: 'Delete user' })).toBeDisabled();
    await ipad.context().close();
  });
});
