import { expect, test } from '../src/fixtures';
import { LayoutSettingsPage } from '../src/pages/LayoutSettingsPage';
import { StockReceiptPage } from '../src/pages/StockReceiptPage';

/**
 * The order categories are laid out in decides where products appear on stock entry, reports and bills. Moving a
 * category must save, survive a reload, and show up on the screen staff actually use.
 */
test.describe('Layout settings', () => {
  test('moving a category up is saved and is the order stock is listed in', async ({ page, superSeed }) => {
    const brand = await superSeed.brand();
    await superSeed.route(brand.id); // the stock grid needs a route to list products
    const first = await superSeed.category(brand.id);
    const second = await superSeed.category(brand.id);
    await superSeed.product(brand.id, { category: first.name });
    await superSeed.product(brand.id, { category: second.name });

    const layout = new LayoutSettingsPage(page);
    await layout.open(brand.name);
    expect(await layout.categoryOrder()).toEqual([first.name, second.name]);

    await layout.moveUp(second.name);
    expect(await layout.categoryOrder()).toEqual([second.name, first.name]);
    await layout.save();

    await layout.open(brand.name);
    expect(await layout.categoryOrder()).toEqual([second.name, first.name]); // survived a reload

    const stock = new StockReceiptPage(page, brand.name);
    await stock.open();
    expect(await stock.categoryOrder([first.name, second.name])).toEqual([second.name, first.name]);
  });
});
