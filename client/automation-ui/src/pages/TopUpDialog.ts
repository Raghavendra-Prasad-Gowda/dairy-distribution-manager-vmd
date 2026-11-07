import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * The "Bulk Top-up" dialog shared by Collections (salespeople) and Dairy Payments (brands, superadmin only).
 * A top-up loads a pre-existing due, so it ADDS to what is owed. Step 1 picks who, step 2 enters the amount.
 */
export class TopUpDialog extends BasePage {
  constructor(
    page: Page,
    private readonly savePath: RegExp,
    private readonly labels = { open: 'Bulk Top-up', title: 'Bulk Top-up', add: 'Add top-up', notice: /Top-up added for 1 / },
  ) {
    super(page);
  }

  /** The deposit variant (Deposit report): a crate-deposit ledger kept apart from what is owed for stock. */
  static forDeposit(page: Page): TopUpDialog {
    return new TopUpDialog(page, /\/dairy-deposit-topups\/bulk$/, {
      open: 'Deposit Top-up',
      title: 'Deposit Top-up',
      add: 'Add deposit top-up',
      notice: /Deposit top-up added for 1 /,
    });
  }

  /** Opens the dialog from the page's toolbar. */
  async open(): Promise<void> {
    await this.page.getByRole('button', { name: this.labels.open, exact: true }).click();
    await expect(this.dialog.getByRole('heading', { name: this.labels.title })).toBeVisible();
  }

  /** Picks one entity by name (step 1) and moves on to the amount (step 2). */
  async pick(name: string): Promise<void> {
    await this.dialog.getByRole('textbox').first().fill(name);
    await this.dialog.getByRole('button', { name: new RegExp(name) }).click();
    await this.dialog.getByRole('button', { name: 'Next', exact: true }).click();
  }

  /** Types the amount, saves, and acknowledges "Top-up added for 1 …". */
  async addAmount(amount: number): Promise<void> {
    await this.dialog.getByRole('spinbutton').fill(String(amount));
    const saved = this.nextResponse('POST', this.savePath);
    await this.dialog.getByRole('button', { name: this.labels.add, exact: true }).click();
    expect((await saved).status()).toBe(201);
    await this.acknowledgeNotice(this.labels.notice);
  }
}
