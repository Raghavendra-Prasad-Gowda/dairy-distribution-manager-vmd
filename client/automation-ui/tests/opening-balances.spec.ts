import { env } from '../src/env';
import { expect, test } from '../src/fixtures';
import { CollectionsPage } from '../src/pages/CollectionsPage';
import { DairyPaymentsPage } from '../src/pages/DairyPaymentsPage';
import { DashboardPage, rupees } from '../src/pages/DashboardPage';
import { LoginPage } from '../src/pages/LoginPage';
import { OutstandingPage, StatementsPage } from '../src/pages/ReportsPages';
import { newIpad } from '../src/pages/SalesmanPages';
import { TopUpDialog } from '../src/pages/TopUpDialog';
import { todayIST } from '../src/seed';

/**
 * Money that existed before the app (old dues) is loaded as a top-up. A top-up is NOT a payment: it ADDS to what is
 * owed, and must show up on every screen that reports a balance. Both ledgers are covered: a salesperson's dues
 * (admin) and what the dairy owes a brand (superadmin only).
 */
test.describe('Opening balances (top-ups)', () => {
  test('a salesperson top-up adds to what they owe on collections, outstanding and the statement', async ({
    page,
    superSeed,
  }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
    const salesperson = await superSeed.salesperson();
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true); // ₹60

    const collections = new CollectionsPage(page);
    await collections.open();
    await collections.select(salesperson.name);
    await expect(collections.account).toContainText(rupees(60));

    const topUp = new TopUpDialog(page, /\/salesperson-payments\/bulk-topup$/);
    await topUp.open();
    await topUp.pick(salesperson.name);
    await topUp.addAmount(200);

    // 60 dispatched + 200 old dues: the top-up raises the balance, it does not lower it.
    await expect(collections.historyRow('Top-up')).toContainText(rupees(200));
    await expect(collections.account).toContainText(rupees(260));

    const outstanding = new OutstandingPage(page);
    await outstanding.open();
    await expect(outstanding.card(salesperson.name)).toContainText(rupees(260));

    const statements = new StatementsPage(page);
    await statements.open();
    await statements.select(salesperson.name);
    await expect(statements.outstandingBadge).toHaveText(`Outstanding: ${rupees(260)}`);
  });

  test('a dairy top-up adds to what we owe the brand (superadmin)', async ({ browser, superSeed }) => {
    const brand = await superSeed.brand();
    const ipad = await newIpad(browser);
    try {
      const login = new LoginPage(ipad);
      await login.open();
      await login.signIn(env.superadminUsername, env.superadminPassword);
      await expect(ipad.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();

      const payments = new DairyPaymentsPage(ipad);
      await payments.open(brand.id);
      await expect(payments.youOwe).toHaveText(rupees(0));

      const topUp = new TopUpDialog(ipad, /\/dairy-payments\/bulk-topup$/);
      await topUp.open();
      await topUp.pick(brand.name);
      await topUp.addAmount(500);

      await expect(payments.youOwe).toHaveText(rupees(500));
      await expect(payments.statusPill).toHaveText('Outstanding');
      await ipad.reload();
      await expect(payments.youOwe).toHaveText(rupees(500));

      const dashboard = new DashboardPage(ipad);
      await dashboard.open();
      await expect(dashboard.card(brand.name)).toContainText(rupees(500));
    } finally {
      await ipad.context().close();
    }
  });

  test('the Bulk Top-up on dairy payments is for superadmins only', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    const role = await (async () => {
      await page.goto('/');
      return page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem('user') ?? '{}').role as string | undefined;
        } catch {
          return undefined;
        }
      });
    })();
    test.skip(role === 'superadmin', 'the shared session is a superadmin; the refusal is only visible to a plain admin');

    await new DairyPaymentsPage(page).open(brand.id);
    await expect(page.getByRole('button', { name: 'Bulk Top-up', exact: true })).toHaveCount(0);
  });
});
