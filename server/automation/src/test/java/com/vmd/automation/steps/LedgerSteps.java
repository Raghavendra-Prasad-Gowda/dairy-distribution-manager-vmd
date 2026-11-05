package com.vmd.automation.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.Placeholders;
import com.vmd.automation.core.Role;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.restassured.response.Response;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reads running balances the way the app does and compares them, day by day, with what the business
 * rules say they must be. Column names are business words; the API's field names stay in here.
 */
public class LedgerSteps {

    /** column in the feature table -> field in the dairy balance payload */
    private static final Map<String, String> DAIRY = Map.of(
            "opening", "openingBalance",
            "stock", "stockValue",
            "deposit", "depositValue",
            "topUp", "topUpAmount",
            "paid", "amountPaid",
            "closing", "closingBalance");

    /** column in the feature table -> field in the salesperson balance payload */
    private static final Map<String, String> SALESPERSON = Map.of(
            "opening", "openingBalance",
            "given", "stockGiven",
            "topUp", "topUpAmount",
            "paid", "amountPaid",
            "closing", "closingBalance");

    private final TestContext ctx;

    public LedgerSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    /** One row per date; only the columns present are compared. */
    @Then("the dairy ledger of {string} shows:")
    public void dairyLedgerShows(String brandAlias, DataTable table) {
        long brandId = ctx.idOf(brandAlias);
        check(table, DAIRY, date -> "/api/v1/dairy-balance/" + brandId + "?date=" + date, "dairy ledger of brand " + brandId);
    }

    @Then("the ledger of salesperson {string} shows:")
    public void salespersonLedgerShows(String alias, DataTable table) {
        long id = ctx.idOf(alias);
        check(table, SALESPERSON, date -> "/api/v1/salesperson-balance/" + id + "?date=" + date, "ledger of salesperson " + id);
    }

    private void check(DataTable table, Map<String, String> columns, java.util.function.Function<String, String> path, String what) {
        for (Map<String, String> row : table.asMaps()) {
            String date = Placeholders.resolve(row.get("date"), ctx.variables);
            Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN)).get(path.apply(date));
            assertThat(res.statusCode()).as("%s on %s (%s)", what, date, res.asString()).isEqualTo(200);
            Map<String, String> actual = new LinkedHashMap<>();
            Map<String, String> expected = new LinkedHashMap<>();
            columns.forEach((column, field) -> {
                if (row.containsKey(column)) {
                    Object value = res.jsonPath().get("data." + field);
                    actual.put(column, value == null ? "null" : plain(value));
                    expected.put(column, plain(row.get(column)));
                }
            });
            assertThat(actual).as("%s on %s", what, date).isEqualTo(expected);
        }
    }

    /** "200", 200 and "200.00" are the same amount. */
    private static String plain(Object value) {
        BigDecimal number = new BigDecimal(String.valueOf(value).trim());
        return number.stripTrailingZeros().toPlainString();
    }
}
