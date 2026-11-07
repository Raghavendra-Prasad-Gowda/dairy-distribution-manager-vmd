import { expect, test } from '../src/fixtures';
import { env } from '../src/env';
import { AdminUsersPage } from '../src/pages/AdminUsersPage';
import { LoginPage } from '../src/pages/LoginPage';
import { newIpad, newSuperadminIpad } from '../src/pages/SalesmanPages';

/**
 * Office logins are managed after they are created: a password reset and a role change must take effect at the next
 * sign-in, a superadmin can force an authenticator on someone, and a locked-out login is released from the list.
 * Every login here is a throwaway `e2e-` user; the suite's own accounts are never touched.
 */
test.describe('Admin users (superadmin)', () => {
  test('editing a login resets its password and changes its role, and the next sign-in follows', async ({
    browser,
    superSeed,
  }) => {
    const user = await superSeed.adminUser('admin');
    const ipad = await newSuperadminIpad(browser);
    const other = await newIpad(browser);
    try {
      const users = new AdminUsersPage(ipad);
      await users.open();
      await users.search.fill(user.username);
      await expect(users.row(user.username)).toContainText('Admin');

      const newPassword = `${user.password}-new`;
      await users.edit(user.username, { password: newPassword, role: 'Dispatcher' });
      await users.acknowledgeNotice(new RegExp(`"${user.username}" updated`));
      await expect(users.row(user.username)).toContainText('Dispatcher');

      const login = new LoginPage(other);
      await login.open();
      await login.signIn(user.username, user.password); // the old password no longer works
      await expect(login.error(/invalid|incorrect|wrong/i)).toBeVisible();
      await login.signIn(user.username, newPassword);
      await expect(other).toHaveURL(/\/salesman\/dispatch-sheet$/); // now a dispatcher
    } finally {
      await other.context().close();
      await ipad.context().close();
    }
  });

  test('requiring an authenticator on a login can be switched on and lifted again', async ({ browser, superSeed }) => {
    const user = await superSeed.adminUser('admin');
    const ipad = await newSuperadminIpad(browser);
    try {
      const users = new AdminUsersPage(ipad);
      await users.open();
      await users.search.fill(user.username);
      await expect(users.mfaBadge(user.username, 'Off')).toBeVisible();

      await users.toggleMfaRequired(user.username, 'require');
      await users.acknowledgeNotice(`MFA required for "${user.username}"`);
      await expect(users.mfaBadge(user.username, 'Required')).toBeVisible();

      await ipad.reload();
      await users.search.fill(user.username);
      await expect(users.mfaBadge(user.username, 'Required')).toBeVisible();

      await users.toggleMfaRequired(user.username, 'lift');
      await users.acknowledgeNotice(`MFA no longer required for "${user.username}"`);
      await expect(users.mfaBadge(user.username, 'Off')).toBeVisible();
    } finally {
      await ipad.context().close();
    }
  });

  test('a login locked out by wrong passwords is unlocked from the list and can sign in again', async ({
    browser,
    superSeed,
  }) => {
    const user = await superSeed.adminUser('admin');
    // Five wrong passwords lock the account. Done on this throwaway login only (never on the suite's own accounts).
    const api = await (await import('@playwright/test')).request.newContext({ baseURL: env.apiBaseUrl });
    for (let i = 0; i < 5; i++) {
      await api.post('/api/v1/auth/login', { data: { username: user.username, password: 'wrong-password-1A!' } });
    }
    await api.dispose();

    const ipad = await newSuperadminIpad(browser);
    const other = await newIpad(browser);
    try {
      const users = new AdminUsersPage(ipad);
      await users.open();
      await users.search.fill(user.username);
      await expect(users.lockedBadge(user.username)).toBeVisible();

      const login = new LoginPage(other);
      await login.open();
      await login.signIn(user.username, user.password); // the right password is refused while locked
      await expect(other).not.toHaveURL(/\/dashboard|\/salesman\//);

      await users.unlock(user.username);
      await users.acknowledgeNotice(`"${user.username}" unlocked`);
      await expect(users.lockedBadge(user.username)).toHaveCount(0);

      await login.signIn(user.username, user.password);
      await expect(other.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();
    } finally {
      await other.context().close();
      await ipad.context().close();
    }
  });
});
