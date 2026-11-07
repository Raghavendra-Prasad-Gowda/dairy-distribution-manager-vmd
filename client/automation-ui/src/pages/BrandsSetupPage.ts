import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** /dairy/setup/brands — the dairy brands every ledger hangs off (superadmin manages them). */
export class BrandsSetupPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/dairy/setup/brands');
    await this.page.getByRole('heading', { name: 'Brands' }).waitFor();
    await expect(this.page.getByText('Loading…')).toHaveCount(0);
  }

  row(name: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  private get form(): Locator {
    return this.page.locator('form').filter({ has: this.page.getByPlaceholder('e.g. Amul, Nandini, Heritage') });
  }

  /** Adds a brand and resolves with the created brand's API response. */
  async add(name: string) {
    await this.page.getByRole('button', { name: 'Add Brand' }).first().click();
    await this.page.getByPlaceholder('e.g. Amul, Nandini, Heritage').fill(name);
    const created = this.nextResponse('POST', /\/brands$/);
    await this.form.getByRole('button', { name: 'Add Brand' }).click();
    return created;
  }

  async rename(row: Locator, newName: string): Promise<void> {
    await row.getByTitle('Rename brand').click();
    await this.page.getByPlaceholder('e.g. Amul, Nandini, Heritage').fill(newName);
    const saved = this.nextResponse('PUT', /\/brands\/\d+$/);
    await this.form.getByRole('button', { name: 'Save Changes' }).click();
    await saved;
  }

  /** Opens Deposit Settings, switches deposit on with a rate, and saves. */
  async enableDeposit(row: Locator, ratePerLitre: number): Promise<void> {
    await row.getByTitle('Deposit settings').click();
    await this.page.getByRole('switch').click();
    await this.page.getByPlaceholder('0.00').fill(String(ratePerLitre));
    const saved = this.nextResponse('PUT', /\/brands\/\d+$/);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
  }

  async toggleActive(row: Locator, confirmName: 'Enable' | 'Disable'): Promise<void> {
    await row.getByTitle(confirmName === 'Disable' ? 'Disable brand' : 'Enable brand').click();
    const saved = this.nextResponse('PUT', /\/brands\/\d+$/);
    await this.confirmDialog(confirmName);
    await saved;
  }

  async archive(row: Locator): Promise<void> {
    await row.getByTitle('Archive brand').click();
    const saved = this.nextResponse('PUT', /\/brands\/\d+$/);
    await this.confirmDialog('Archive');
    await saved;
  }
}
