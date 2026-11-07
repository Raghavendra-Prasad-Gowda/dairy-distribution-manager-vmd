import { type Locator, type Page, type Response } from '@playwright/test';

/** One brand's balance as returned by GET /dairy-balance (only the fields the dashboard shows). */
export type BrandBalance = {
  brandId: number;
  brandName: string;
  closingBalance: number;
};

export type PayableStatus = 'Outstanding' | 'Credit' | 'Cleared';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The rupee string the dashboard prints for an amount, e.g. 1234.5 -> "₹1,234.50". */
export const rupees = (amount: number): string => inr.format(amount);

/** A GET /dairy-balance response, optionally only the one for a given day. */
const isBalanceRequest = (r: Response, date?: string): boolean => {
  const url = new URL(r.url());
  return (
    r.request().method() === 'GET' &&
    url.pathname.endsWith('/dairy-balance') &&
    (date === undefined || url.searchParams.get('date') === date)
  );
};

/** / — the admin dashboard: quick-action tiles and one "Dairy Payables" card per brand. */
export class DashboardPage {
  readonly heading: Locator;
  readonly payablesLabel: Locator;
  readonly previousDay: Locator;
  readonly nextDay: Locator;
  readonly todayButton: Locator;
  readonly emptyState: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Dashboard', exact: true }).first();
    this.payablesLabel = page.getByText('Dairy Payables', { exact: true });
    this.previousDay = page.getByRole('button', { name: 'Previous day' });
    this.nextDay = page.getByRole('button', { name: 'Next day' });
    this.todayButton = page.getByRole('button', { name: 'Today', exact: true });
    this.emptyState = page.getByText('No dairy brands configured.');
  }

  /** Opens the dashboard and resolves with the balances the server returned for the opening date. */
  async open(): Promise<{ date: string; brands: BrandBalance[] }> {
    const loaded = this.page.waitForResponse(isBalanceRequest);
    await this.page.goto('/');
    await this.heading.waitFor();
    return this.readBalances(await loaded);
  }

  /**
   * Runs `action` and resolves with the balances for `date`. Waiting for that day specifically keeps a
   * late duplicate response for the previous day (e.g. a second request on first load) from being mistaken for it.
   */
  async afterRefetch(date: string, action: () => Promise<void>): Promise<{ date: string; brands: BrandBalance[] }> {
    const loaded = this.page.waitForResponse((r) => isBalanceRequest(r, date));
    await action();
    return this.readBalances(await loaded);
  }

  private async readBalances(res: Response): Promise<{ date: string; brands: BrandBalance[] }> {
    const date = new URL(res.url()).searchParams.get('date') ?? '';
    const body = await res.json();
    return { date, brands: body.data?.brands ?? [] };
  }

  /** Quick-action tile (a link) by its label: "Stock Receipt", "Collections", "Dairy Payments". */
  quickAction(label: string): Locator {
    return this.page.getByRole('main').getByRole('link', { name: label, exact: true });
  }

  /** A brand's payable card. Anchored on the brand name inside the `.ddm-card`. */
  card(brandName: string): Locator {
    return this.page
      .locator('.ddm-card')
      .filter({ has: this.page.getByText(brandName, { exact: true }) });
  }

  /** The status pill in a card's header. */
  status(brandName: string, status: PayableStatus): Locator {
    return this.card(brandName).getByText(status, { exact: true });
  }

  payNow(brandName: string): Locator {
    return this.card(brandName).getByRole('link', { name: /Pay Now/ });
  }

  /** The red "₹x total" badge next to the section label (only shown when something is owed). */
  totalBadge(): Locator {
    return this.page.getByText(/total$/);
  }
}
