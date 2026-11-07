import { expect, test } from '../src/fixtures';
import { PricingPage } from '../src/pages/PricingPage';
import { newPhone, newSuperadminIpad, signInAsSalesman } from '../src/pages/SalesmanPages';
import { todayIST } from '../src/seed';

/**
 * A product switched off for everyone can still be granted to one salesperson (and priced for them) by a superadmin
 * through the Exception Manager. The phone must follow: offered at the exception price once granted, gone again once
 * the exception is removed.
 */
test.describe('Exception Manager (superadmin)', () => {
  test('grants a globally-off product to one salesperson at their own price, then removes it again', async ({
    browser,
    superSeed,
  }) => {
    const brand = await superSeed.brand();
    const product = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 }); // off for salespeople by default
    // A product that IS on for everyone, so the phone has a catalogue to search either way.
    const control = await superSeed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await superSeed.enableForSalespeople(control.id, 15);
    await superSeed.stockReceipt(brand.id, todayIST(), [
      { productId: product.id, quantity: 100, unitPrice: 10 },
      { productId: control.id, quantity: 100, unitPrice: 10 },
    ]);
    const salesperson = await superSeed.salesperson(true);

    const phone = await newPhone(browser);
    const ipad = await newSuperadminIpad(browser);
    try {
      const entry = await signInAsSalesman(phone, salesperson.username!, salesperson.password!);
      await entry.find(brand.name);
      await expect(entry.product(control.name)).toBeVisible();
      await expect(entry.product(product.name)).toHaveCount(0); // off for everyone, so not offered

      const pricing = new PricingPage(ipad);
      await pricing.open();
      await pricing.openExceptionManager();
      await pricing.chooseException(product.name, salesperson.name, 18);
      await pricing.applyException('Enable', /Enabled 1 product\(s\) for 1 salesperson\(s\) with 1 price\(s\) set/);

      await entry.open();
      await entry.find(product.name);
      await expect(entry.product(product.name)).toContainText('₹18/unit');

      await pricing.openExceptionManager();
      await pricing.chooseRemoveException();
      await pricing.chooseException(product.name, salesperson.name);
      await pricing.applyException('Disable', /Disabled 1 product\(s\) for 1 salesperson\(s\)/);

      await entry.open();
      await entry.find(product.name);
      await expect(entry.product(product.name)).toHaveCount(0);
    } finally {
      await phone.context().close();
      await ipad.context().close();
    }
  });
});
