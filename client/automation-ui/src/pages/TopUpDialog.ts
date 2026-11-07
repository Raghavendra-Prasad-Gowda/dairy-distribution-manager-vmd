import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * The "Bulk Top-up" dialog shared by Collections (salespeople) and Dairy Payments (brands, superadmin only).
 * A top-up loads a pre-existing due, so it ADDS to what is owed. Step 1 picks who, step 2 enters the amount.
 */
export class TopUpDialog extends BasePage {
  constructor(page: Page, private readonly savePath: RegExp) {
    super(page);
  }

  /** Opens the dialog from the page's toolbar. */
  async open(): Promise<void> {
    await this.page.getByRole('button', { name: 'Bulk Top-up', exact: true }).click();
    await expect(this.dialog.getByRole('heading', { name: 'Bulk Top-up' })).toBeVisible();
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
    await this.dialog.getByRole('button', { name: 'Add top-up', exact: true }).click();
    expect((await saved).status()).toBe(201);
    await this.acknowledgeNotice(/Top-up added for 1 /);
  }
}
