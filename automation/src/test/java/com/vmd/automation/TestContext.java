package com.vmd.automation;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import io.restassured.response.Response;

/**
 * Per-scenario state shared between step classes (PicoContainer creates one
 * instance per scenario and injects it into every step class that asks for it).
 */
public class TestContext {

    // API
    public Response response;

    // UI (only populated for @ui scenarios by UiHooks)
    public Playwright playwright;
    public Browser browser;
    public BrowserContext browserContext;
    public Page page;
}
