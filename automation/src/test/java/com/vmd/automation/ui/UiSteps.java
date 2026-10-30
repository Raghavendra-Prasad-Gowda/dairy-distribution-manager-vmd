package com.vmd.automation.ui;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.config.TestConfig;
import com.vmd.automation.ui.pages.DashboardPage;
import com.vmd.automation.ui.pages.LoginPage;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

public class UiSteps {

    private final TestContext ctx;

    public UiSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    @Given("I open the login page")
    public void iOpenTheLoginPage() {
        new LoginPage(ctx.page).open();
    }

    @When("I sign in as the admin")
    public void iSignInAsTheAdmin() {
        new LoginPage(ctx.page).signIn(TestConfig.adminUsername(), TestConfig.adminPassword());
    }

    @Then("I see the dashboard")
    public void iSeeTheDashboard() {
        assertThat(new DashboardPage(ctx.page).heading()).isVisible();
    }
}
