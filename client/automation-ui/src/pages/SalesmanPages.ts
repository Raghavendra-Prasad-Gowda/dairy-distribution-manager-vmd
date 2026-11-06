import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { LoginPage } from './LoginPage';

/** Signs a salesman in through the real login form and waits for their home screen. */
export async function signInAsSalesman(page: Page, username: string, password: string): Promise<SalesmanStockEntryPage> {
  const login = new LoginPage(page);
  await login.open();
  await login.signIn(username, password);
  const home = new SalesmanStockEntryPage(page);
  await home.heading.waitFor();
  return home;
}

/** Phone bottom navigation shared by every salesman screen. */
export class SalesmanNav {
  constructor(private readonly page: Page) {}

  async goTo(label: 'Stock' | 'Balance' | 'Statement' | 'Security'): Promise<void> {
    await this.page.getByRole('navigation').last().getByRole('link', { name: label, exact: true }).click();
  }
}

/** / (salesman) — enter today's quantities, save a draft, finalize & submit. */
export class SalesmanStockEntryPage extends BasePage {
  readonly heading: Locator;
  readonly search: Locator;
  readonly saveButton: Locator;
  readonly finalizeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Stock Entry' });
    this.search = page.getByPlaceholder('Search product, category or brand…');
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.finalizeButton = page.getByRole('button', { name: /Finalize & Submit/ }).last();
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await this.heading.waitFor();
    await expect(this.page.getByText('Loading…')).toHaveCount(0);
  }

  /** Narrows the (long, collapsed-by-default) catalogue to the products matching `text`. */
  async find(text: string): Promise<void> {
    await this.search.fill(text);
    await this.page.getByRole('button', { name: 'Expand All' }).click();
  }

  /** The row of one product: its name, rate per unit and quantity box. */
  product(name: string): Locator {
    return this.page.getByText(name, { exact: true }).locator('xpath=ancestor::div[.//input[@type="number"] or .//*[@role="spinbutton"]][1]');
  }

  quantity(name: string): Locator {
    return this.product(name).getByRole('spinbutton');
  }

  /** The running summary above the Save button, e.g. "1 product · 4 units · ₹72.00". */
  get summary(): Locator {
    return this.page.getByText(/\d+ products? · \d+ units/).last();
  }

  /** "Stock Taken" in the balance strip (what is already saved). */
  get stockTaken(): Locator {
    return this.page.getByText('Stock Taken', { exact: true }).locator('xpath=following-sibling::p[1]');
  }

  get lockedNotice(): Locator {
    return this.page.getByText(/Submitted & locked|Locked/).first();
  }

  async saveDraft(): Promise<void> {
    const saved = this.nextResponse('POST', /\/dispatches$/);
    await this.saveButton.click();
    await saved;
    await this.acknowledgeNotice('Stock entry saved as draft.');
  }

  async finalize(): Promise<void> {
    await this.finalizeButton.click();
    await expect(this.page.getByRole('dialog', { name: 'Finalize stock entry?' })).toBeVisible();
    const submitted = this.nextResponse('PATCH', /\/dispatches\/\d+\/submit$/);
    await this.page.getByRole('dialog').getByRole('button', { name: /Finalize & Submit/ }).click();
    await submitted;
    await this.acknowledgeNotice('Stock entry submitted and locked.');
  }

  async cancelFinalize(): Promise<void> {
    await this.finalizeButton.click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(this.page.getByRole('dialog')).toHaveCount(0);
  }
}

/** /salesman/balance — what I owe and the payments I have made. */
export class SalesmanBalancePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/salesman/balance');
    await this.page.getByRole('heading', { name: 'My Balance' }).waitFor();
  }

  private figure(label: string): Locator {
    return this.page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
  }

  get billToday(): Locator {
    return this.figure('Bill Today');
  }

  get paid(): Locator {
    return this.figure('Paid');
  }

  get balance(): Locator {
    return this.figure('Balance').first();
  }
}

/** /salesman/my-statement — my own account statement. */
export class SalesmanStatementPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/salesman/my-statement');
    await this.page.getByRole('heading', { name: 'My Statement' }).waitFor();
  }

  /** The three summary cards at the top: Billed, Paid, Owed. */
  private card(label: RegExp): Locator {
    return this.page.getByText(label).first().locator('xpath=following-sibling::*[1]');
  }

  get billed(): Locator {
    return this.card(/^Billed$/i);
  }

  get paid(): Locator {
    return this.card(/^Paid$/i);
  }

  get owed(): Locator {
    return this.card(/^Owed$/i);
  }
}

/** /salesman/change-password */
export class ChangePasswordPage extends BasePage {
  readonly current: Locator;
  readonly next: Locator;
  readonly confirm: Locator;
  readonly update: Locator;

  constructor(page: Page) {
    super(page);
    this.current = page.getByPlaceholder('Enter current password');
    this.next = page.getByPlaceholder('Enter new password');
    this.confirm = page.getByPlaceholder('Confirm new password');
    this.update = page.getByRole('button', { name: 'Update Password' });
  }

  async open(path = '/salesman/change-password'): Promise<void> {
    await this.page.goto(path);
    await this.page.getByRole('heading', { name: 'Change Password' }).waitFor();
  }

  async fill(current: string, next: string, confirm = next): Promise<void> {
    await this.current.fill(current);
    await this.next.fill(next);
    await this.confirm.fill(confirm);
  }
}
