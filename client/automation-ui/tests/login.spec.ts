import { expect, test } from '../src/fixtures';
import { env } from '../src/env';
import { DashboardPage } from '../src/pages/DashboardPage';
import { LoginPage } from '../src/pages/LoginPage';
import { ShellPage } from '../src/pages/ShellPage';

/**
 * Sign-in is the front door for every role, so these run signed out and are the first thing to
 * break when auth, routing or the session handling regresses. (Salesman sign-in: tests/salesman/.)
 */
test.describe('Sign in', () => {
  test('an admin signs in, lands on the dashboard and stays signed in after a reload', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(env.adminUsername(), env.adminPassword());

    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();

    await page.reload();
    await expect(dashboard.heading).toBeVisible(); // session restored, not bounced to /login
  });

  test('wrong credentials show an error, keep the username and clear the password', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    // Unknown username on purpose: failed attempts against the real admin account count toward its lock-out.
    await login.signIn('e2e-no-such-user', 'definitely-wrong-password');

    await expect(login.error(/invalid|incorrect|wrong/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(login.password).toHaveValue('');
    await expect(login.username).toHaveValue('e2e-no-such-user');
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  });

  test('the sign-in button stays disabled until both fields are filled', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await expect(login.signInButton).toBeDisabled();
    await login.username.fill('someone');
    await expect(login.signInButton).toBeDisabled();
    await login.password.fill('something');
    await expect(login.signInButton).toBeEnabled();
    await login.username.clear();
    await expect(login.signInButton).toBeDisabled();
  });

  for (const path of ['/', '/dairy/payments', '/reports/salespeople', '/print/bill']) {
    test(`signed out, ${path} redirects to the login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('#username')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('signing out ends the session: protected pages and the back button no longer work', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(env.adminUsername(), env.adminPassword());
    await expect(new DashboardPage(page).heading).toBeVisible();

    await new ShellPage(page).signOut();
    await expect(page).toHaveURL(/\/login/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();

    await page.goto('/dairy/payments');
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page.locator('#username')).toBeVisible();
  });
});
