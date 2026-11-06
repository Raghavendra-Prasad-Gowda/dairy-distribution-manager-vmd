import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { BasePage } from './BasePage';

/** /dairy/setup/categories — product categories per brand. */
export class CategorySetupPage extends BasePage {
  readonly heading: Locator;
  readonly addButton: Locator;
  readonly search: Locator;
  private readonly nameInput: Locator;
  private readonly form: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Category Setup' });
    this.addButton = page.getByRole('button', { name: 'Add Category' }).first();
    this.search = page.getByPlaceholder('Search by name…');
    this.nameInput = page.getByPlaceholder('e.g. Milk, Curd, Butter');
    this.form = page.locator('form').filter({ has: this.nameInput });
  }

  /** Opens the page with a brand selected (the brand list loads asynchronously). */
  async open(brandName = 'Nandini'): Promise<void> {
    await this.page.goto('/dairy/setup/categories');
    await this.heading.waitFor();
    await this.chooseBrand(brandName);
  }

  /** Switches brand tab and waits for that brand's categories to arrive, so row assertions are not vacuous. */
  async chooseBrand(brandName: string): Promise<void> {
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/categories$/.test(new URL(r.url()).pathname),
    );
    await this.page.getByRole('button', { name: brandName, exact: true }).click();
    await loaded;
    await expect(this.page.getByText('Loading…')).toHaveCount(0);
  }

  async reload(brandName = 'Nandini'): Promise<void> {
    await this.page.reload();
    await this.heading.waitFor();
    await this.chooseBrand(brandName);
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
  }

  get nameField(): Locator {
    return this.nameInput;
  }

  async add(name: string): Promise<Response> {
    await this.addButton.click();
    await this.nameInput.fill(name);
    const saved = this.nextResponse('POST', /\/categories$/);
    await this.form.getByRole('button', { name: 'Add Category' }).click();
    return saved;
  }

  async openEdit(name: string): Promise<void> {
    await this.row(name).getByTitle('Edit').click();
  }

  async edit(oldName: string, newName: string): Promise<void> {
    await this.openEdit(oldName);
    await this.nameInput.fill(newName);
    const saved = this.nextResponse('PUT', /\/categories\/\d+$/);
    await this.form.getByRole('button', { name: 'Save Changes' }).click();
    await saved;
  }

  async cancelForm(): Promise<void> {
    await this.form.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.nameInput).toHaveCount(0);
  }

  async askToDelete(name: string): Promise<void> {
    await this.row(name).getByTitle('Delete').click();
    await expect(this.dialog).toBeVisible();
  }

  async delete(name: string): Promise<void> {
    await this.askToDelete(name);
    const deleted = this.nextResponse('DELETE', /\/categories\/\d+$/);
    await this.confirmDialog('Delete');
    await deleted;
  }

  get emptySearchMessage(): Locator {
    return this.page.getByText('No categories match your search.');
  }
}
