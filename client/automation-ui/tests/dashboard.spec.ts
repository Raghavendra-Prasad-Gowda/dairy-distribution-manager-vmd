import { expect, test } from '../src/fixtures';
import { DashboardPage, rupees, type PayableStatus } from '../src/pages/DashboardPage';

/**
 * Real end-to-end read of the dashboard: the cards are checked against what the deployed API
 * returned for the same request, so the spec holds whatever balances the environment has.
 * Read-only - nothing is created, so nothing needs cleanup.
 */
const statusOf = (closing: number): PayableStatus =>
  closing > 0 ? 'Outstanding' : closing < 0 ? 'Credit' : 'Cleared';

/** Calendar arithmetic on a YYYY-MM-DD string, independent of the machine's timezone. */
const shiftDay = (date: string, days: number): string => {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

test.describe('Dashboard', () => {
  test('quick actions open Stock Receipt, Collections and Dairy Payments', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const targets: Array<[label: string, path: RegExp]> = [
      ['Stock Receipt', /\/dairy\/stock\/nandini$/],
      ['Collections', /\/salesman\/payments$/],
      ['Dairy Payments', /\/dairy\/payments$/],
    ];

    for (const [label, path] of targets) {
      await dashboard.open();
      await dashboard.quickAction(label).click();
      await expect(page).toHaveURL(path);
    }
  });

  test('shows one payable card per brand, with the status the server balance implies', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const { brands } = await dashboard.open();

    await expect(dashboard.payablesLabel).toBeVisible();
    if (brands.length === 0) {
      await expect(dashboard.emptyState).toBeVisible();
      return;
    }

    for (const brand of brands) {
      const closing = Number(brand.closingBalance);
      const status = statusOf(closing);
      await expect(dashboard.card(brand.brandName)).toHaveCount(1);
      await expect(dashboard.status(brand.brandName, status)).toBeVisible();

      if (status === 'Outstanding') {
        // "You Owe" amount and a Pay Now link that opens payments for this brand.
        await expect(dashboard.card(brand.brandName)).toContainText(rupees(closing));
        await expect(dashboard.payNow(brand.brandName)).toHaveAttribute(
          'href',
          `/dairy/payments?brandId=${brand.brandId}`,
        );
      } else {
        await expect(dashboard.payNow(brand.brandName)).toHaveCount(0);
        if (status === 'Credit') {
          // Credit shows the absolute amount.
          await expect(dashboard.card(brand.brandName)).toContainText(rupees(Math.abs(closing)));
        }
      }
    }
  });

  test('the total badge sums only the brands that are owed', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const { brands } = await dashboard.open();
    await expect(dashboard.payablesLabel).toBeVisible();

    const owed = brands.reduce((sum, b) => sum + Math.max(0, Number(b.closingBalance)), 0);
    if (owed > 0) {
      await expect(dashboard.totalBadge()).toHaveText(`${rupees(Math.round(owed * 100) / 100)} total`);
    } else {
      await expect(dashboard.totalBadge()).toHaveCount(0);
    }
  });

  test('changing the day reloads the balances for that day, and Today returns', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const { date: today } = await dashboard.open();
    await expect(dashboard.todayButton).toHaveCount(0); // already on today

    const yesterday = await dashboard.afterRefetch(shiftDay(today, -1), () => dashboard.previousDay.click());
    expect(yesterday.date).toBe(shiftDay(today, -1));
    await expect(dashboard.todayButton).toBeVisible();
    await expect(dashboard.payablesLabel).toBeVisible();

    const back = await dashboard.afterRefetch(today, () => dashboard.todayButton.click());
    expect(back.date).toBe(today);
    await expect(dashboard.todayButton).toHaveCount(0);
  });
});
