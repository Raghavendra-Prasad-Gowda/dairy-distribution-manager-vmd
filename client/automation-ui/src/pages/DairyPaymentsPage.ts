import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { PinDialog } from './PinDialog';

export type PaymentMode = 'Cash' | 'UPI' | 'NEFT' | 'RTGS' | 'Cheque';

/** /dairy/payments — what we owe each dairy brand, and the payments we record against it. */
export class DairyPaymentsPage extends BasePage {
  readonly amount: Locator;
  readonly recordButton: Locator;
  readonly statusPill: Locator;

  constructor(page: Page) {
    super(page);
    this.amount = page.getByRole('spinbutton');
    this.recordButton = page.getByRole('button', { name: 'Record Payment' });
    this.statusPill = page.getByText(/^(Outstanding|Credit|Cleared)$/);
  }

  /** Opens the page already on a brand (the same link the dashboard's "Pay Now" uses). */
  async open(brandId: number): Promise<void> {
    await this.page.goto(`/dairy/payments?brandId=${brandId}`);
    await this.page.getByRole('heading', { name: 'Record Payment' }).waitFor();
    await expect(this.youOwe).toBeVisible();
  }

  private figure(label: string | RegExp): Locator {
    return this.page.getByText(label, { exact: typeof label === 'string' }).locator('xpath=following-sibling::p[1]');
  }

  /** The big balance figure: labelled "You Owe", "You're in Credit" or "Settled" depending on the state. */
  get youOwe(): Locator {
    return this.figure(/^(You Owe|You're in Credit|Settled)$/);
  }

  get balanceLabel(): Locator {
    return this.page.getByText(/^(You Owe|You're in Credit|Settled)$/);
  }

  async record(amount: number, mode: PaymentMode = 'UPI', reference?: string): Promise<void> {
    await this.amount.fill(String(amount));
    await this.page.getByRole('button', { name: mode, exact: true }).click();
    if (reference) await this.page.getByPlaceholder('Txn / cheque no.').fill(reference);
    const saved = this.nextResponse('POST', /\/dairy-payments$/);
    await this.recordButton.click();
    await saved;
    await this.acknowledgeNotice('Payment recorded successfully');
  }

  /** True while the browser's own validation blocks the amount field (e.g. 0 is below the minimum). */
  async amountIsInvalid(): Promise<boolean> {
    return this.amount.evaluate((el) => !(el as HTMLInputElement).validity.valid);
  }

  historyRow(text: string | RegExp): Locator {
    return this.page.getByRole('row').filter({ hasText: text });
  }

  /** Pressing Delete on a row asks for the edit PIN first, then for confirmation. */
  async delete(row: Locator, pin: string): Promise<void> {
    await row.getByRole('button', { name: 'Delete' }).click();
    const pinDialog = new PinDialog(this.page);
    await pinDialog.expectOpen();
    await pinDialog.submit(pin);
    await expect(this.page.getByRole('dialog', { name: 'Delete Payment?' })).toBeVisible();
    const deleted = this.nextResponse('DELETE', /\/dairy-payments\/\d+$/);
    await this.confirmDialog('Delete');
    await deleted;
    await this.acknowledgeNotice('Payment deleted');
  }
}
