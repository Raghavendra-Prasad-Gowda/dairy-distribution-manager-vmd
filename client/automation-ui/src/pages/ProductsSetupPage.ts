import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { BasePage } from './BasePage';

/** /dairy/setup/products — the catalogue: name, category, unit and the dairy's cost / selling price. */
export class ProductsSetupPage extends BasePage {
  readonly search: Locator;
  readonly addButton: Locator;
  private readonly nameInput: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByPlaceholder('Search by name or category…');
    this.addButton = page.getByRole('button', { name: 'Add Product' }).first();
    this.nameInput = page.getByPlaceholder('e.g. Homogenised Milk');
  }

  async open(brandName = 'Nandini'): Promise<void> {
    await this.page.goto('/dairy/setup/products');
    await this.page.getByRole('heading', { name: 'Product Setup' }).waitFor();
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/products$/.test(new URL(r.url()).pathname),
    );
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
    await loaded;
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  private get form(): Locator {
    return this.page.locator('form').filter({ has: this.nameInput });
  }

  /** Fills the add form with a piece-counted product and submits it. */
  async add(details: { name: string; category?: string; cost: number; selling: number }): Promise<Response> {
    await this.addButton.click();
    await this.nameInput.fill(details.name);
    if (details.category) await this.form.getByRole('combobox').first().selectOption({ label: details.category });
    await this.form.getByRole('button', { name: 'piece', exact: true }).click();
    await this.form.getByRole('spinbutton').nth(0).fill(String(details.cost));
    await this.form.getByRole('spinbutton').nth(1).fill(String(details.selling));
    const saved = this.nextResponse('POST', /\/products$/);
    await this.form.getByRole('button', { name: 'Add Product' }).click();
    return saved;
  }

  async openEdit(name: string): Promise<void> {
    await this.row(name).getByTitle('Edit').click();
    await expect(this.nameInput).toHaveValue(name);
  }

  async changeSellingPrice(selling: number): Promise<void> {
    await this.form.getByRole('spinbutton').nth(1).fill(String(selling));
    const saved = this.nextResponse('PUT', /\/products\/\d+$/);
    await this.form.getByRole('button', { name: 'Save Changes' }).click();
    await saved;
  }

  async cancelForm(): Promise<void> {
    await this.form.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.nameInput).toHaveCount(0);
  }

  async archive(name: string): Promise<void> {
    await this.row(name).getByTitle('Archive').click();
    await this.confirmDialog('Archive');
    await this.acknowledgeNotice('Product archived');
  }

  get nameField(): Locator {
    return this.nameInput;
  }

  get addSubmit(): Locator {
    return this.form.getByRole('button', { name: 'Add Product' });
  }
}
