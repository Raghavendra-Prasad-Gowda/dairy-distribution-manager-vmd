import { type Locator, type Page } from '@playwright/test';

/** /salesperson-outstanding — who owes what on a day. One card per salesperson. */
export class OutstandingPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/salesperson-outstanding');
    await this.page.getByRole('heading', { name: 'Salesperson Outstanding' }).waitFor();
  }

  /** The card of one salesperson, anchored on their name. */
  card(name: string): Locator {
    return this.page
      .getByRole('main')
      .locator('div')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .filter({ hasText: /Balance Due/ })
      .last();
  }
}

/** /salesman/day-balance — one table row per salesman. */
export class DayBalancePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/salesman/day-balance');
    await this.page.getByRole('heading', { name: 'Day Balance' }).waitFor();
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /** Cell texts of a row, in column order: bill, outstanding, bill+outstanding, paid, balance today, total balance. */
  async cells(name: string): Promise<string[]> {
    return this.row(name).getByRole('cell').allInnerTexts();
  }
}

/** /reports/salespeople — statement, dispatch summary and bills for one salesperson. */
export class StatementsPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/reports/salespeople');
    await this.page.getByRole('heading', { name: 'Salesperson Statement' }).waitFor();
  }

  async select(name: string): Promise<void> {
    await this.page.getByPlaceholder('Search name or route…').fill(name);
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  get outstandingBadge(): Locator {
    return this.page.getByText(/^Outstanding: /);
  }

  /** The statement row of a day, e.g. "07 Nov". */
  dayRow(label: string): Locator {
    return this.page.getByRole('row').filter({ hasText: label });
  }

  get totalsRow(): Locator {
    return this.page.getByRole('row').filter({ hasText: /^Totals/ });
  }
}

/** Bills tab of the statements page: preview what would be billed, issue the bill, see and remove history. */
export class BillsPanel {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.getByRole('button', { name: 'Bills', exact: true }).click();
    await this.page.getByRole('heading', { name: 'Bill Preview' }).waitFor();
  }

  get generateButton(): Locator {
    return this.page.getByRole('button', { name: 'Generate Bill' });
  }

  previewLine(productName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: productName });
  }

  get previewTotal(): Locator {
    return this.page.getByRole('row').filter({ hasText: /^Total/ }).first();
  }

  /** The count line under "Bill History", e.g. "1 bill issued to <name>". */
  issued(count: number, salespersonName: string): Locator {
    return this.page.getByText(`${count} bill${count === 1 ? '' : 's'} issued to ${salespersonName}`);
  }

  /** Issues a bill through its confirmation and resolves with the created bill's API response. */
  async generate() {
    await this.generateButton.click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Generate a bill for' });
    await dialog.waitFor();
    const created = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/bills$/.test(new URL(r.url()).pathname),
    );
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    return created;
  }
}
