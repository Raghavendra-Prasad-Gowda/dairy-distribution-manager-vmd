import { type Locator, type Page, type Response } from '@playwright/test';
import { BasePage } from './BasePage';

export type OfficeRole = 'Admin' | 'Super Admin' | 'Dispatcher';

/** /admin/users (superadmin only) — office logins: admins, superadmins, dispatchers. */
export class AdminUsersPage extends BasePage {
  readonly search: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search by username or role…');
    this.addButton = page.getByRole('button', { name: 'Add User', exact: true }).first();
  }

  async open(): Promise<void> {
    await this.page.goto('/admin/users');
    await this.page.getByRole('heading', { name: 'Admin Users' }).first().waitFor();
  }

  row(username: string): Locator {
    return this.page.getByRole('row').filter({ hasText: username });
  }

  async add(username: string, password: string, role: OfficeRole): Promise<Response> {
    await this.addButton.click();
    await this.page.getByPlaceholder('e.g. john_admin').fill(username);
    await this.page.getByPlaceholder('Min 6 characters').fill(password);
    await this.page.getByRole('combobox').selectOption({ label: role });
    const saved = this.nextResponse('POST', /\/admin-users$/);
    await this.dialog.getByRole('button', { name: 'Create' }).click();
    return saved;
  }

  async disable(username: string): Promise<void> {
    await this.row(username).getByRole('button', { name: `Disable ${username}` }).click();
    await this.confirmDialog(/Disable/);
  }

  async enable(username: string): Promise<void> {
    await this.row(username).getByRole('button', { name: `Enable ${username}` }).click();
    await this.confirmDialog(/Enable/);
  }

  async delete(username: string): Promise<void> {
    await this.row(username).getByRole('button', { name: 'Delete user' }).click();
    await this.confirmDialog(/Delete/);
  }

  /** Edits a login: a new password and/or a new role. */
  async edit(username: string, changes: { password?: string; role?: OfficeRole }): Promise<void> {
    await this.row(username).getByRole('button', { name: 'Edit user' }).click();
    if (changes.password) await this.dialog.getByPlaceholder('Min 6 characters').fill(changes.password);
    if (changes.role) await this.dialog.getByRole('combobox').selectOption({ label: changes.role });
    const saved = this.nextResponse('PUT', /\/admin-users\/\d+$/);
    await this.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
  }

  /** Forces (or, if already forced, lifts) the authenticator requirement for another login. */
  async toggleMfaRequired(username: string, now: 'require' | 'lift'): Promise<void> {
    const title = now === 'require' ? `Require MFA for ${username}` : `Stop requiring MFA for ${username}`;
    await this.row(username).getByRole('button', { name: title }).click();
    await this.confirmDialog(now === 'require' ? 'Require MFA' : 'Stop Requiring');
  }

  /** The MFA column's badge for a login: "Off", "Required" or "On". */
  mfaBadge(username: string, text: 'Off' | 'Required' | 'On'): Locator {
    return this.row(username).getByText(text, { exact: true });
  }

  lockedBadge(username: string): Locator {
    return this.row(username).getByText('Locked', { exact: true });
  }

  async unlock(username: string): Promise<void> {
    await this.row(username).getByRole('button', { name: `Unlock ${username}` }).click();
  }
}
