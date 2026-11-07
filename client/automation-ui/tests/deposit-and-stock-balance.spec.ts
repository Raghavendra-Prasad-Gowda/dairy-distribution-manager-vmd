import { expect, test } from '../src/fixtures';
import { DairyPaymentsPage } from '../src/pages/DairyPaymentsPage';
import { rupees } from '../src/pages/DashboardPage';
import { DepositReportPage, StockBalancePage } from '../src/pages/ReportsPages';
import { newSuperadminIpad } from '../src/pages/SalesmanPages';
import { TopUpDialog } from '../src/pages/TopUpDialog';
import { todayIST } from '../src/seed';

/**
 * Deposits are refundable crate money held with a brand: they follow stock received (litres x rate) and are kept
 * apart from what is owed for stock. The stock balance shows received against dispatched, per salesperson.
 */
test.describe('Deposit report', () => {
  test('stock in crates earns a deposit, and a deposit top-up adds to it without touching the stock balance', async ({
    browser,
    superSeed,
  }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.depositProduct(brand.id, 4); // ₹4 per litre
    // Report opens on yesterday. 10 bottles x 0.5 L x ₹4 = ₹20 deposit; stock itself is 10 x ₹10 = ₹100.
    await superSeed.stockReceipt(brand.id, todayIST(-1), [{ productId: product.id, quantity: 10, unitPrice: 10 }]);

    const ipad = await newSuperadminIpad(browser);
    try {
      const report = new DepositReportPage(ipad);
      await report.open(brand.name);
      await expect(report.totalDeposit).toHaveText(rupees(20));

      const topUp = TopUpDialog.forDeposit(ipad);
      await topUp.open();
      await topUp.pick(brand.name);
      await topUp.addAmount(300);
      await expect(report.totalDeposit).toHaveText(rupees(320)); // 20 earned + 300 loaded

      await ipad.reload();
      await report.open(brand.name);
      await expect(report.totalDeposit).toHaveText(rupees(20)); // back on yesterday only; the top-up is dated today

      // The top-up never reaches the dairy ledger: what we owe is still just the stock.
      await new DairyPaymentsPage(ipad).open(brand.id);
      await expect(new DairyPaymentsPage(ipad).youOwe).toHaveText(rupees(100));
    } finally {
      await ipad.context().close();
    }
  });

  test('a deposit top-up can be deleted again, restoring the total', async ({ browser, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.depositProduct(brand.id, 4);
    await superSeed.stockReceipt(brand.id, todayIST(-1), [{ productId: product.id, quantity: 10, unitPrice: 10 }]);

    const ipad = await newSuperadminIpad(browser);
    try {
      const report = new DepositReportPage(ipad);
      await report.open(brand.name);
      const topUp = TopUpDialog.forDeposit(ipad);
      await topUp.open();
      await topUp.pick(brand.name);
      await topUp.addAmount(300);
      await expect(report.totalDeposit).toHaveText(rupees(320));

      await report.removeTopUp();
      await expect(report.totalDeposit).toHaveText(rupees(20));
    } finally {
      await ipad.context().close();
    }
  });
});

test.describe('Stock balance', () => {
  test('shows what was received, what each salesperson took and what is left', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
    const salesperson = await superSeed.salesperson();
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);

    const balance = new StockBalancePage(page);
    await balance.open();
    await balance.selectBrand(brand.name);

    await expect(balance.chip('Supply')).toHaveText('100');
    await expect(balance.chip('Dispatched')).toHaveText('4');
    await expect(balance.chip('Shortage')).toHaveText('96'); // received minus dispatched
    await expect(balance.row(salesperson.name)).toContainText('4');
    await expect(page.getByRole('columnheader', { name: product.name })).toBeVisible();
  });

  test('a day with nothing dispatched says so', async ({ page }) => {
    const balance = new StockBalancePage(page);
    await balance.open();
    await balance.setDate('2000-01-01'); // long before the first dispatch
    await expect(balance.noData).toBeVisible();
  });
});
