import { expect, test } from '../src/fixtures';
import { rupees } from '../src/pages/DashboardPage';
import { PricingPage } from '../src/pages/PricingPage';
import { BillsPanel, StatementsPage } from '../src/pages/ReportsPages';
import { newPhone, SalesmanStockEntryPage, signInAsSalesman } from '../src/pages/SalesmanPages';
import { Seed, todayIST } from '../src/seed';

/**
 * Prices decide what salespeople are charged, and bills are the paper that goes to the customer, so both must
 * match what the system holds. A price set by an admin must be what the salesman sees on his phone, and a bill must
 * list exactly what was dispatched at the rates charged.
 */
const world = async (seed: Seed, withLogin = false) => {
  const brand = await seed.brand();
  const product = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
  await seed.enableForSalespeople(product.id, 15);
  await seed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
  const salesperson = await seed.salesperson(withLogin);
  return { brand, product, salesperson };
};

test.describe('Pricing and bills', () => {
  test('a price set for a salesperson is saved and is the price that salesperson sees on the phone', async ({
    page,
    browser,
    superSeed,
  }) => {
    const { brand, product, salesperson } = await world(superSeed, true);
    const pricing = new PricingPage(page);
    await pricing.open();
    await pricing.selectSalesperson(salesperson.name);
    await pricing.find(product.name, brand.name);
    await expect(pricing.row(product.name)).toContainText(rupees(15)); // the default until a personal price is set

    await pricing.setPrice(product.name, 18);
    await pricing.acknowledgeNotice(/price|saved|updated/i);

    await page.reload();
    await pricing.selectSalesperson(salesperson.name);
    await pricing.find(product.name, brand.name);
    await expect(pricing.row(product.name)).toContainText(rupees(18));

    const phone = await newPhone(browser);
    const entry: SalesmanStockEntryPage = await signInAsSalesman(phone, salesperson.username!, salesperson.password!);
    await entry.find(product.name);
    await expect(entry.product(product.name)).toContainText('₹18/unit');
    await phone.context().close();
  });

  test('a bill lists what was dispatched at the rates charged, can be issued and is removed again', async ({
    page,
    superSeed,
  }) => {
    const { product, salesperson } = await world(superSeed);
    await superSeed.dispatch(salesperson.id, todayIST(), [{ productId: product.id, quantity: 4, unitPrice: 15 }], true);

    const statements = new StatementsPage(page);
    await statements.open();
    await statements.select(salesperson.name);

    const bills = new BillsPanel(page);
    await bills.open();
    await expect(bills.previewLine(product.name)).toContainText('4');
    await expect(bills.previewLine(product.name)).toContainText('15');
    await expect(bills.previewLine(product.name)).toContainText(rupees(60));
    await expect(bills.previewTotal).toContainText(rupees(60));

    const created = await bills.generate();
    expect(created.status()).toBe(201);
    const billId = (await created.json()).data.id as number;
    await expect(bills.issued(1, salesperson.name)).toBeVisible();

    // Deleting is part of the journey: the bill leaves the history and its number is not reused.
    await bills.remove(billId);
    await expect(bills.noBills).toBeVisible();
    const gone = await superSeed.call('admin', 'delete', `/bills/${billId}`); // safety net if the UI delete failed
    expect([200, 404]).toContain(gone.status());
  });
});
