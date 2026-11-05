import { type Locator, type Page } from '@playwright/test';
import { env } from '../env';

export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;

  constructor(private readonly page: Page) {
    this.username = page.locator('#username');
    this.password = page.locator('#password');
    this.signInButton = page.getByRole('button', { name: 'Sign In' });
  }

  async open(): Promise<void> {
    let url = '/login';
    if (env.vercelBypassSecret) {
      // Vercel sets a cookie for the rest of the session. Done as a query string (not an extra
      // header) so the header is never sent cross-origin to the API, which would trip CORS preflight.
      url += `?x-vercel-protection-bypass=${env.vercelBypassSecret}&x-vercel-set-bypass-cookie=samesitenone`;
    }
    await this.page.goto(url);
    await this.username.waitFor();
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.signInButton.click();
  }

  /** Inline error banner shown above the form after a failed attempt. */
  error(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }
}
