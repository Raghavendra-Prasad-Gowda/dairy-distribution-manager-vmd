import { expect, test } from '../src/fixtures';
import { RouteSetupPage } from '../src/pages/RouteSetupPage';

/**
 * Real end-to-end flow: browser -> deployed frontend -> deployed API -> real database.
 * Writes to the target environment, so every route is a throwaway "E2E-..." record that is
 * removed after the test. Never run against production.
 */
const unique = () => `E2E-${Date.now()}`;

test.describe('Route Setup', () => {
  test('admin can add, edit and delete a route, and changes survive a reload', async ({ page, trackRoute }) => {
    const routes = new RouteSetupPage(page);
    await routes.open();

    // Add
    const original = unique();
    const created = await routes.addRoute(original);
    expect(created.status()).toBe(201);
    trackRoute(created.url(), (await created.json()).data.id);
    await routes.acknowledgeNotice('Route added');
    await expect(routes.row(original)).toBeVisible();

    // Persisted in the database, not just in React state
    await page.reload();
    await expect(routes.row(original)).toBeVisible();

    // Edit
    const renamed = `${original}-R`;
    await routes.editRoute(original, renamed);
    await routes.acknowledgeNotice('Route updated');
    await expect(routes.row(renamed)).toBeVisible();
    await expect(routes.row(original)).toHaveCount(0);

    await page.reload();
    await expect(routes.row(renamed)).toBeVisible();
    await expect(routes.row(original)).toHaveCount(0);

    // Delete
    await routes.deleteRoute(renamed);
    await routes.acknowledgeNotice('Route deleted');
    await expect(routes.row(renamed)).toHaveCount(0);

    await page.reload();
    await expect(routes.row(renamed)).toHaveCount(0);
  });

  test('adding a duplicate route number in the same brand is rejected by the database', async ({ page, trackRoute }) => {
    const routes = new RouteSetupPage(page);
    await routes.open();

    const number = unique();
    const first = await routes.addRoute(number);
    expect(first.status()).toBe(201);
    trackRoute(first.url(), (await first.json()).data.id);
    await routes.acknowledgeNotice('Route added');
    await expect(routes.row(number)).toBeVisible();

    const second = await routes.addRoute(number);
    expect(second.status()).toBe(400);
    expect((await second.json()).code).toBe('DUPLICATE');
    await routes.acknowledgeNotice(/already exists/i);

    await page.reload();
    await expect(routes.row(number)).toHaveCount(1);
  });

  test('the add form will not submit an empty route number', async ({ page }) => {
    const routes = new RouteSetupPage(page);
    await routes.open();

    await routes.addRouteButton.click();
    await expect(page.getByRole('button', { name: 'Add Route' }).last()).toBeDisabled();
  });
});
