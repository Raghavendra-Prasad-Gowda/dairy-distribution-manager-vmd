import { expect, type Locator, type Page } from '@playwright/test';

/** The 6-box PIN prompt shown before protected edits (back-dated changes, deleting payments, P&L). */
export class PinDialog {
  readonly boxes: Locator;
  readonly confirm: Locator;

  constructor(private readonly page: Page) {
    this.boxes = page.locator('input[type="password"][inputmode="numeric"]');
    this.confirm = page.getByRole('button', { name: 'Confirm' });
  }

  async expectOpen(): Promise<void> {
    await expect(this.boxes).toHaveCount(6);
  }

  /** Types the PIN like a person: focus the first box and type, the boxes advance by themselves. */
  async enter(pin: string): Promise<void> {
    await this.boxes.first().click();
    await this.page.keyboard.type(pin);
  }

  /** The sixth digit submits the PIN by itself, so there is no Confirm click. */
  async submit(pin: string): Promise<void> {
    await this.enter(pin);
  }

}
