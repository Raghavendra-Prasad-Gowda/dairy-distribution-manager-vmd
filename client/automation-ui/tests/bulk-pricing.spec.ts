import { expect, test } from '../src/fixtures';
import { rupees } from '../src/pages/DashboardPage';
import { PricingPage } from '../src/pages/PricingPage';
import { newPhone, signInAsSalesman } from '../src/pages/SalesmanPages';
import { Seed, todayIST } from '../src/seed';

/**
 * Prices and product access are changed for many salespeople at once. Each bulk tool is proven by what the
 * salesperson ends up seeing: the per-person price list, and the phone's catalogue.
 */
const world = async (seed: Seed) => {
  const brand = await seed.brand();
  const product = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
  await seed.enableForSalespeople(product.id, 15);
  await seed.stockReceipt(brand.id, todayIST(), [{ productId: product.id, quantity: 100, unitPrice: 10 }]);
  return { brand, product };
};

test.describe('Bulk pricing tools', () => {
  test('Bulk Update Prices sets one price for the chosen salesperson only', async ({ page, superSeed }) => {
    const { brand, product } = await world(superSeed);
    const chosen = await superSeed.salesperson();
    const other = await superSeed.salesperson();

    const pricing = new PricingPage(page);
    await pricing.open();
    await pricing.openGlobal(brand.name);
    await pricing.bulkUpdatePrice(product.name, 21, chosen.name);

    await pricing.selectSalesperson(chosen.name);
    await pricing.find(product.name, brand.name);
    await expect(pricing.row(product.name)).toContainText(rupees(21));

    await pricing.selectSalesperson(other.name);
    await pricing.find(product.name, brand.name);
    await expect(pricing.row(product.name)).toContainText(rupees(15)); // untouched: still the default
  });

  test('Copy Prices gives one salesperson another\'s prices for the brand', async ({ page, superSeed }) => {
    const { brand, product } = await world(superSeed);
    const source = await superSeed.salesperson();
    const target = await superSeed.salesperson();
    await superSeed.salespersonPrice(source.id, product.id, 18);

    const pricing = new PricingPage(page);
    await pricing.open();
    await pricing.selectSalesperson(target.name);
    await pricing.find(product.name, brand.name);
    await expect(pricing.row(product.name)).toContainText(rupees(15));

    await pricing.copyPricesFrom(source.name);
    await pricing.find(product.name, brand.name);
    await expect(pricing.row(product.name)).toContainText(rupees(18));
  });

  test('Bulk Product Access takes a product off one salesperson\'s phone and puts it back', async ({
    page,
    browser,
    superSeed,
  }) => {
    const { brand, product } = await world(superSeed);
    const control = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(control.id, 15);
    const salesperson = await superSeed.salesperson(true);

    const phone = await newPhone(browser);
    try {
      const entry = await signInAsSalesman(phone, salesperson.username!, salesperson.password!);
      await entry.find(brand.name);
      await expect(entry.product(product.name)).toBeVisible();

      const pricing = new PricingPage(page);
      await pricing.open();
      await pricing.openGlobal(brand.name);
      await pricing.bulkProductAccess(product.name, salesperson.name, 'disable');

      await entry.open();
      await entry.find(brand.name);
      await expect(entry.product(control.name)).toBeVisible();
      await expect(entry.product(product.name)).toHaveCount(0);

      await pricing.bulkProductAccess(product.name, salesperson.name, 'enable');
      await entry.open();
      await entry.find(brand.name);
      await expect(entry.product(product.name)).toBeVisible();
    } finally {
      await phone.context().close();
    }
  });
});
