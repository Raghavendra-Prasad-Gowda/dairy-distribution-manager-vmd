package com.vmd.automation.hooks;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.ExchangeLog;
import io.cucumber.java.After;
import io.cucumber.java.AfterAll;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;

/**
 * Cross-cutting scenario lifecycle. Cucumber runs After hooks from the highest order to the lowest:
 * the failure evidence is captured first (before cleanup traffic is added to the log), then test data
 * is removed, then - once per run - the run-scoped users are removed.
 */
public class Hooks {

    private static final int ATTACH_EVIDENCE = 20_000;
    private static final int CLEAN_UP_DATA = 10_000;

    private final TestContext ctx;

    public Hooks(TestContext ctx) {
        this.ctx = ctx;
    }

    @Before(order = 0)
    public void startScenario() {
        ExchangeLog.clear();
    }

    @After(order = ATTACH_EVIDENCE)
    public void attachHttpExchangesOnFailure(Scenario scenario) {
        if (scenario.isFailed()) {
            scenario.attach(ExchangeLog.dump(), "text/plain", "HTTP exchanges of the failed scenario");
        }
    }

    @After(order = CLEAN_UP_DATA)
    public void removeTestData() {
        ctx.cleanup.runAll();
    }

    @AfterAll
    public static void removeRunScopedUsers() {
        AuthManager.shutdown();
    }
}
