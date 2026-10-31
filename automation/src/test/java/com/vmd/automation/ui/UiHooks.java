package com.vmd.automation.ui;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Tracing;
import com.vmd.automation.TestContext;
import com.vmd.automation.config.TestConfig;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/** Browser lifecycle for @ui scenarios: fresh context per scenario, evidence on failure. */
public class UiHooks {

    private final TestContext ctx;

    public UiHooks(TestContext ctx) {
        this.ctx = ctx;
    }

    @Before("@ui")
    public void startBrowser() {
        ctx.playwright = Playwright.create();

        BrowserType.LaunchOptions launch = new BrowserType.LaunchOptions().setHeadless(TestConfig.headless());
        if (!TestConfig.chromiumExecutablePath().isEmpty()) {
            launch.setExecutablePath(Paths.get(TestConfig.chromiumExecutablePath()));
            launch.setArgs(List.of("--no-sandbox"));
        }
        ctx.browser = ctx.playwright.chromium().launch(launch);
        ctx.browserContext = ctx.browser.newContext(new Browser.NewContextOptions().setViewportSize(1366, 768));
        ctx.browserContext.setDefaultTimeout(TestConfig.uiTimeoutMs());
        ctx.browserContext.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true));
        ctx.page = ctx.browserContext.newPage();
    }

    @After("@ui")
    public void stopBrowser(Scenario scenario) {
        try {
            if (scenario.isFailed() && ctx.page != null) {
                scenario.attach(ctx.page.screenshot(new Page.ScreenshotOptions().setFullPage(true)),
                        "image/png", "failure screenshot");
                Path trace = Paths.get("target", "traces", scenario.getName().replaceAll("[^A-Za-z0-9]+", "-") + ".zip");
                ctx.browserContext.tracing().stop(new Tracing.StopOptions().setPath(trace));
            } else if (ctx.browserContext != null) {
                ctx.browserContext.tracing().stop();
            }
        } finally {
            if (ctx.browser != null) ctx.browser.close();
            if (ctx.playwright != null) ctx.playwright.close();
        }
    }
}
