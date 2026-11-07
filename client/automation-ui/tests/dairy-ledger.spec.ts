import { expect, test } from '../src/fixtures';
import { DashboardPage, rupees } from '../src/pages/DashboardPage';
import { DairyPaymentsPage } from '../src/pages/DairyPaymentsPage';
import { StockReceiptPage } from '../src/pages/StockReceiptPage';
import { Seed, todayIST } from '../src/seed';

/**
 * The dairy account is the money path: stock received raises what we owe, payments lower it, and the dashboard,
 * payments page and stock page must all agree. Each test gets its own throwaway brand (so real ledgers are never
 * touched), a route and a product costing ₹10, and the browser drives the screens that real staff use.
 */
const world = async (seed: Seed) => {
  const brand = await seed.brand();
  const route = await seed.route(brand.id);
  const category = await seed.category(brand.id);
  const product = await seed.product(brand.id, { category: category.name, costPrice: 10, sellingPrice: 12 });
  return { brand, route, product };
};

test.describe('Dairy ledger', () => {
  test('stock received raises what we owe, survives a reload and shows on the dashboard', async ({ page, superSeed }) => {
    const { brand, route, product } = await world(superSeed);

    const stock = new StockReceiptPage(page, brand.name);
    await stock.open();
    await expect(stock.youOwe).toHaveText(rupees(0));

    await stock.fill(product.name, 5); // 5 x ₹10
    await expect(stock.routeTotal(route.routeNumber)).toContainText(rupees(50));
    await stock.save(route.routeNumber);
    await expect(stock.todaysAmount).toHaveText(rupees(50));
    await expect(stock.youOwe).toHaveText(rupees(50));

    await page.reload();
    await expect(stock.quantity(product.name)).toHaveValue('5');
    await expect(stock.youOwe).toHaveText(rupees(50));

    const dashboard = new DashboardPage(page);
    await dashboard.open();
    await expect(dashboard.status(brand.name, 'Outstanding')).toBeVisible();
    await expect(dashboard.card(brand.name)).toContainText(rupees(50));
    await expect(dashboard.payNow(brand.name)).toHaveAttribute('href', `/dairy/payments?brandId=${brand.id}`);
  });

  test('changing a saved quantity re-prices the bill', async ({ page, superSeed }) => {
    const { brand, route, product } = await world(superSeed);
    await superSeed.stockReceipt(brand.id, todayIST(), [
      { productId: product.id, quantity: 5, unitPrice: 10 },
    ], route.id);

    const stock = new StockReceiptPage(page, brand.name);
    await stock.open();
    await expect(stock.youOwe).toHaveText(rupees(50));

    await stock.fill(product.name, 8);
    await stock.save(route.routeNumber);
    await expect(stock.youOwe).toHaveText(rupees(80));

    await stock.fill(product.name, 0);
    await expect(stock.routeTotal(route.routeNumber)).toBeVisible();
  });

  test('a payment lowers the balance everywhere, and deleting it restores the balance', async ({ page, superSeed, editPin }) => {
    const { brand, route, product } = await world(superSeed);
    const today = todayIST();
    await superSeed.stockReceipt(brand.id, today, [{ productId: product.id, quantity: 10, unitPrice: 10 }], route.id); // owe ₹100

    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);
    await expect(payments.youOwe).toHaveText(rupees(100));
    await expect(payments.statusPill).toHaveText('Outstanding');

    await payments.record(40, 'UPI', 'E2E-REF-1');
    const row = payments.historyRow('E2E-REF-1');
    await expect(row).toContainText(rupees(40));
    await expect(row).toContainText('UPI');
    await expect(payments.youOwe).toHaveText(rupees(60));

    await page.reload();
    await expect(payments.youOwe).toHaveText(rupees(60));

    const dashboard = new DashboardPage(page);
    await dashboard.open();
    await expect(dashboard.card(brand.name)).toContainText(rupees(60));

    await payments.open(brand.id);
    await payments.delete(payments.historyRow('E2E-REF-1'), editPin);
    await expect(payments.historyRow('E2E-REF-1')).toHaveCount(0);
    await expect(payments.youOwe).toHaveText(rupees(100));
  });

  test('paying the full balance clears it, and overpaying shows a credit', async ({ page, superSeed }) => {
    const { brand, route, product } = await world(superSeed);
    const today = todayIST();
    await superSeed.stockReceipt(brand.id, today, [{ productId: product.id, quantity: 10, unitPrice: 10 }], route.id);

    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);

    await payments.record(100, 'Cash');
    await expect(payments.balanceLabel).toHaveText('Settled');
    await expect(payments.statusPill).toHaveText('Cleared');

    await payments.record(25, 'Cash');
    await expect(payments.balanceLabel).toHaveText("You're in Credit");
    await expect(payments.youOwe).toHaveText(rupees(25));
    await expect(payments.statusPill).toHaveText('Credit');

    const dashboard = new DashboardPage(page);
    await dashboard.open();
    await expect(dashboard.status(brand.name, 'Credit')).toBeVisible();
    await expect(dashboard.payNow(brand.name)).toHaveCount(0);
  });

  test('a payment needs an amount of at least one paisa', async ({ page, superSeed }) => {
    const { brand } = await world(superSeed);
    const payments = new DairyPaymentsPage(page);
    await payments.open(brand.id);

    await expect(payments.recordButton).toBeDisabled(); // nothing typed yet
    await payments.amount.fill('15');
    await expect(payments.recordButton).toBeEnabled();

    await payments.amount.fill('0');
    await payments.recordButton.click();
    expect(await payments.amountIsInvalid()).toBe(true); // the browser refuses to submit it
    await expect(payments.historyRow(/₹/)).toHaveCount(0); // nothing was recorded
  });
});
