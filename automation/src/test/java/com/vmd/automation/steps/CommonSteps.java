package com.vmd.automation.steps;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.JwtForge;
import com.vmd.automation.core.Placeholders;
import com.vmd.automation.core.Role;
import io.cucumber.java.ParameterType;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The reusable vocabulary shared by every feature: who calls which endpoint, and what to check in the
 * answer. Domain meaning lives in the feature files; HTTP mechanics live here and in {@code core}.
 */
public class CommonSteps {

    private final TestContext ctx;

    public CommonSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    @ParameterType("anonymous|admin|superadmin|dispatcher|salesman")
    public Role role(String text) {
        return Role.parse(text);
    }

    // ─── requests ────────────────────────────────────────────────────────────

    @When("{role} calls {string}")
    public void roleCalls(Role role, String methodAndPath) {
        send(specFor(role), methodAndPath, null);
    }

    @When("{role} calls {string} with:")
    public void roleCallsWith(Role role, String methodAndPath, String body) {
        send(specFor(role), methodAndPath, body);
    }

    @When("a caller with a malformed token calls {string}")
    public void malformedTokenCalls(String methodAndPath) {
        send(ApiClient.withToken("not.a.jwt"), methodAndPath, null);
    }

    @When("a caller with a malformed token calls {string} with:")
    public void malformedTokenCallsWith(String methodAndPath, String body) {
        send(ApiClient.withToken("not.a.jwt"), methodAndPath, body);
    }

    /** Calls with a session token remembered earlier (e.g. from a sign-in the scenario performed itself). */
    @When("the holder of {string} calls {string}")
    public void holderCalls(String sessionAlias, String methodAndPath) {
        send(ApiClient.withToken(String.valueOf(ctx.variables.get(sessionAlias))), methodAndPath, null);
    }

    @When("the holder of {string} calls {string} with:")
    public void holderCallsWith(String sessionAlias, String methodAndPath, String body) {
        send(ApiClient.withToken(String.valueOf(ctx.variables.get(sessionAlias))), methodAndPath, body);
    }

    /** Tokens the server must reject: unsigned, signed with the wrong key, or not valid yet. */
    @When("a caller with {word} token for role {word} calls {string}")
    public void forgedTokenCalls(String kind, String role, String methodAndPath) {
        String token = switch (kind) {
            case "an-unsigned" -> JwtForge.unsigned(role);
            case "a-wrongly-signed" -> JwtForge.signedWithWrongSecret(role);
            case "a-not-yet-valid" -> JwtForge.notYetValid(role);
            default -> throw new IllegalArgumentException("unknown token kind " + kind);
        };
        send(ApiClient.withToken(token), methodAndPath, null);
    }

    private RequestSpecification specFor(Role role) {
        return role == Role.ANONYMOUS ? ApiClient.anonymous() : ApiClient.withToken(AuthManager.token(role));
    }

    private void send(RequestSpecification spec, String methodAndPath, String body) {
        String[] parts = Placeholders.resolve(methodAndPath, ctx.variables).split(" ", 2);
        assertThat(parts).as("expected \"<METHOD> <path>\" but got \"%s\"", methodAndPath).hasSize(2);
        if (body != null) spec = spec.body(Placeholders.resolve(body, ctx.variables));
        ctx.response = spec.request(parts[0].toUpperCase(), parts[1]);
    }

    // ─── status and envelope ─────────────────────────────────────────────────

    @Then("the response status is {int}")
    public void theResponseStatusIs(int status) {
        assertThat(ctx.response.statusCode())
                .as("status of the last call (body: %s)", ctx.response.asString())
                .isEqualTo(status);
    }

    /** For permission matrices: the caller got past authentication and the role check (validation errors are fine). */
    @Then("the request is not blocked by access control")
    public void notBlockedByAccessControl() {
        assertThat(ctx.response.statusCode())
                .as("expected to pass access control (body: %s)", ctx.response.asString())
                .isNotIn(401, 403);
    }

    @Then("the call succeeds")
    public void theCallSucceeds() {
        assertThat(ctx.response.statusCode()).as("body: %s", ctx.response.asString()).isBetween(200, 299);
        assertThat((Object) ctx.response.jsonPath().get("success")).isEqualTo(true);
    }

    @Then("the call is rejected with status {int} and error {string}")
    public void theCallIsRejected(int status, String errorFragment) {
        theResponseStatusIs(status);
        assertThat((Object) ctx.response.jsonPath().get("success")).isEqualTo(false);
        theErrorContains(errorFragment);
    }

    @Then("the error message contains {string}")
    public void theErrorContains(String fragment) {
        assertThat(ctx.response.jsonPath().getString("error"))
                .as("error message (body: %s)", ctx.response.asString())
                .containsIgnoringCase(Placeholders.resolve(fragment, ctx.variables));
    }

