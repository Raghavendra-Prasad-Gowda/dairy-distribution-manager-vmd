import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** /salesman/dispatch-sheet — what each salesperson took out on a day, and the lock on their entry. */
export class DispatchSheetPage extends BasePage {
  readonly search: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search salesperson…');
  }

  async open(): Promise<void> {
    await this.page.goto('/salesman/dispatch-sheet');
    await this.page.getByRole('heading', { name: 'Daily Dispatch Sheet' }).waitFor();
  }

  /** The sidebar entry for a salesperson: their name plus the day's total, or "No entry". */
  entry(name: string): Locator {
    return this.page.getByRole('complementary').getByRole('button', { name: new RegExp(name) });
  }

  async select(name: string): Promise<void> {
    await this.search.fill(name);
    await this.entry(name).click();
  }

  /** The detail panel on the right. */
  get detail(): Locator {
    return this.page.getByRole('main');
  }

  get lockedBadge(): Locator {
    return this.detail.getByText('Locked', { exact: true });
  }

  get unlockButton(): Locator {
    return this.detail.getByRole('button', { name: 'Unlock' });
  }

  get lockButton(): Locator {
    return this.detail.getByRole('button', { name: 'Lock', exact: true });
  }

  /** Confirms the lock/unlock question that follows pressing the button. */
  async confirmLockChange(buttonName: string | RegExp): Promise<void> {
    const changed = this.page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/dispatches\/\d+\/(lock|unlock)$/.test(new URL(r.url()).pathname),
    );
    await this.page.getByRole('dialog').getByRole('button', { name: buttonName }).click();
    await changed;
  }
}
