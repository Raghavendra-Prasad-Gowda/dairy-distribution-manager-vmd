import { expect, test } from '@playwright/test';
import { env } from '../src/env';
import { DashboardPage } from '../src/pages/DashboardPage';
import { LoginPage } from '../src/pages/LoginPage';

test.describe('Sign in', () => {
  test('admin can sign in and reach the dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(env.adminUsername(), env.adminPassword());

    await expect(new DashboardPage(page).heading).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
  });

  test('wrong credentials show an error and stay on the login page', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    // Unknown username on purpose: failed attempts against the real admin account would count
    // toward its lockout and could lock the E2E account out of every other test.
    await login.signIn('e2e-no-such-user', 'definitely-wrong-password');

    await expect(login.error(/invalid|incorrect|wrong/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(login.password).toHaveValue(''); // password is cleared after a rejected attempt
    await expect(login.username).toHaveValue('e2e-no-such-user'); // ...but the username is kept for a retry
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  });

  test('protected pages redirect to the login page when signed out', async ({ page }) => {
    await page.goto('/dairy/setup/routes');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
