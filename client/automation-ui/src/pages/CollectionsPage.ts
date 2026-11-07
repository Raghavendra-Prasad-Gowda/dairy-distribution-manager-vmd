import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { PinDialog } from './PinDialog';
import type { PaymentMode } from './DairyPaymentsPage';

/** /salesman/payments — cash / UPI collected from salespeople. */
export class CollectionsPage extends BasePage {
  readonly search: Locator;
  readonly amount: Locator;
  readonly recordButton: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search name or route…');
    this.amount = page.getByRole('spinbutton');
    this.recordButton = page.getByRole('button', { name: 'Record Payment' });
  }

  async open(): Promise<void> {
    await this.page.goto('/salesman/payments');
    await this.page.getByRole('heading', { name: 'Collections' }).waitFor();
  }

  /** Narrows the list to one salesperson and opens their account. */
  async select(name: string): Promise<void> {
    await this.search.fill(name);
    await this.page.getByRole('button', { name: new RegExp(name) }).first().click();
    await expect(this.page.getByRole('paragraph').filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible();
  }

  /** The account card of the selected salesperson (opening, dispatched, collected, balance). */
  get account(): Locator {
    return this.page.getByRole('main');
  }

  async record(amount: number, mode: PaymentMode = 'Cash', reference?: string): Promise<void> {
    await this.amount.fill(String(amount));
    await this.page.getByRole('button', { name: mode, exact: true }).click();
    if (reference) await this.page.getByPlaceholder('Txn / cheque no.').fill(reference);
    const saved = this.nextResponse('POST', /\/salesperson-payments$/);
    await this.recordButton.click();
    await saved;
    await this.acknowledgeNotice(/recorded/i);
  }

  historyRow(text: string | RegExp): Locator {
    return this.page.getByRole('row').filter({ hasText: text });
  }

  async delete(row: Locator, pin: string): Promise<void> {
    await row.getByRole('button', { name: 'Delete' }).click();
    const pinDialog = new PinDialog(this.page);
    await pinDialog.expectOpen();
    await pinDialog.submit(pin);
    const deleted = this.nextResponse('DELETE', /\/salesperson-payments\/\d+$/);
    await this.confirmDialog('Delete');
    await deleted;
    await this.acknowledgeNotice(/deleted/i);
  }

  /** The "Edit Collection" form that opens after the PIN. */
  get editForm(): Locator {
    return this.page.getByRole('heading', { name: 'Edit Collection' }).locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
  }

  async openEdit(row: Locator, pin: string): Promise<void> {
    await row.getByRole('button', { name: 'Edit' }).click();
    const pinDialog = new PinDialog(this.page);
    await pinDialog.expectOpen();
    await pinDialog.submit(pin);
    await expect(this.editForm).toBeVisible();
  }

  async saveEdit(changes: { amount?: number; mode?: PaymentMode; reference?: string }): Promise<void> {
    if (changes.amount !== undefined) await this.editForm.getByRole('spinbutton').fill(String(changes.amount));
    if (changes.mode) await this.editForm.getByRole('combobox').selectOption(changes.mode);
    if (changes.reference !== undefined) await this.editForm.getByPlaceholder('UPI ref / cheque no.').fill(changes.reference);
    const saved = this.nextResponse('PUT', /\/salesperson-payments\/\d+$/);
    await this.editForm.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
    await this.acknowledgeNotice(/updated/i);
  }

  /** Superadmin: clears a salesperson's whole ledger (dispatches and payments) after the edit PIN. */
  async resetLedger(name: string, pin: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Reset Ledger' }).click();
    const pinDialog = new PinDialog(this.page);
    await pinDialog.expectOpen();
    await pinDialog.submit(pin);
    const picker = this.page.getByRole('dialog').filter({ hasText: 'Select salespeople' });
    await picker.getByPlaceholder('Search name or route…').fill(name);
    await picker.getByRole('button', { name: new RegExp(name) }).click();
    const cleared = this.nextResponse('POST', /\/salespeople\/reset-ledger$/);
    await picker.getByRole('button', { name: 'Clear ledger' }).click();
    await cleared;
    await this.acknowledgeNotice(/Ledger cleared for 1 salesperson/);
  }
}
