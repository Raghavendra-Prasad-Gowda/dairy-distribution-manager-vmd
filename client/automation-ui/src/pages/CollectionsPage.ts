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
}
