import { expect, type Locator, type Page } from '@playwright/test';

/** Behaviour shared by every screen: the blocking "Success"/"Error" notice and the confirmation dialog. */
export abstract class BasePage {
  protected readonly ok: Locator;

  constructor(protected readonly page: Page) {
    this.ok = page.getByRole('button', { name: 'OK', exact: true });
  }

  /**
   * Saves, deletes and errors are announced in a blocking modal ("Success"/"Error" + OK) that
   * covers the page until dismissed. Asserts the message, then clicks OK like a user would.
   */
  async acknowledgeNotice(text: string | RegExp): Promise<void> {
    const notice = this.page.getByRole('heading', { name: /^(Success|Error|Something went wrong)$/ }).locator('xpath=..');
    await expect(notice).toContainText(text);
    await this.ok.click();
    await expect(this.ok).toHaveCount(0);
  }

  /** The open confirmation dialog (delete, discard, ...). */
  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  /** Confirms the open dialog with its action button and resolves once the dialog is gone. */
  async confirmDialog(buttonName: string | RegExp = 'Delete'): Promise<void> {
    await this.dialog.getByRole('button', { name: buttonName, exact: typeof buttonName === 'string' }).click();
  }

  async cancelDialog(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.dialog).toHaveCount(0);
  }

  /** Resolves with the response of the next API call matching method + path suffix. */
  protected nextResponse(method: string, pathPattern: RegExp) {
    return this.page.waitForResponse(
      (r) => r.request().method() === method && pathPattern.test(new URL(r.url()).pathname),
    );
  }
}
