import { expect, test } from '../src/fixtures';
import { CategorySetupPage } from '../src/pages/CategorySetupPage';
import { rupees } from '../src/pages/DashboardPage';
import { ProductsSetupPage } from '../src/pages/ProductsSetupPage';
import { RouteSetupPage } from '../src/pages/RouteSetupPage';
import { unique } from '../src/seed';

/**
 * The catalogue (categories, routes, products) feeds every other screen: stock receipt columns, dispatch lists,
 * prices. These journeys prove an admin can build and maintain it and that changes are really saved, using
 * "E2E-..." records in Nandini that are removed afterwards (admin account only).
 */
test.describe('Catalogue setup', () => {
  test('categories: add (trimmed), reject a duplicate, edit, search, and delete with its warning', async ({
    page,
    trackCreated,
  }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const name = unique();
    const created = await categories.add(`   ${name}   `);
    expect(created.status()).toBe(201);
    expect((await created.json()).data.name).toBe(name); // trimmed
    trackCreated(created.url(), (await created.json()).data.id);
    await categories.acknowledgeNotice('Category added');
    await expect(categories.row(name)).toBeVisible();

    const duplicate = await categories.add(name);
    expect(duplicate.status()).toBe(400);
    expect((await duplicate.json()).code).toBe('DUPLICATE');
    await categories.acknowledgeNotice(/already exists/i);
    await categories.cancelForm();

    const renamed = `${name}-R`;
    await categories.edit(name, renamed);
    await categories.acknowledgeNotice('Category updated');
    await categories.reload();
    await expect(categories.row(renamed)).toBeVisible();
    await expect(categories.row(name)).toHaveCount(0);

    await categories.search.fill(renamed.toLowerCase());
    await expect(categories.row(renamed)).toBeVisible();
    await categories.search.fill(`no-such-${Date.now()}`);
    await expect(categories.emptySearchMessage).toBeVisible();
    await categories.search.clear();

    await categories.askToDelete(renamed);
    await expect(categories.dialog).toContainText('Products using this category will become uncategorised.');
    await categories.cancelDialog();
    await expect(categories.row(renamed)).toBeVisible(); // Cancel kept it

    await categories.delete(renamed);
    await categories.acknowledgeNotice('Category deleted');
    await categories.reload();
    await expect(categories.row(renamed)).toHaveCount(0);
  });

  test('routes: add, reject a duplicate, edit, and delete, saved after each reload', async ({ page, trackCreated }) => {
    const routes = new RouteSetupPage(page);
    await routes.open();

    const number = unique();
    const created = await routes.addRoute(number);
    expect(created.status()).toBe(201);
    trackCreated(created.url(), (await created.json()).data.id);
    await routes.acknowledgeNotice('Route added');

    const duplicate = await routes.addRoute(number);
    expect(duplicate.status()).toBe(400);
    expect((await duplicate.json()).code).toBe('DUPLICATE');
    await routes.acknowledgeNotice(/already exists/i);
    await routes.cancelForm();

    await routes.reload();
    await expect(routes.row(number)).toHaveCount(1);

    const renamed = `${number}-R`;
    await routes.editRoute(number, renamed);
    await routes.acknowledgeNotice('Route updated');
    await routes.reload();
    await expect(routes.row(renamed)).toBeVisible();

    await routes.deleteRoute(renamed);
    await routes.acknowledgeNotice('Route deleted');
    await routes.reload();
    await expect(routes.row(renamed)).toHaveCount(0);
  });

  test('products: add with a category and prices, change the price, archive', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();
    const category = unique('CAT');
    const cat = await categories.add(category);
    trackCreated(cat.url(), (await cat.json()).data.id);
    await categories.acknowledgeNotice('Category added');

    const products = new ProductsSetupPage(page);
    await products.open();

    // A name is required.
    await products.addButton.click();
    await products.addSubmit.click();
    expect(await products.nameField.evaluate((el) => !(el as HTMLInputElement).validity.valid)).toBe(true); // browser refuses it
    await products.cancelForm();

    const name = unique('PROD');
    const created = await products.add({ name, category, cost: 20, selling: 24 });
    expect(created.status()).toBe(201);
    trackCreated(created.url(), (await created.json()).data.id);
    await products.acknowledgeNotice('Product added');
    await expect(products.row(name)).toContainText(rupees(20));
    await expect(products.row(name)).toContainText(rupees(24));

    await page.reload();
    await products.open();
    await products.search.fill(name);
    await expect(products.row(name)).toContainText(category);

    await products.openEdit(name);
    await products.changeSellingPrice(26);
    await products.acknowledgeNotice('Product updated');
    await expect(products.row(name)).toContainText(rupees(26));

    await products.archive(name);
    await products.search.fill(name);
    await expect(products.row(name)).toHaveCount(0);
  });
});
