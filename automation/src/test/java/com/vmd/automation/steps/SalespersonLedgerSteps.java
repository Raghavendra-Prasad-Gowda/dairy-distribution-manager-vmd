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

/** Business-level actions on the salesperson side, used to build up a ledger before the real check. */
public class SalespersonLedgerSteps {

    private final TestContext ctx;

    public SalespersonLedgerSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    @Given("admin dispatches {int} of {string} at {int} to {string} on {string}")
    public void dispatches(int quantity, String product, int unitPrice, String salesperson, String date) {
        dispatch(quantity, product, unitPrice, salesperson, date, null);
    }

    @Given("admin dispatches {int} of {string} at {int} to {string} on {string} remembered as {string}")
    public void dispatchesAndRemembers(int quantity, String product, int unitPrice, String salesperson, String date, String alias) {
        dispatch(quantity, product, unitPrice, salesperson, date, alias);
    }

    private void dispatch(int quantity, String product, int unitPrice, String salesperson, String date, String alias) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of(
                        "salespersonId", ctx.idOf(salesperson),
                        "dispatchDate", Placeholders.resolve(date, ctx.variables),
                        "items", List.of(Map.of("productId", ctx.idOf(product), "quantity", quantity, "unitPrice", unitPrice))))
                .post("/api/v1/dispatches");
        assertThat(res.statusCode()).as("save dispatch (%s)", res.asString()).isIn(200, 201);
        ctx.response = res;
        if (alias != null) ctx.variables.put(alias, res.jsonPath().getMap("data"));
    }

    @Given("admin collects {int} from {string} on {string}")
    public void collects(int amount, String salesperson, String date) {
        collect(amount, salesperson, date, null);
    }

    @Given("admin collects {int} from {string} on {string} remembered as {string}")
    public void collectsAndRemembers(int amount, String salesperson, String date, String alias) {
        collect(amount, salesperson, date, alias);
    }

    private void collect(int amount, String salesperson, String date, String alias) {
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of(
                        "salespersonId", ctx.idOf(salesperson),
                        "paymentDate", Placeholders.resolve(date, ctx.variables),
                        "amount", amount,
                        "paymentMode", "Cash"))
                .post("/api/v1/salesperson-payments");
        assertThat(res.statusCode()).as("record collection (%s)", res.asString()).isEqualTo(201);
        ctx.response = res;
        if (alias != null) ctx.variables.put(alias, res.jsonPath().getMap("data"));
    }
}
