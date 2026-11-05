import { expect, test as setup } from '@playwright/test';
import { ADMIN_STATE } from '../playwright.config';
import { env } from '../src/env';
import { DashboardPage } from '../src/pages/DashboardPage';
import { LoginPage } from '../src/pages/LoginPage';

setup('sign in as the admin and save the session', async ({ page }) => {
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(env.adminUsername(), env.adminPassword());
  await expect(new DashboardPage(page).heading).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});
