import { expect, test } from '../src/fixtures';
import { BrandsSetupPage } from '../src/pages/BrandsSetupPage';
import { newSuperadminIpad } from '../src/pages/SalesmanPages';
import { unique } from '../src/seed';

/**
 * A brand is the root of every ledger, so adding, renaming, switching deposit on, disabling and archiving one is a
 * superadmin duty that must stick. Brands cannot be deleted, so the journey ends by archiving what it created.
 */
test.describe('Brands setup (superadmin)', () => {
  test('adds a brand, renames it, sets its deposit rate, disables and re-enables it, then archives it', async ({
    browser,
    superSeed,
  }) => {
    const ipad = await newSuperadminIpad(browser);
    const name = unique();
    const renamed = unique();
    let brandId: number | undefined;
    try {
      const brands = new BrandsSetupPage(ipad);
      await brands.open();

      const created = await brands.add(name);
      expect(created.status()).toBe(201);
      brandId = (await created.json()).data.id as number;
      await brands.acknowledgeNotice(`Brand "${name}" added`);
      await expect(brands.row(name)).toBeVisible();

      await brands.rename(brands.row(name), renamed);
      await brands.acknowledgeNotice(`Brand renamed to "${renamed}"`);
      await expect(brands.row(renamed)).toBeVisible();
      await expect(brands.row(name)).toHaveCount(0);

      await brands.enableDeposit(brands.row(renamed), 4);
      await brands.acknowledgeNotice(`Deposit settings saved for "${renamed}"`);
      await expect(brands.row(renamed).getByTitle('Deposit is enabled for this brand')).toBeVisible();

      await brands.toggleActive(brands.row(renamed), 'Disable');
      await brands.acknowledgeNotice(`Brand "${renamed}" disabled`);
      await expect(brands.row(renamed)).toContainText('Disabled');

      await ipad.reload();
      await brands.open();
      await expect(brands.row(renamed)).toContainText('Disabled');
      await expect(brands.row(renamed).getByTitle('Deposit is enabled for this brand')).toBeVisible();

      await brands.toggleActive(brands.row(renamed), 'Enable');
      await brands.acknowledgeNotice(`Brand "${renamed}" enabled`);
      await expect(brands.row(renamed)).not.toContainText('Disabled');

      await brands.archive(brands.row(renamed));
      await brands.acknowledgeNotice(`Brand "${renamed}" archived`);
      await expect(brands.row(renamed)).toHaveCount(0);
    } finally {
      // Archived through the UI above; this is the safety net if the journey stopped early.
      if (brandId) await superSeed.call('superadmin', 'put', `/brands/${brandId}`, { isArchived: true });
      await ipad.context().close();
    }
  });

  test('a brand needs a name', async ({ browser }) => {
    const ipad = await newSuperadminIpad(browser);
    try {
      const brands = new BrandsSetupPage(ipad);
      await brands.open();
      await ipad.getByRole('button', { name: 'Add Brand' }).first().click();
      await expect(ipad.locator('form').getByRole('button', { name: 'Add Brand' })).toBeDisabled();
    } finally {
      await ipad.context().close();
    }
  });
});
