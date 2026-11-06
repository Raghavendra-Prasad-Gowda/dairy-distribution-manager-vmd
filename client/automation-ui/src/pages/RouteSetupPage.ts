import { expect, type Locator, type Page, type Response } from '@playwright/test';

/** /dairy/setup/routes — manage delivery route numbers per brand. */
export class RouteSetupPage {
  readonly heading: Locator;
  readonly addRouteButton: Locator;
  private readonly form: Locator;
  private readonly numberInput: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Route Setup' });
    this.addRouteButton = page.getByRole('button', { name: 'Add Route' }).first();
    // The add/edit modal is a plain <form> (no dialog role); find it by its input.
    this.numberInput = page.getByPlaceholder('e.g. 220, 512, 127');
    this.form = page.locator('form').filter({ has: this.numberInput });
  }

  /**
   * Opens the page with a brand selected. The brand list loads asynchronously, and the page posts
   * `brandId: activeBrandId` - so adding a route before it arrives sends null and the API answers
   * 400. Slow networks (a CI runner talking to a free-tier Render service) hit that easily, hence
   * the explicit wait. Nandini is used because routes are a Nandini concept and it matches the API suite.
   */
  async open(brandName = 'Nandini'): Promise<void> {
    await this.page.goto('/dairy/setup/routes');
    await this.heading.waitFor();
    await this.selectBrand(brandName);
  }

  /** Switches to another brand's tab and waits until the page confirms it. */
  async chooseBrand(brandName: string): Promise<void> {
    await this.selectBrand(brandName);
  }

  /** The route-number field of the open add/edit form. */
  get numberField(): Locator {
    return this.numberInput;
  }

  /** Opens the edit form for a route without changing anything. */
  async openEdit(routeNumber: string): Promise<void> {
    await this.row(routeNumber).getByTitle('Edit').click();
  }

  /** Closes the add/edit form with its Cancel button. */
  async cancelForm(): Promise<void> {
    await this.form.getByRole('button', { name: 'Cancel' }).click();
    await this.numberInput.waitFor({ state: 'detached' });
  }

  /** Opens the delete confirmation and answers Cancel, so nothing is deleted. */
  async cancelDelete(routeNumber: string): Promise<void> {
    await this.row(routeNumber).getByTitle('Delete').click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toContainText(`Delete route "${routeNumber}"?`);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  }

  /** Clicks the brand tab and waits until the page confirms that brand is the active one. */
  private async selectBrand(brandName: string): Promise<void> {
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
    await expect(this.page.getByText('Routes defined here appear as columns in the')).toContainText(
      `in the ${brandName} Stock Receipt`,
    );
  }

  /**
   * Reloads the page and selects the brand again. The page does not remember the selected brand
   * across a reload - it falls back to the first brand in the API's order - so a test that checks a
   * Nandini route after a reload must pick Nandini again instead of relying on the environment's
   * brand order (which differs between local, testing and production data).
   */
  async reload(brandName = 'Nandini'): Promise<void> {
    await this.page.reload();
    await this.heading.waitFor();
    await this.selectBrand(brandName);
  }

  /** The table row for a route number. Exact match: "Route E2E-1" must not match "Route E2E-1-R". */
  row(routeNumber: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(`Route ${routeNumber}`, { exact: true }) });
  }

  /** Fills the add form and submits; resolves with the API response so callers can track the new id. */
  async addRoute(routeNumber: string): Promise<Response> {
    await this.addRouteButton.click();
    await this.numberInput.fill(routeNumber);
    const saved = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/routes$/.test(new URL(r.url()).pathname),
    );
    await this.form.getByRole('button', { name: 'Add Route' }).click();
    return saved;
  }

  async editRoute(oldNumber: string, newNumber: string): Promise<void> {
    await this.row(oldNumber).getByTitle('Edit').click();
    await this.numberInput.fill(newNumber);
    const saved = this.page.waitForResponse(
      (r) => r.request().method() === 'PUT' && /\/routes\/\d+$/.test(new URL(r.url()).pathname),
    );
    await this.form.getByRole('button', { name: 'Save Changes' }).click();
    await saved;
  }

  async deleteRoute(routeNumber: string): Promise<void> {
    await this.row(routeNumber).getByTitle('Delete').click();
    const confirm = this.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true });
    const deleted = this.page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && /\/routes\/\d+$/.test(new URL(r.url()).pathname),
    );
    await confirm.click();
    await deleted;
  }

  /**
   * Saves, deletes and errors are announced in a blocking modal ("Success"/"Error" + OK) that
   * covers the page until dismissed. Asserts the message, then clicks OK like a user would.
   */
  async acknowledgeNotice(text: string | RegExp): Promise<void> {
    await expect(this.page.getByText(text).first()).toBeVisible();
    await this.page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(this.page.getByRole('button', { name: 'OK', exact: true })).toHaveCount(0);
  }
}
