import { expect, type Locator, type Page } from '@playwright/test';

/** The app frame: sidebar on landscape iPad / desktop, slide-over drawer ("Open menu") on portrait iPad. */
export class ShellPage {
  readonly menuButton: Locator;

  constructor(private readonly page: Page) {
    this.menuButton = page.getByRole('button', { name: 'Open menu' });
  }

  /** Makes the navigation reachable on whatever screen we are on. */
  private async revealNav(): Promise<void> {
    if (await this.menuButton.isVisible()) await this.menuButton.click();
  }

  link(label: string): Locator {
    return this.page.getByRole('complementary').getByRole('link', { name: label, exact: true });
  }

  /** Clicks a sidebar / drawer entry by its label. */
  async goTo(label: string): Promise<void> {
    await this.revealNav();
    await this.link(label).click();
  }

  /** Signs out through the confirmation dialog. */
  async signOut(): Promise<void> {
    await this.revealNav();
    await this.page.getByRole('complementary').getByRole('button', { name: 'Sign Out' }).click();
    await this.confirmSignOut();
  }

  /** The "Sign out?" question; answered through its own button, not the sidebar's. */
  private async confirmSignOut(): Promise<void> {
    const question = this.page.getByRole('heading', { name: 'Sign out?' });
    await expect(question).toBeVisible();
    await question.locator('xpath=..').getByRole('button', { name: 'Sign Out', exact: true }).click();
  }

  /** Salesman phone layout: identity bar with its own sign-out button. */
  async signOutOnPhone(): Promise<void> {
    await this.page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await this.confirmSignOut();
  }
}
