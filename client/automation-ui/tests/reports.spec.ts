import { expect, test } from '../src/fixtures';
import { rupees } from '../src/pages/DashboardPage';
import { DairyStatementPage, ProfitLossPage, StockSummaryPage } from '../src/pages/ReportsPages';
import { Seed, todayIST } from '../src/seed';

/**
 * Reports are what the owner reads to decide, so their figures must equal what was entered. A brand with known stock
 * (10 pieces at ₹10 on a route) and one ₹30 payment is built through the API and each report is read in the browser.
 */
const world = async (seed: Seed) => {
  const brand = await seed.brand();
  const route = await seed.route(brand.id);
  const product = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
  await seed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 10, unitPrice: 10 }], route.id);
  await seed.dairyPayment(brand.id, 30, todayIST());
  return { brand, route, product };
};

test.describe('Reports', () => {
  test('the dairy statement shows the day\'s bill, payment and closing balance', async ({ page, superSeed }) => {
    const { brand } = await world(superSeed);
    const statement = new DairyStatementPage(page);
    await statement.open();
    await statement.selectBrand(brand.name);

    await expect(statement.balanceBadge).toHaveText(`Balance: ${rupees(70)}`);
    const day = statement.dayRow(todayIST());
    await expect(day).toContainText(rupees(100)); // bill: 10 x ₹10
    await expect(day).toContainText(rupees(30)); // paid
    await expect(day).toContainText(rupees(70)); // closing
    await expect(statement.totalRow).toContainText(rupees(100));
    await expect(statement.totalRow).toContainText(rupees(30));
  });

  test('the stock summary lists the product received, narrowed by route', async ({ page, superSeed }) => {
    const { route, product } = await world(superSeed);
    const summary = new StockSummaryPage(page);
    await summary.open();

    await expect(summary.productRow(product.name).first()).toContainText('10');
    await expect(summary.productRow(product.name).first()).toContainText(rupees(100));

    await summary.chooseRoute(route.routeNumber);
    await expect(summary.productRow(product.name).first()).toContainText(rupees(100));
    await summary.chooseRoute('All Routes');
    await expect(summary.productRow(product.name).first()).toBeVisible();
  });

  test('profit & loss shows cost, revenue and profit for what a salesperson took (behind the P&L PIN)', async ({
    page,
    superSeed,
    plPin,
  }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(product.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
    const salesperson = await superSeed.salesperson();
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);

    const report = new ProfitLossPage(page);
    await report.open(plPin);
    await report.select(salesperson.name);

    const line = report.productRow(product.name);
    await expect(line).toContainText(rupees(10)); // cost price
    await expect(line).toContainText(rupees(15)); // the rate the salesperson was charged
    await expect(line).toContainText('4'); // quantity
    await expect(line).toContainText(rupees(60)); // revenue: 4 x 15
    await expect(line).toContainText(rupees(20)); // profit: 60 - 4 x 10
    await expect(report.totalRow).toContainText(rupees(60));
    await expect(report.totalRow).toContainText(rupees(20));
  });
});
