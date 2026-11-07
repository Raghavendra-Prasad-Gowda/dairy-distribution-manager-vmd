import { expect, test as setup } from '@playwright/test';
import { ADMIN_STATE, SUPERADMIN_STATE } from '../playwright.config';
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

setup('sign in as the superadmin and save the session', async ({ page }) => {
  // One sign-in for every superadmin journey (logins are limited to 20 an hour). Without a superadmin the
  // journeys that need one skip themselves (or fail under E2E_STRICT), so there is nothing to do here.
  if (!env.superadminUsername || !env.superadminPassword) {
    if (env.strict) throw new Error('E2E_SUPERADMIN_* is required (E2E_STRICT=true)');
    setup.skip(true, 'E2E_SUPERADMIN_* is not set');
  }
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(env.superadminUsername, env.superadminPassword);
  await expect(new DashboardPage(page).heading).toBeVisible();
  await page.context().storageState({ path: SUPERADMIN_STATE });
});

setup('sweep test data left behind by an earlier run', async () => {
  // A run that crashed or timed out may have skipped its own cleanup; start from a clean environment.
  await new Seed().sweep();
});
