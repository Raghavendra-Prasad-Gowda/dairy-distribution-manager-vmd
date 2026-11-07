import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { PinDialog } from './PinDialog';

export type PaymentMode = 'Cash' | 'UPI' | 'NEFT' | 'RTGS' | 'Cheque';

/** /dairy/payments — what we owe each dairy brand, and the payments we record against it. */
export class DairyPaymentsPage extends BasePage {
  readonly pin: PinDialog;
  readonly amount: Locator;
  readonly recordButton: Locator;
  readonly statusPill: Locator;

  constructor(page: Page) {
    super(page);
    this.pin = new PinDialog(page);
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

  // ── History: search, filters, pages ──────────────────────────────────────────

  get searchBox(): Locator {
    return this.page.getByPlaceholder('Search by amount, mode, reference, date…');
  }

  async openFilters(): Promise<void> {
    await this.page.getByRole('button', { name: /^Filter/ }).click();
  }

  async filterByMode(mode: PaymentMode): Promise<void> {
    await this.page.getByRole('combobox').selectOption(mode);
  }

  async filterByReference(text: string): Promise<void> {
    await this.page.locator('label', { hasText: 'Reference' }).locator('xpath=following-sibling::div//input').fill(text);
  }

  async clearFilters(): Promise<void> {
    await this.page.getByRole('button', { name: 'Clear all filters' }).click();
  }

  get noMatch(): Locator {
    return this.page.getByText('No payments match the current filters');
  }

  /** Rows of the history table (excluding the header). */
  get historyRows(): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('button', { name: 'Delete' }) });
  }

  get pageIndicator(): Locator {
    return this.page.getByText(/^\d+ \/ \d+$/);
  }

  async nextPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  async previousPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Prev', exact: true }).click();
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  /** The "Edit Payment" form that opens after the PIN. */
  get editForm(): Locator {
    return this.page.getByText('Correct the details below and save').locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
  }

  /** Pressing Edit asks for the edit PIN first, then opens the form. */
  async openEdit(row: Locator, pin: string): Promise<void> {
    await row.getByRole('button', { name: 'Edit' }).click();
    const pinDialog = new PinDialog(this.page);
    await pinDialog.expectOpen();
    await pinDialog.submit(pin);
    await expect(this.editForm).toBeVisible();
  }

  async saveEdit(changes: { amount?: number; mode?: PaymentMode; reference?: string }): Promise<void> {
    if (changes.amount !== undefined) await this.editForm.getByRole('spinbutton').fill(String(changes.amount));
    if (changes.mode) await this.editForm.getByRole('button', { name: changes.mode, exact: true }).click();
    if (changes.reference !== undefined) await this.editForm.getByPlaceholder('Txn / cheque no.').fill(changes.reference);
    const saved = this.nextResponse('PUT', /\/dairy-payments\/\d+$/);
    await this.editForm.getByRole('button', { name: 'Save Changes' }).click();
    await saved;
    await this.acknowledgeNotice('Payment updated successfully');
  }
}
