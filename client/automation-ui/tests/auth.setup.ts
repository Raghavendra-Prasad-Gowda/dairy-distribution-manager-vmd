import { expect, test as setup } from '@playwright/test';
import { ADMIN_STATE } from '../playwright.config';
import { env } from '../src/env';
import { Seed } from '../src/seed';
import { DashboardPage } from '../src/pages/DashboardPage';
import { LoginPage } from '../src/pages/LoginPage';

setup('sign in as the admin and save the session', async ({ page }) => {
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(env.adminUsername(), env.adminPassword());
  await expect(new DashboardPage(page).heading).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('sweep test data left behind by an earlier run', async () => {
  // A run that crashed or timed out may have skipped its own cleanup; start from a clean environment.
  await new Seed().sweep();
});
