import { expect, test } from '../../src/fixtures';
import { rupees } from '../../src/pages/DashboardPage';
import {
  SalesmanBalancePage,
  SalesmanNav,
  SalesmanStatementPage,
  SalesmanStockEntryPage,
  signInAsSalesman,
} from '../../src/pages/SalesmanPages';
import { Seed, todayIST } from '../../src/seed';

/**
 * The salesman's daily job on a phone: pick what they take, see what it costs, save, finalize. The price they see
 * is theirs, the entry locks when submitted, and their balance and statement follow. Each test has its own brand,
 * product and salesperson (with a login), so nothing depends on or disturbs real data.
 */
const world = async (seed: Seed, price = 15) => {
  const brand = await seed.brand();
  const product = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
  await seed.enableForSalespeople(product.id, price);
  await seed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
  const salesperson = await seed.salesperson(true);
  return { brand, product, salesperson, username: salesperson.username!, password: salesperson.password! };
};

test.describe('Salesman stock entry (phone)', () => {
  test('signing in opens the salesman home, and office screens are out of reach', async ({ page, superSeed }) => {
    const { salesperson, username, password } = await world(superSeed);
    const home = await signInAsSalesman(page, username, password);
    await expect(home.heading).toBeVisible();
    await expect(page.getByRole('banner').getByText(salesperson.name)).toBeVisible(); // identity bar

    for (const office of ['/dairy/payments', '/reports/salespeople', '/admin/users', '/salesman/dispatch-sheet']) {
      await page.goto(office);
      await expect(page).toHaveURL(/\/$/); // bounced back to the salesman's own home
      await expect(home.heading).toBeVisible();
    }
  });

  test('the bottom bar reaches Balance, Statement and Security', async ({ page, superSeed }) => {
    const { username, password } = await world(superSeed);
    await signInAsSalesman(page, username, password);
    const nav = new SalesmanNav(page);

    await nav.goTo('Balance');
    await expect(page).toHaveURL(/\/salesman\/balance$/);
    await nav.goTo('Statement');
    await expect(page).toHaveURL(/\/salesman\/my-statement$/);
    await nav.goTo('Security');
    await expect(page).toHaveURL(/\/salesman\/change-password$/);
    await nav.goTo('Stock');
    await expect(page).toHaveURL(/\/$/);
  });

  test('quantities are priced at the salesman\'s own rate and the draft survives a reload', async ({ page, superSeed }) => {
    const { product, salesperson, username, password } = await world(superSeed);
    await superSeed.salespersonPrice(salesperson.id, product.id, 18); // personal price beats the ₹15 default

    const entry = await signInAsSalesman(page, username, password);
    await entry.find(product.name);
    await expect(entry.product(product.name)).toContainText('₹18/unit');
    await entry.quantity(product.name).fill('4');
    await expect(entry.summary).toContainText(`4 units · ${rupees(72)}`); // 4 x ₹18

    await entry.saveDraft();
    await expect(entry.stockTaken).toHaveText(rupees(72));

    await page.reload();
    await entry.heading.waitFor();
    await entry.find(product.name);
    await expect(entry.quantity(product.name)).toHaveValue('4');
    await expect(entry.stockTaken).toHaveText(rupees(72));
  });

  test('only products enabled for the salesman are offered', async ({ page, superSeed }) => {
    const { brand, product, username, password } = await world(superSeed);
    const hidden = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 }); // not enabled for salespeople

    const entry = await signInAsSalesman(page, username, password);
    await entry.find(product.name);
    await expect(entry.product(product.name)).toBeVisible();
    await entry.find(hidden.name);
    await expect(page.getByText(hidden.name, { exact: true })).toHaveCount(0);
  });

  test('finalizing locks the entry, and the balance and statement show the bill', async ({ page, superSeed }) => {
    const { product, username, password } = await world(superSeed);
    const entry = await signInAsSalesman(page, username, password);
    await entry.find(product.name);
    await entry.quantity(product.name).fill('4'); // 4 x ₹15 = ₹60

    await entry.cancelFinalize(); // backing out changes nothing
    await expect(entry.quantity(product.name)).toBeEnabled();

    await entry.saveDraft();
    await entry.finalize();
    await expect(entry.lockedNotice).toBeVisible();
    await expect(entry.quantity(product.name)).toBeDisabled();

    await page.reload();
    await entry.heading.waitFor();
    await entry.find(product.name);
    await expect(entry.quantity(product.name)).toBeDisabled(); // still locked after a reload
    await expect(entry.quantity(product.name)).toHaveValue('4');

    const balance = new SalesmanBalancePage(page);
    await balance.open();
    await expect(balance.billToday).toHaveText(rupees(60));
    await expect(balance.balance).toHaveText(rupees(60));

    const statement = new SalesmanStatementPage(page);
    await statement.open();
    await expect(statement.billed).toHaveText(rupees(60));
    await expect(statement.paid).toHaveText(rupees(0));
    await expect(statement.owed).toHaveText(rupees(60));
  });
});