    @Then("the error code is {string}")
    public void theErrorCodeIs(String code) {
        assertThat(ctx.response.jsonPath().getString("code")).isEqualTo(code);
    }

    @Then("the response does not mention {string}")
    public void responseDoesNotMention(String word) {
        assertThat(ctx.response.asString()).doesNotContainIgnoringCase(word);
    }

    @Then("the response does not leak internals")
    public void noInternalsLeaked() {
        assertThat(ctx.response.asString()).doesNotContainIgnoringCase("prisma").doesNotContain("node_modules")
                .doesNotContainIgnoringCase("stack");
    }

    /** Resolves ${...} tokens, so field paths can reference remembered ids: data.find { it.id == ${product.id} }. */
    private String p(String text) {
        return Placeholders.resolve(text, ctx.variables);
    }

    // ─── headers ─────────────────────────────────────────────────────────────

    @Then("the response header {string} is present")
    public void headerPresent(String name) {
        assertThat(ctx.response.getHeader(name)).as("header %s", name).isNotNull();
    }

    @Then("the response header {string} is absent")
    public void headerAbsent(String name) {
        assertThat(ctx.response.getHeader(name)).as("header %s", name).isNull();
    }

    /** Set-Cookie can appear several times; any value containing the fragment satisfies the check. */
    @Then("the response header {string} contains {string}")
    public void headerContains(String name, String fragment) {
        assertThat(ctx.response.getHeaders().getValues(name))
                .as("header %s", name)
                .anySatisfy(v -> assertThat(v).containsIgnoringCase(fragment));
    }

    /** The session cookie alone must not authenticate a request (cross-site request forgery hardening). */
    @When("a caller holding {string} only as a cookie calls {string}")
    public void cookieOnlyCalls(String sessionAlias, String methodAndPath) {
        send(ApiClient.anonymous().header("Cookie", "token=" + ctx.variables.get(sessionAlias)), methodAndPath, null);
    }

    @Then("the response header {string} equals {string}")
    public void headerEquals(String name, String value) {
        assertThat(ctx.response.getHeader(name)).as("header %s", name).isEqualToIgnoringCase(value);
    }

    // ─── JSON fields ─────────────────────────────────────────────────────────

    @Then("the JSON field {string} equals {string}")
    public void theJsonFieldEquals(String field, String expected) {
        String want = Placeholders.resolve(expected, ctx.variables);
        Object actual = ctx.response.jsonPath().get(p(field));
        if (want.equals("null")) {
            assertThat(actual).as("%s", field).isNull();
        } else {
            assertThat(actual == null ? null : String.valueOf(actual)).as("%s (body: %s)", field, ctx.response.asString()).isEqualTo(want);
        }
    }

    @Then("the JSON field {string} is present")
    public void theJsonFieldIsPresent(String field) {
        assertThat((Object) ctx.response.jsonPath().get(p(field))).as("%s (body: %s)", field, ctx.response.asString()).isNotNull();
    }

    @Then("the JSON field {string} is absent")
    public void theJsonFieldIsAbsent(String field) {
        assertThat((Object) ctx.response.jsonPath().get(p(field))).as("%s (body: %s)", field, ctx.response.asString()).isNull();
    }

    @Then("the JSON field {string} contains {string}")
    public void theJsonFieldContains(String field, String fragment) {
        assertThat(ctx.response.jsonPath().getString(p(field))).containsIgnoringCase(Placeholders.resolve(fragment, ctx.variables));
    }

    /** Compares numerically, so {@code "10000"}, {@code 10000} and {@code 10000.00} are all equal. */
    @Then("the JSON amount {string} equals {string}")
    public void theJsonAmountEquals(String field, String expected) {
        Object actual = ctx.response.jsonPath().get(p(field));
        assertThat(actual).as("%s (body: %s)", field, ctx.response.asString()).isNotNull();
        assertThat(new BigDecimal(String.valueOf(actual)))
                .as("%s", field)
                .isEqualByComparingTo(new BigDecimal(Placeholders.resolve(expected, ctx.variables)));
    }

    @Then("the JSON amount {string} is {string} plus {int}")
    public void theJsonAmountIsPlus(String field, String base, int increment) {
        Object actual = ctx.response.jsonPath().get(p(field));
        assertThat(actual).as("%s (body: %s)", field, ctx.response.asString()).isNotNull();
        assertThat(new BigDecimal(String.valueOf(actual)))
                .as("%s", field)
                .isEqualByComparingTo(new BigDecimal(p(base)).add(BigDecimal.valueOf(increment)));
    }

