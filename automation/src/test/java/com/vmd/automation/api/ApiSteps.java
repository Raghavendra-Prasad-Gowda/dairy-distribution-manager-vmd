package com.vmd.automation.api;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.config.TestConfig;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.http.ContentType;

public class ApiSteps {

    private final TestContext ctx;

    public ApiSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    /** Only GET is needed so far; extend with POST/PUT steps as scenarios grow. */
    @When("I call {string}")
    public void iCall(String methodAndPath) {
        String[] parts = methodAndPath.split(" ", 2);
        assertThat(parts).as("expected \"<METHOD> <path>\"").hasSize(2);
        assertThat(parts[0]).as("only GET is supported by this step").isEqualTo("GET");

        ctx.response = given()
                .baseUri(TestConfig.apiBaseUrl())
                .accept(ContentType.JSON)
                .when()
                .get(parts[1]);
    }

    @Then("the response status is {int}")
    public void theResponseStatusIs(int status) {
        assertThat(ctx.response.statusCode())
                .as("status of %s (body: %s)", ctx.response.getHeader("Content-Type"), ctx.response.asString())
                .isEqualTo(status);
    }

    @Then("the JSON field {string} equals {string}")
    public void theJsonFieldEquals(String field, String expected) {
        assertThat(ctx.response.jsonPath().getString(field)).isEqualTo(expected);
    }

    /**
     * /health reports the first 7 chars of the deployed commit. In CI, EXPECTED_COMMIT is the
     * commit wait-for-backend.sh saw running - the pushed SHA, or an older commit with identical
     * server/ code when Render skipped the deploy. It proves the tests ran against the build the
     * pipeline waited for, not some other deploy. Locally (no EXPECTED_COMMIT) the check is skipped.
     */
    @Then("the deployed build matches the commit under test")
    public void theDeployedBuildMatchesTheCommitUnderTest() {
        String expected = TestConfig.expectedCommit();
        if (expected.isEmpty()) {
            System.out.println("EXPECTED_COMMIT not set - skipping deployed-build check");
            return;
        }
        String deployed = ctx.response.jsonPath().getString("commit");
        assertThat(deployed).as("commit reported by /health").isNotBlank();
        assertThat(expected).as("commit under test vs deployed commit").startsWith(deployed);
    }
}
