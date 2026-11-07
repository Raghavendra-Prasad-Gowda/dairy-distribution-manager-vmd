import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** /salesman/setup/prices — per-salesperson selling prices and product access. */
export class PricingPage extends BasePage {
  readonly salespersonSearch: Locator;
  readonly productSearch: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.salespersonSearch = page.getByPlaceholder('Search salesperson…');
    this.productSearch = page.getByPlaceholder('Search by product name or category…');
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
  }

  async open(): Promise<void> {
    await this.page.goto('/salesman/setup/prices');
    await this.page.getByRole('heading', { name: 'Products & Prices' }).waitFor();
  }

  async selectSalesperson(name: string): Promise<void> {
    await this.salespersonSearch.fill(name);
    await this.page.getByRole('complementary').getByRole('button', { name: new RegExp(name) }).first().click();
  }

  row(productName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: productName });
  }

  /** Shows one product: opens its brand's tab first (the page lists one brand at a time), then searches. */
  async find(productName: string, brandName: string): Promise<void> {
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
    await this.productSearch.fill(productName);
  }

  /** Opens the price editor for a product, sets a new price, and confirms it in the editor. */
  async setPrice(productName: string, price: number): Promise<void> {
    await this.row(productName).getByRole('button', { name: 'Edit price' }).click();
    const editor = this.page.locator('div').filter({ has: this.page.getByRole('heading', { name: 'Edit Price' }) }).last();
    await this.page.getByRole('spinbutton').last().fill(String(price));
    await this.page.getByRole('button', { name: 'Save Price' }).click();
    await editor.waitFor({ state: 'detached' }).catch(() => undefined);
  }
}
