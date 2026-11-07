import { expect, test } from '../src/fixtures';
import { LoginPage } from '../src/pages/LoginPage';
import { newPhone } from '../src/pages/SalesmanPages';
import { UsersSetupPage } from '../src/pages/UsersSetupPage';
import { unique } from '../src/seed';

/**
 * Admins create the salesman accounts that the whole field operation signs in with. Adding, disabling and changing
 * credentials must have a real effect at the front door, so each journey finishes by signing in on a fresh phone.
 * Accounts are throwaway "E2E ..." records removed afterwards. (The backend allows 30 requests a minute on
 * /salespeople, so the journeys are kept few and complete rather than many and small.)
 */
test.describe('Salesman users', () => {
  test('add a salesperson with a login: validation, duplicates, persistence and a working sign-in', async ({
    page,
    browser,
    seed,
    trackCreated,
  }) => {
    const existing = await seed.salesperson(true);
    const users = new UsersSetupPage(page);
    await users.open();

    // A username without a password is stopped before it reaches the server.
    await users.addButton.click();
    await page.getByPlaceholder('e.g. Ramu', { exact: true }).fill(`E2E ${unique('SP')}`);
    await page.getByPlaceholder('e.g. ramu.k').fill('only-a-username');
    await page.locator('form').getByRole('button', { name: 'Add Salesperson' }).click();
    await expect(page.getByText('Password is required when setting a username')).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => undefined);
    await users.cancelForm();

    // A username that already exists is refused.
    const clash = await users.add({ name: `E2E ${unique('SP')}`, username: existing.username, password: 'Another-Pass-1A' });
    expect(clash.status()).toBe(409);
    await users.acknowledgeNotice(/exist|taken|already|duplicate/i);
    await users.cancelForm();

    // A valid one is saved, listed, still there after a reload, and can sign in.
    const name = `E2E ${unique('SP')}`;
    const username = `e2e-${Date.now().toString(36)}`;
    const password = `Pass-${Date.now().toString(36)}-1A`;
    const created = await users.add({ name, username, password, route: 'E2E Zone' });
    expect(created.status()).toBe(201);
    trackCreated(created.url(), (await created.json()).data.id);
    await users.acknowledgeNotice('Salesperson added');

    await page.reload();
    await users.find(name);
    await expect(users.row(name)).toContainText(`@${username}`);
    await expect(users.row(name)).toContainText('E2E Zone');

    const phone = await newPhone(browser);
    const login = new LoginPage(phone);
    await login.open();
    await login.signIn(username, password);
    await expect(phone.getByRole('heading', { name: 'Stock Entry' })).toBeVisible();
    await phone.context().close();
  });

  test('disabling locks a salesperson out, enabling lets them back, and new credentials replace the old', async ({
    page,
    browser,
    seed,
  }) => {
    const sp = await seed.salesperson(true);
    const users = new UsersSetupPage(page);
    await users.open();
    await users.find(sp.name);

    const phone = await newPhone(browser);
    const login = new LoginPage(phone);
    await login.open();

    await users.toggle(sp.name, 'Disable');
    await expect(users.row(sp.name).getByRole('button', { name: 'Enable', exact: true })).toBeVisible();
    await login.signIn(sp.username!, sp.password!);
    await expect(login.error(/invalid|incorrect|wrong|deactivated|disabled|inactive/i)).toBeVisible();
    await expect(phone).toHaveURL(/\/login/);

    await users.toggle(sp.name, 'Enable');

    // Mismatched confirmation is refused; a matching one replaces the password.
    await users.setCredentials(sp.name, { password: 'Newer-Pass-1A', confirm: 'Different-Pass-1A' });
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => undefined);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await users.setCredentials(sp.name, { password: 'Newer-Pass-1A', confirm: 'Newer-Pass-1A' });
    await users.acknowledgeNotice('Credentials updated');

    await login.signIn(sp.username!, sp.password!); // the old password no longer works
    await expect(login.error(/invalid|incorrect|wrong/i)).toBeVisible();
    await login.signIn(sp.username!, 'Newer-Pass-1A');
    await expect(phone.getByRole('heading', { name: 'Stock Entry' })).toBeVisible();
    await phone.context().close();
  });

  test('a salesperson with no history can be deleted', async ({ page, trackCreated }) => {
    const users = new UsersSetupPage(page);
    await users.open();
    const name = `E2E ${unique('SP')}`;
    const created = await users.add({ name });
    trackCreated(created.url(), (await created.json()).data.id);
    await users.acknowledgeNotice('Salesperson added');

    await users.find(name);
    await users.delete(name);
    await expect(users.row(name)).toHaveCount(0);
    await page.reload();
    await users.find(name);
    await expect(users.row(name)).toHaveCount(0);
  });
});
