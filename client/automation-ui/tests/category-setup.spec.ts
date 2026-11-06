import { expect, test } from '../src/fixtures';
import { CategorySetupPage } from '../src/pages/CategorySetupPage';

/**
 * Writes to the target environment: every category is a throwaway "E2E-..." record that
 * `trackCreated` removes afterwards. Never run against production.
 */
const unique = (tag = '') => `E2E-${Date.now()}${tag}`;

test.describe('Category Setup', () => {
  test('admin can add, edit and delete a category, and changes survive a reload', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const original = unique();
    const created = await categories.add(original);
    expect(created.status()).toBe(201);
    trackCreated(created.url(), (await created.json()).data.id);
    await categories.acknowledgeNotice('Category added');
    await expect(categories.row(original)).toBeVisible();

    await categories.reload();
    await expect(categories.row(original)).toBeVisible();

    const renamed = `${original}-R`;
    await categories.edit(original, renamed);
    await categories.acknowledgeNotice('Category updated');
    await expect(categories.row(renamed)).toBeVisible();
    await expect(categories.row(original)).toHaveCount(0);

    await categories.reload();
    await expect(categories.row(renamed)).toBeVisible();

    await categories.delete(renamed);
    await categories.acknowledgeNotice('Category deleted');
    await expect(categories.row(renamed)).toHaveCount(0);

    await categories.reload();
    await expect(categories.row(renamed)).toHaveCount(0);
  });

  test('the name is trimmed before it is saved', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const name = unique();
    const created = await categories.add(`   ${name}   `);
    trackCreated(created.url(), (await created.json()).data.id);
    expect((await created.json()).data.name).toBe(name);
    await categories.acknowledgeNotice('Category added');
    await expect(categories.row(name)).toBeVisible();
  });

  test('a duplicate name in the same brand is rejected', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const name = unique();
    const first = await categories.add(name);
    trackCreated(first.url(), (await first.json()).data.id);
    await categories.acknowledgeNotice('Category added');

    const second = await categories.add(name);
    expect(second.status()).toBe(400);
    expect((await second.json()).code).toBe('DUPLICATE');
    await categories.acknowledgeNotice(/already exists/i);

    await categories.reload();
    await expect(categories.row(name)).toHaveCount(1);
  });

  test('the add form will not submit an empty name', async ({ page }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    await categories.addButton.click();
    await expect(page.getByRole('button', { name: 'Add Category' }).last()).toBeDisabled();
  });

  test('the edit form opens with the current name, and Cancel changes nothing', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const name = unique();
    const created = await categories.add(name);
    trackCreated(created.url(), (await created.json()).data.id);
    await categories.acknowledgeNotice('Category added');

    await categories.openEdit(name);
    await expect(categories.nameField).toHaveValue(name);
    await categories.nameField.fill(`${name}-X`);
    await categories.cancelForm();

    await expect(categories.row(name)).toBeVisible();
    await expect(categories.row(`${name}-X`)).toHaveCount(0);
  });

  test('deleting warns that products become uncategorised, and Cancel keeps the category', async ({
    page,
    trackCreated,
  }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const name = unique();
    const created = await categories.add(name);
    trackCreated(created.url(), (await created.json()).data.id);
    await categories.acknowledgeNotice('Category added');

    await categories.askToDelete(name);
    await expect(categories.dialog).toContainText(`Delete "${name}"?`);
    await expect(categories.dialog).toContainText('Products using this category will become uncategorised.');
    await categories.cancelDialog();

    await expect(categories.row(name)).toBeVisible();
    await categories.reload();
    await expect(categories.row(name)).toBeVisible();
  });

  test('search filters the list by name and says so when nothing matches', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open();

    const stamp = Date.now();
    const alpha = `E2E-${stamp}-Alpha`;
    const beta = `E2E-${stamp}-Beta`;
    for (const name of [alpha, beta]) {
      const created = await categories.add(name);
      trackCreated(created.url(), (await created.json()).data.id);
      await categories.acknowledgeNotice('Category added');
    }

    await categories.search.fill(`${stamp}-alpha`); // case-insensitive
    await expect(categories.row(alpha)).toBeVisible();
    await expect(categories.row(beta)).toHaveCount(0);

    await categories.search.fill(`no-such-category-${stamp}`);
    await expect(categories.emptySearchMessage).toBeVisible();

    await categories.search.clear();
    await expect(categories.row(alpha)).toBeVisible();
    await expect(categories.row(beta)).toBeVisible();
  });

  test('a category belongs to its brand: it is not listed under another brand', async ({ page, trackCreated }) => {
    const categories = new CategorySetupPage(page);
    await categories.open('Nandini');

    const name = unique();
    const created = await categories.add(name);
    trackCreated(created.url(), (await created.json()).data.id);
    await categories.acknowledgeNotice('Category added');
    await expect(categories.row(name)).toBeVisible();

    await categories.chooseBrand('Jersey');
    await expect(categories.row(name)).toHaveCount(0);

    await categories.chooseBrand('Nandini');
    await expect(categories.row(name)).toBeVisible();
  });
});