    // ─── JSON lists ──────────────────────────────────────────────────────────

    @Then("the JSON list {string} has {int} item(s)")
    public void theJsonListHasItems(String path, int count) {
        assertThat(ctx.response.jsonPath().getList(p(path))).as("%s (body: %s)", path, ctx.response.asString()).hasSize(count);
    }

    @Then("the JSON list {string} is not empty")
    public void theJsonListIsNotEmpty(String path) {
        assertThat(ctx.response.jsonPath().getList(p(path))).as("%s", path).isNotEmpty();
    }

    @Then("the JSON list {string} contains an item whose {string} is {string}")
    public void listContainsItem(String path, String field, String expected) {
        assertThat(matching(path, field, expected))
                .as("an item of %s with %s=%s (body: %s)", path, field, expected, ctx.response.asString())
                .isNotEmpty();
    }

    @Then("the JSON list {string} has no item whose {string} is {string}")
    public void listHasNoItem(String path, String field, String expected) {
        assertThat(matching(path, field, expected))
                .as("items of %s with %s=%s", path, field, expected)
                .isEmpty();
    }

    @Then("the JSON list {string} is ordered by {string} as {string}")
    public void listIsOrdered(String path, String field, String expectedCsv) {
        List<Map<String, Object>> items = ctx.response.jsonPath().getList(p(path));
        List<String> actual = items.stream().map(i -> String.valueOf(i.get(field))).toList();
        List<String> want = List.of(Placeholders.resolve(expectedCsv, ctx.variables).split("\\s*,\\s*"));
        assertThat(actual.stream().filter(want::contains).toList()).as("order of %s.%s", path, field).isEqualTo(want);
    }

    private List<Map<String, Object>> matching(String path, String field, String expected) {
        String want = Placeholders.resolve(expected, ctx.variables);
        List<Map<String, Object>> items = ctx.response.jsonPath().getList(p(path));
        assertThat(items).as("list at %s (body: %s)", path, ctx.response.asString()).isNotNull();
        return items.stream().filter(i -> want.equals(String.valueOf(i.get(field)))).toList();
    }

    // ─── remembering and cleanup ─────────────────────────────────────────────

    @Then("I remember the JSON field {string} as {string}")
    public void rememberField(String field, String alias) {
        Object value = ctx.response.jsonPath().get(field);
        assertThat(value).as("%s to remember (body: %s)", field, ctx.response.asString()).isNotNull();
        ctx.variables.put(alias, value);
    }

    @Then("I remember the response data as {string}")
    public void rememberData(String alias) {
        Map<String, Object> data = ctx.response.jsonPath().getMap("data");
        assertThat(data).as("data object to remember (body: %s)", ctx.response.asString()).isNotNull();
        ctx.variables.put(alias, data);
    }

    @Then("I remember the item of {string} whose {string} is {string} as {string}")
    public void rememberItem(String path, String field, String expected, String alias) {
        List<Map<String, Object>> found = matching(path, field, expected);
        assertThat(found).as("item of %s with %s=%s", path, field, expected).isNotEmpty();
        ctx.variables.put(alias, found.get(0));
    }

    /**
     * Registers an undo-action. Placeholders are resolved when it runs, so it can be declared right
     * after the creating call. "Already gone" (404) counts as cleaned up.
     */
    @Then("afterwards {role} cleans up with {string}")
    public void registerCleanup(Role role, String methodAndPath) {
        ctx.cleanup.register(methodAndPath, () -> {
            String[] parts = Placeholders.resolve(methodAndPath, ctx.variables).split(" ", 2);
            Response res = specFor(role).request(parts[0].toUpperCase(), parts[1]);
            if (res.statusCode() >= 300 && res.statusCode() != 404) {
                throw new AssertionError(parts[0] + " " + parts[1] + " -> " + res.statusCode() + " " + res.asString());
            }
        });
    }

    @Then("afterwards {role} cleans up with {string} with:")
    public void registerCleanupWithBody(Role role, String methodAndPath, String body) {
        ctx.cleanup.register(methodAndPath, () -> {
            String[] parts = Placeholders.resolve(methodAndPath, ctx.variables).split(" ", 2);
            Response res = specFor(role).body(Placeholders.resolve(body, ctx.variables)).request(parts[0].toUpperCase(), parts[1]);
            if (res.statusCode() >= 300 && res.statusCode() != 404) {
                throw new AssertionError(parts[0] + " " + parts[1] + " -> " + res.statusCode() + " " + res.asString());
            }
        });
    }

    @Given("the scenario works with an identifier {string}")
    public void aUniqueIdentifier(String alias) {
        ctx.variables.put(alias, Placeholders.unique());
    }
}
