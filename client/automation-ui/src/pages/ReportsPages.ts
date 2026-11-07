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

  /** Dismisses the "Bill #N generated" notice that blocks the page after issuing. */
  async acknowledgeGenerated(): Promise<void> {
    await this.page.getByRole('heading', { name: 'Success' }).waitFor();
    await this.page.getByRole('button', { name: 'OK', exact: true }).click();
  }

  /** Deletes an issued bill through its confirmation and waits for the history to refresh. */
  async remove(billId: number): Promise<void> {
    await this.page.getByRole('button', { name: /^Delete bill #\d+$/ }).click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Delete Bill' });
    await dialog.waitFor();
    const deleted = this.page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname.endsWith(`/bills/${billId}`),
    );
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await deleted;
    // "Bill #N deleted" arrives in the blocking Success notice.
    await this.page.getByRole('button', { name: 'OK', exact: true }).click();
  }

  /** Shown in place of the history table once every bill is gone. */
  get noBills(): Locator {
    return this.page.getByText('No bills generated yet');
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

/** /reports/dairy — the account statement of one dairy brand. */
export class DairyStatementPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/reports/dairy');
    await this.page.getByRole('heading', { name: 'Dairy Statement' }).waitFor();
  }

  async selectBrand(name: string): Promise<void> {
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  get balanceBadge(): Locator {
    return this.page.getByText(/^Balance: /);
  }

  /** The row of a day, labelled like "07 Nov". */
  dayRow(isoDate: string): Locator {
    const [, month, day] = isoDate.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return this.page.getByRole('row').filter({ hasText: `${day} ${names[Number(month) - 1]}` });
  }

  get totalRow(): Locator {
    return this.page.getByRole('row').filter({ hasText: /^Total/ });
  }
}

/** /reports/stock — stock received by product for a date range, optionally for one route. */
export class StockSummaryPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/reports/stock');
    await this.page.getByRole('heading', { name: 'Stock Summary' }).waitFor();
  }

  productRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async chooseRoute(label: string): Promise<void> {
    await this.page.getByRole('combobox').selectOption({ label });
  }
}

/** /salesman/profit-loss — cost, revenue and profit per salesperson, behind its own PIN. */
export class ProfitLossPage {
  constructor(private readonly page: Page) {}

  /** Opens the report and types the Profit & Loss PIN; resolves once the report itself is showing. */
  async open(pin: string): Promise<void> {
    await this.page.goto('/salesman/profit-loss');
    const boxes = this.page.locator('input[type="password"]');
    await boxes.first().click();
    await this.page.keyboard.type(pin);
    await this.page.getByRole('heading', { name: 'Profit & Loss', exact: true }).waitFor();
  }

  /** Opens one salesperson's product breakdown from the roster. */
  async select(name: string): Promise<void> {
    await this.page.getByPlaceholder('Search name or route…').fill(name);
    await this.page.getByRole('button', { name: new RegExp(name) }).click();
  }

  /** The product line in the selected salesperson's breakdown: cost, selling price, qty, total, profit. */
  productRow(productName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: productName });
  }

  /** The TOTAL footer of the breakdown. */
  get totalRow(): Locator {
    return this.page.getByRole('row').filter({ hasText: /^TOTAL/ });
  }
}

/** /reports/deposit — crate deposits held with a brand, by day, with a running total. */
export class DepositReportPage {
  constructor(private readonly page: Page) {}

  async open(brandName: string): Promise<void> {
    await this.page.goto('/reports/deposit');
    await this.page.getByRole('heading', { name: 'Deposit Report' }).waitFor();
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
  }

  get totalDeposit(): Locator {
    return this.page.getByText('Total Deposit', { exact: true }).locator('xpath=following-sibling::p[1]');
  }

  /** The "Delete" link on a manual deposit top-up row (superadmin only). */
  get deleteTopUp(): Locator {
    return this.page.getByRole('button', { name: 'Delete', exact: true });
  }

  async removeTopUp(): Promise<void> {
    // More than one day in view starts with every deposit day collapsed.
    const expand = this.page.getByRole('button', { name: 'Expand All' });
    if (await expand.isVisible()) await expand.click();
    await this.deleteTopUp.click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: 'Delete Deposit Top-up' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.page.getByRole('heading', { name: 'Success' }).waitFor();
    await this.page.getByRole('button', { name: 'OK', exact: true }).click();
  }
}

/** /reports/stock-balance — per brand, what was received against what each salesperson took, for one day. */
export class StockBalancePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/reports/stock-balance');
    await this.page.getByRole('heading', { name: 'Stock Balance' }).waitFor();
  }

  async selectBrand(name: string): Promise<void> {
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  /** A summary chip above the grid: "Supply", "Dispatched" or "Shortage" (received minus dispatched). */
  chip(label: 'Supply' | 'Dispatched' | 'Shortage'): Locator {
    return this.page.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
  }

  /** One salesperson's line in the grid. */
  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async previousDay(): Promise<void> {
    await this.page.getByRole('button', { name: 'Previous day' }).click();
  }

  /** Jumps to any day through the date box. */
  async setDate(isoDate: string): Promise<void> {
    await this.page.locator('input[type="date"]').first().fill(isoDate);
  }

  get noData(): Locator {
    return this.page.getByText('No dispatch data for this date');
  }
}
