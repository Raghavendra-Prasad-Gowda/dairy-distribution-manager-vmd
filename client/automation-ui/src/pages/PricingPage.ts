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
    // The first data load selects the first salesperson when it lands, overriding any click made before it: let it
    // finish, or a slow API makes a "Global" click vanish.
    await this.page.waitForLoadState('networkidle');
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

  /** Superadmin only, on the "Global" view: grant or remove a per-salesperson exception to a globally-off product. */
  async openExceptionManager(): Promise<void> {
    await this.page.getByRole('complementary').getByRole('button', { name: /Global/ }).click();
    await this.page.getByRole('button', { name: 'Exception Manager' }).click();
    await this.page.getByRole('heading', { name: 'Exception Manager' }).waitFor();
  }

  /** Ticks one product and one salesperson in the open Exception Manager, optionally with a price. */
  async chooseException(productName: string, salespersonName: string, price?: number): Promise<void> {
    await this.page.getByPlaceholder('Search disabled products…').fill(productName);
    await this.page.getByRole('checkbox', { name: new RegExp(productName) }).check();
    if (price !== undefined) {
      await this.page.locator('label').filter({ hasText: productName }).getByRole('spinbutton').fill(String(price));
    }
    await this.page.getByPlaceholder('Search salespeople…').fill(salespersonName);
    await this.page.getByRole('checkbox', { name: new RegExp(salespersonName) }).check();
  }

  /** Switches the Exception Manager to removing the exception again. */
  async chooseRemoveException(): Promise<void> {
    await this.page.getByRole('button', { name: /Remove exception/ }).click();
  }

  /** Applies it ("Enable (1P x 1S)" / "Disable (1P x 1S)") and acknowledges the result. */
  async applyException(action: 'Enable' | 'Disable', notice: RegExp): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(`^${action} \\(1P`) }).click();
    await this.acknowledgeNotice(notice);
  }

  // ── Bulk tools ───────────────────────────────────────────────────────────────

  /** The "Global" view (all salespeople, brand-wide switches and bulk tools). */
  async openGlobal(brandName: string): Promise<void> {
    await this.page.getByRole('complementary').getByRole('button', { name: /Global/ }).click();
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
    await this.page.getByRole('button', { name: 'Bulk Update Prices' }).waitFor(); // the Global toolbar is showing
  }

  /** Bulk Update Prices: one price for one product, for the chosen salespeople. */
  async bulkUpdatePrice(productName: string, price: number, salespersonName: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Bulk Update Prices' }).click();
    await this.page.getByPlaceholder('Search products to add…').fill(productName);
    await this.page.getByRole('button', { name: new RegExp(productName) }).click();
    await this.page.getByPlaceholder('0.00').fill(String(price)); // the selected product's salesperson price
    await this.page.getByPlaceholder('Search salespeople…').fill(salespersonName);
    await this.page.getByRole('checkbox', { name: new RegExp(salespersonName) }).check();
    await this.page.getByRole('button', { name: /^Update \(1 salesmen, 1 products\)$/ }).click();
    await this.acknowledgeNotice('Prices updated for 1 salesmen and 1 products');
  }

  /** Bulk Enable/Disable Products for the chosen salespeople. */
  async bulkProductAccess(productName: string, salespersonName: string, action: 'enable' | 'disable'): Promise<void> {
    await this.page.getByRole('button', { name: 'Bulk Product Access' }).click();
    await this.page.getByRole('checkbox', { name: new RegExp(salespersonName) }).check();
    await this.page.getByPlaceholder('Search products...').fill(productName);
    await this.page.getByRole('checkbox', { name: new RegExp(productName) }).check();
    await this.page.getByRole('combobox').selectOption(action);
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.acknowledgeNotice(`Products ${action}d for 1 salesman(men)`);
  }

  /** On one salesperson's view: copy every price of this brand from another salesperson. */
  async copyPricesFrom(sourceName: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Copy Prices' }).click();
    await this.page.getByPlaceholder('Search salespeople…').fill(sourceName);
    await this.page.getByRole('button', { name: new RegExp(sourceName) }).last().click();
    await this.page.getByRole('button', { name: 'Copy Prices' }).last().click();
    await this.acknowledgeNotice('Prices copied successfully');
  }
}
