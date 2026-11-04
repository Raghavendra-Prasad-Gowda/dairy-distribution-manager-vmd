package com.vmd.automation.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vmd.automation.TestContext;
import com.vmd.automation.core.Placeholders;
import com.vmd.automation.fixtures.Fixtures;
import io.cucumber.java.en.Given;
import java.util.Map;

/** Givens that set up throwaway records. Each is addressable afterwards as {@code ${alias.field}}. */
public class FixtureSteps {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final TestContext ctx;
    private final Fixtures fixtures;

    public FixtureSteps(TestContext ctx) {
        this.ctx = ctx;
        this.fixtures = new Fixtures(ctx);
    }

    /** A real brand (read-only use): scenarios that only add and remove their own child records use this. */
    @Given("the existing brand {string} as {string}")
    public void theExistingBrand(String name, String alias) {
        var res = com.vmd.automation.core.ApiClient
                .withToken(com.vmd.automation.core.AuthManager.token(com.vmd.automation.core.Role.ADMIN))
                .get("/api/v1/brands");
        assertThat(res.statusCode()).as("list brands (%s)", res.asString()).isEqualTo(200);
        java.util.List<Map<String, Object>> brands = res.jsonPath().getList("data");
        Map<String, Object> found = brands.stream()
                .filter(b -> name.equalsIgnoreCase(String.valueOf(b.get("name")))).findFirst()
                .orElseThrow(() -> new AssertionError("brand \"" + name + "\" not found in " + brands));
        ctx.variables.put(alias, found);
    }

    /** The salesman account the run logs in as, for "my own data" scoping checks. */
    @Given("the run's salesman as {string}")
    public void theRunsSalesman(String alias) {
        ctx.variables.put(alias, com.vmd.automation.core.AuthManager.credentials(com.vmd.automation.core.Role.SALESMAN));
    }

    /** The dispatcher the run signs in as (needs a superadmin), including its generated credentials. */
    @Given("the run's dispatcher as {string}")
    public void theRunsDispatcher(String alias) {
        ctx.variables.put(alias, com.vmd.automation.core.AuthManager.credentials(com.vmd.automation.core.Role.DISPATCHER));
    }

    /** The caller's own admin-user id, read from the token the suite obtained (needed for "cannot change yourself" rules). */
    @Given("the superadmin's own account as {string}")
    public void theSuperadminsOwnAccount(String alias) {
        String token = com.vmd.automation.core.AuthManager.token(com.vmd.automation.core.Role.SUPERADMIN);
        ctx.variables.put(alias, Map.of("id", com.vmd.automation.core.JwtForge.claim(token, "adminUserId")));
    }

    @Given("a throwaway admin user {string}")
    public void aThrowawayAdminUser(String alias) {
        fixtures.adminUser(alias, "admin");
    }

    @Given("a throwaway admin user {string} with role {string}")
    public void aThrowawayAdminUserWithRole(String alias, String role) {
        fixtures.adminUser(alias, role);
    }

    @Given("a throwaway brand {string}")
    public void aThrowawayBrand(String alias) {
        fixtures.brand(alias);
    }

    @Given("a throwaway category {string} in brand {string}")
    public void aThrowawayCategory(String alias, String brandAlias) {
        fixtures.category(alias, entity(brandAlias));
    }

    @Given("a throwaway product {string} in brand {string}")
    public void aThrowawayProduct(String alias, String brandAlias) {
        fixtures.product(alias, entity(brandAlias), Map.of());
    }

    @Given("a throwaway product {string} in brand {string} with:")
    public void aThrowawayProductWith(String alias, String brandAlias, String overridesJson) throws Exception {
        Map<String, Object> overrides = JSON.readValue(
                Placeholders.resolve(overridesJson, ctx.variables), new TypeReference<>() {});
        fixtures.product(alias, entity(brandAlias), overrides);
    }

    @Given("a throwaway route {string} in brand {string}")
    public void aThrowawayRoute(String alias, String brandAlias) {
        fixtures.route(alias, entity(brandAlias));
    }

    /** For scenarios about ledgers, stock entries and prices; scenarios that edit or delete salespeople use "throwaway". */
    @Given("a salesperson with a clean ledger {string}")
    public void aSalespersonWithACleanLedger(String alias) {
        fixtures.cleanSalesperson(alias);
    }

    @Given("a throwaway salesperson {string}")
    public void aThrowawaySalesperson(String alias) {
        fixtures.salesperson(alias, false);
    }

    @Given("a throwaway salesperson {string} who can log in")
    public void aThrowawaySalespersonWhoCanLogIn(String alias) {
        fixtures.salesperson(alias, true);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> entity(String alias) {
        Object value = ctx.variables.get(alias);
        assertThat(value).as("no \"%s\" set up earlier in this scenario", alias).isInstanceOf(Map.class);
        return (Map<String, Object>) value;
    }
}
