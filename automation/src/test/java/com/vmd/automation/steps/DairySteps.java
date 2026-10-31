package com.vmd.automation.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.Placeholders;
import com.vmd.automation.core.Role;
import io.cucumber.java.en.Given;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;

/** Business-level actions on the dairy side, used to build up a ledger before the scenario's real check. */
public class DairySteps {

    private final TestContext ctx;

    public DairySteps(TestContext ctx) {
        this.ctx = ctx;
    }

    @Given("admin receives {int} of {string} at {int} into {string} on {string}")
    public void receivesStock(int quantity, String product, int unitPrice, String brand, String date) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of(
                        "brandId", ctx.idOf(brand),
                        "date", Placeholders.resolve(date, ctx.variables),
                        "items", List.of(Map.of("productId", ctx.idOf(product), "quantity", quantity, "unitPrice", unitPrice))))
                .post("/api/v1/stock-receipts/bulk");
        assertThat(res.statusCode()).as("save stock (%s)", res.asString()).isEqualTo(200);
        ctx.response = res;
    }

    @Given("admin pays {int} to {string} on {string}")
    public void pays(int amount, String brand, String date) {
        payment(amount, brand, date, null);
    }

    @Given("admin pays {int} to {string} on {string} remembered as {string}")
    public void paysAndRemembers(int amount, String brand, String date, String alias) {
        payment(amount, brand, date, alias);
    }

    private void payment(int amount, String brand, String date, String alias) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of(
                        "brandId", ctx.idOf(brand),
                        "paymentDate", Placeholders.resolve(date, ctx.variables),
                        "amount", amount,
                        "paymentMode", "Cash"))
                .post("/api/v1/dairy-payments");
        assertThat(res.statusCode()).as("record payment (%s)", res.asString()).isEqualTo(201);
        ctx.response = res;
        if (alias != null) ctx.variables.put(alias, res.jsonPath().getMap("data"));
    }

    @Given("admin sets deposit of {int} per litre on {string}")
    public void setsDeposit(int perLitre, String brand) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of("depositEnabled", true, "depositPerLitre", perLitre))
                .put("/api/v1/brands/" + ctx.idOf(brand));
        assertThat(res.statusCode()).as("set brand deposit (%s)", res.asString()).isEqualTo(200);
    }

    @Given("admin marks category {string} as deposit-bearing")
    public void marksCategory(String category) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of("depositEnabled", true))
                .put("/api/v1/categories/" + ctx.idOf(category));
        assertThat(res.statusCode()).as("mark category (%s)", res.asString()).isEqualTo(200);
    }

    /** Deposit is a product setting that can only be switched on by editing the product, not when creating it. */
    @Given("admin enables deposit on product {string}")
    public void enablesProductDeposit(String product) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of("depositEnabled", true))
                .put("/api/v1/products/" + ctx.idOf(product));
        assertThat(res.statusCode()).as("enable product deposit (%s)", res.asString()).isEqualTo(200);
    }
}
