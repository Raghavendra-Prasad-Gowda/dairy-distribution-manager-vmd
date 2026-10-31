package com.vmd.automation.ui.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import com.vmd.automation.config.TestConfig;

public class LoginPage {

    private final Page page;

    public LoginPage(Page page) {
        this.page = page;
    }

    public void open() {
        String url = TestConfig.webBaseUrl() + "/login";
        String bypass = TestConfig.vercelBypassSecret();
        if (!bypass.isEmpty()) {
            // Vercel sets a cookie for the rest of the session. Done as a query string (not an
            // extra header) so the header is never sent cross-origin to the API, which would
            // trip CORS preflight.
            url += "?x-vercel-protection-bypass=" + bypass + "&x-vercel-set-bypass-cookie=samesitenone";
        }
        page.navigate(url);
        usernameInput().waitFor();
    }

    public void signIn(String username, String password) {
        usernameInput().fill(username);
        passwordInput().fill(password);
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Sign In")).click();
    }

    private Locator usernameInput() {
        return page.locator("#username");
    }

    private Locator passwordInput() {
        return page.locator("#password");
    }
}
