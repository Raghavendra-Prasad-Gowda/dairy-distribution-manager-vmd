import { expect, test } from '../../src/fixtures';
import { rupees } from '../../src/pages/DashboardPage';
import { signInAsSalesman } from '../../src/pages/SalesmanPages';
import { todayIST } from '../../src/seed';

/**
 * The phone controls a salesman uses all day: + and − steppers, Enter jumping to the next product, searching a long
 * catalogue and folding it away. Mistakes here (going below zero, a lost quantity) turn into wrong bills.
 */
test.describe('Salesman stock entry controls (phone)', () => {
  const world = async (seed: import('../../src/seed').Seed) => {
    const brand = await seed.brand();
    const first = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    const second = await seed.product(brand.id, { costPrice: 10, sellingPrice: 12 });
    await seed.enableForSalespeople(first.id, 15);
    await seed.enableForSalespeople(second.id, 20);
    await seed.stockReceipt(brand.id, todayIST(), [
      { productId: first.id, quantity: 100, unitPrice: 10 },
      { productId: second.id, quantity: 100, unitPrice: 10 },
    ]);
    const salesperson = await seed.salesperson(true);
    return { brand, first, second, username: salesperson.username!, password: salesperson.password! };
  };

  test('+ and − change the quantity one at a time and stop at zero', async ({ page, superSeed }) => {
    const { brand, first, username, password } = await world(superSeed);
    const entry = await signInAsSalesman(page, username, password);
    await entry.find(brand.name);

    await expect(entry.minus(first.name)).toBeDisabled(); // nothing to take off yet
    await entry.plus(first.name).click();
    await entry.plus(first.name).click();
    await entry.plus(first.name).click();
    await expect(entry.quantity(first.name)).toHaveValue('3');
    await expect(entry.summary).toContainText(`3 units · ${rupees(45)}`); // 3 x ₹15

    await entry.minus(first.name).click();
    await expect(entry.quantity(first.name)).toHaveValue('2');
    await entry.minus(first.name).click();
    await entry.minus(first.name).click();
    await expect(entry.quantity(first.name)).toHaveValue(''); // cleared, not "0"
    await expect(entry.minus(first.name)).toBeDisabled();
  });

  test('Enter in a quantity box moves to the next product', async ({ page, superSeed }) => {
    const { brand, first, second, username, password } = await world(superSeed);
    const entry = await signInAsSalesman(page, username, password);
    await entry.find(brand.name);

    await entry.quantity(first.name).fill('2');
    await page.keyboard.press('Enter');
    await expect(entry.quantity(second.name)).toBeFocused();
    await page.keyboard.type('5');
    await expect(entry.summary).toContainText(`7 units · ${rupees(2 * 15 + 5 * 20)}`);
  });

  test('searching narrows the list, an unmatched search says so, and folding the catalogue hides it', async ({
    page,
    superSeed,
  }) => {
    const { brand, first, second, username, password } = await world(superSeed);
    const entry = await signInAsSalesman(page, username, password);

    await entry.find(first.name);
    await expect(entry.product(first.name)).toBeVisible();
    await expect(entry.product(second.name)).toHaveCount(0);

    await entry.search.fill('no-such-product-anywhere');
    await expect(entry.noMatch).toBeVisible();

    await entry.clearSearch();
    await entry.search.fill(brand.name);
    await entry.expandAll();
    await expect(entry.product(first.name)).toBeVisible();
    await expect(entry.product(second.name)).toBeVisible();

    await entry.collapseAll();
    await expect(entry.product(first.name)).toHaveCount(0);
    await entry.expandAll();
    await expect(entry.product(first.name)).toBeVisible();
  });
});
