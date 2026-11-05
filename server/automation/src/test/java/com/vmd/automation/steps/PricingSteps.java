package com.vmd.automation.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.Dates;
import com.vmd.automation.core.Role;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;

/** Business-level shortcuts for the pricing and product-access setup that many scenarios need first. */
public class PricingSteps {

    private final TestContext ctx;

    public PricingSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    @Given("admin enables {string} for everyone at price {int}")
    public void enableForEveryone(String product, int price) {
        patchGlobal(Map.of("productId", ctx.idOf(product), "isEnabled", true, "defaultPrice", price));
    }

    @When("admin switches {string} off for everyone")
    public void switchOffForEveryone(String product) {
        patchGlobal(Map.of("productId", ctx.idOf(product), "isEnabled", false));
    }

    @Given("admin sets the price of {string} for {string} to {int}")
    public void setPrice(String product, String salesperson, int price) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of("effectiveFrom", Dates.todayIst().toString(),
                        "prices", List.of(Map.of("productId", ctx.idOf(product), "sellingPrice", price))))
                .post("/api/v1/salespeople/" + ctx.idOf(salesperson) + "/prices/bulk");
        assertThat(res.statusCode()).as("set price (%s)", res.asString()).isEqualTo(200);
        ctx.response = res;
    }

    private void patchGlobal(Map<String, Object> product) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of("products", List.of(product)))
                .patch("/api/v1/products/salesperson-global");
        assertThat(res.statusCode()).as("global product access (%s)", res.asString()).isEqualTo(200);
        ctx.response = res;
    }
}
