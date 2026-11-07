import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** /dairy/stock/:brand — stock received from the dairy, one column of quantities per route. */
export class StockReceiptPage extends BasePage {
  constructor(page: Page, private readonly brandName: string) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto(`/dairy/stock/${this.brandName.toLowerCase()}`);
    await this.page.getByRole('heading', { name: `${this.brandName} Stock Receipt` }).waitFor();
    // The account-balance strip is the last thing to arrive; wait for real figures, not the loader.
    await this.youOwe.waitFor();
  }

  /** The figure printed under a label in the balance strip ("You Owe", "Today's Amount", ...). */
  private figure(label: string | RegExp): Locator {
    return this.page.getByText(label, { exact: typeof label === 'string' }).locator('xpath=following-sibling::p[1]');
  }

  /** Closing balance; the label reads "You Owe", "Credit" or "Settled" depending on the state. */
  get youOwe(): Locator {
    return this.figure(/^(You Owe|You're in Credit|Credit|Settled)$/);
  }

  get todaysAmount(): Locator {
    return this.figure("Today's Amount");
  }

  /** The quantity box of a product in the open route column. */
  quantity(productName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: productName }).getByRole('spinbutton');
  }

  routeTotal(routeNumber: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^Route ${routeNumber}\\b.*Total Amount`) });
  }

  async fill(productName: string, quantity: number): Promise<void> {
    await this.quantity(productName).fill(String(quantity));
  }

  /** Saves the route column and dismisses the "receipt saved" notice. */
  async save(routeNumber: string): Promise<void> {
    const saved = this.nextResponse('POST', /\/stock-receipts\/bulk$/);
    await this.page.getByRole('button', { name: `Save Route ${routeNumber}` }).click();
    await saved;
    await this.acknowledgeNotice(`Route ${routeNumber} receipt saved!`);
  }

  get noRoutesMessage(): Locator {
    return this.page.getByText(/No routes configured for/);
  }

  /** The given categories in the order the stock grid lists them (each is a header row; only the first is open). */
  async categoryOrder(categoryNames: string[]): Promise<string[]> {
    const rows = await this.page.getByRole('row').allInnerTexts();
    return rows
      .map((text) => categoryNames.find((name) => text.includes(name)))
      .filter((name): name is string => name !== undefined);
  }
}
