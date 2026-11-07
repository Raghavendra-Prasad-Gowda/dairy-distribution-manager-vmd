import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { BasePage } from './BasePage';

/** /salesman/setup/users — salesman accounts: name, route, login credentials, active status. */
export class UsersSetupPage extends BasePage {
  readonly search: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search by name, route, phone or username…');
    this.addButton = page.getByRole('button', { name: 'Add Salesperson' }).first();
  }

  async open(): Promise<void> {
    await this.page.goto('/salesman/setup/users');
    await this.page.getByRole('heading', { name: 'Salesman Users' }).waitFor();
  }

  async find(text: string): Promise<void> {
    await this.search.fill(text);
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /** Fills and submits the Add Salesperson form; resolves with the API response. */
  async add(details: { name: string; username?: string; password?: string; phone?: string; route?: string }): Promise<Response> {
    await this.addButton.click();
    await this.page.getByPlaceholder('e.g. Ramu', { exact: true }).fill(details.name);
    if (details.phone) await this.page.getByPlaceholder('+91 XXXXX').fill(details.phone);
    if (details.route) await this.page.getByPlaceholder('e.g. North Zone').fill(details.route);
    if (details.username) await this.page.getByPlaceholder('e.g. ramu.k').fill(details.username);
    if (details.password) await this.page.getByPlaceholder('Min 6 characters').fill(details.password);
    const saved = this.nextResponse('POST', /\/salespeople$/);
    await this.page.locator('form').getByRole('button', { name: 'Add Salesperson' }).click();
    return saved;
  }

  async cancelForm(): Promise<void> {
    await this.page.locator('form').getByRole('button', { name: 'Cancel' }).click();
    await expect(this.page.getByPlaceholder('e.g. Ramu', { exact: true })).toHaveCount(0);
  }

  /** Disable / Enable (the toggle's label depends on the current state), through its confirmation. */
  async toggle(name: string, action: 'Disable' | 'Enable'): Promise<void> {
    await this.row(name).getByRole('button', { name: action, exact: true }).click();
    const done = this.nextResponse('PUT', /\/salespeople\/\d+$/);
    await this.dialog.getByRole('button', { name: action, exact: true }).click();
    await done;
    await this.acknowledgeNotice(action === 'Disable' ? 'Salesperson deactivated' : 'Salesperson activated');
  }

  async setCredentials(name: string, change: { username?: string; password?: string; confirm?: string }): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Edit credentials' }).click();
    if (change.username !== undefined) await this.page.getByPlaceholder('e.g. ramu.k').fill(change.username);
    if (change.password !== undefined) await this.page.getByPlaceholder('Leave blank to keep existing').fill(change.password);
    if (change.confirm !== undefined) await this.page.getByPlaceholder('Repeat new password').fill(change.confirm);
    await this.page.getByRole('button', { name: 'Save Credentials' }).click();
  }

  async delete(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Delete salesperson' }).click();
    // This one is a plain panel titled "Delete <name>?", not a dialog.
    const panel = this.page
      .getByRole('heading', { name: `Delete ${name}?` })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    const deleted = this.nextResponse('DELETE', /\/salespeople\/\d+$/);
    await panel.getByRole('button', { name: 'Delete', exact: true }).click();
    await deleted;
    await this.acknowledgeNotice('Salesperson deleted');
  }
}
