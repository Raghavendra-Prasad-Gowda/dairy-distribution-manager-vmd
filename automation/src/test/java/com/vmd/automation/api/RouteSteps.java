package com.vmd.automation.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import io.cucumber.java.After;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Steps for /api/v1/routes against a real deployment and database. Every route is a
 * throwaway named "E2E-..." and is hard-deleted after the scenario, pass or fail.
 */
public class RouteSteps {

    private static final AtomicInteger SEQ = new AtomicInteger();

    private final TestContext ctx;

    public RouteSteps(TestContext ctx) {
        this.ctx = ctx;
    }

    /** Unique per run and per call, so parallel/previous runs never collide on (brandId, routeNumber). */
    private static String uniqueRouteNumber() {
        return "E2E-" + System.currentTimeMillis() + "-" + SEQ.incrementAndGet();
    }

    private Map<String, Object> createRoute(String routeNumber) {
        Response res = ApiSession.authenticated()
                .body(Map.of("brandId", ctx.brandId, "routeNumber", routeNumber))
                .post("/api/v1/routes");
        assertThat(res.statusCode()).as("create route (body: %s)", res.asString()).isEqualTo(201);
        Map<String, Object> route = res.jsonPath().getMap("data");
        ctx.createdRouteIds.add((Integer) route.get("id"));
        return route;
    }

    /** Active routes of the scenario's brand, read back from the database through the API. */
    private List<Map<String, Object>> activeRoutesOfBrand() {
        Response res = ApiSession.authenticated()
                .queryParam("brandId", ctx.brandId)
                .get("/api/v1/routes");
        assertThat(res.statusCode()).as("list routes (body: %s)", res.asString()).isEqualTo(200);
        return res.jsonPath().getList("data");
    }

    private Map<String, Object> listedRoute(int id) {
        return activeRoutesOfBrand().stream()
                .filter(r -> Integer.valueOf(id).equals(r.get("id")))
                .findFirst()
                .orElse(null);
    }

    private String withPlaceholders(String body) {
        String out = body;
        if (ctx.routeNumber != null) out = out.replace("<routeNumber>", ctx.routeNumber);
        if (ctx.secondRouteNumber != null) out = out.replace("<secondRouteNumber>", ctx.secondRouteNumber);
        if (out.contains("<newRouteNumber>")) {
            String fresh = uniqueRouteNumber();
            out = out.replace("<newRouteNumber>", fresh);
        }
        return out;
    }

    // ─── Given ───────────────────────────────────────────────────────────────

    @Given("the {string} brand exists")
    public void theBrandExists(String brandName) {
        Response res = ApiSession.authenticated().get("/api/v1/brands");
        assertThat(res.statusCode()).as("list brands (body: %s)", res.asString()).isEqualTo(200);
        List<Map<String, Object>> brands = res.jsonPath().getList("data");
        ctx.brandId = brands.stream()
                .filter(b -> brandName.equalsIgnoreCase(String.valueOf(b.get("name"))))
                .map(b -> (Integer) b.get("id"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("brand \"" + brandName + "\" not found in " + brands));
    }

    @Given("I have created a throwaway route")
    public void iHaveCreatedAThrowawayRoute() {
        Map<String, Object> route = createRoute(uniqueRouteNumber());
        ctx.routeId = (Integer) route.get("id");
        ctx.routeNumber = (String) route.get("routeNumber");
    }

    @Given("I have created a second throwaway route")
    public void iHaveCreatedASecondThrowawayRoute() {
        Map<String, Object> route = createRoute(uniqueRouteNumber());
        ctx.secondRouteId = (Integer) route.get("id");
        ctx.secondRouteNumber = (String) route.get("routeNumber");
    }

    // ─── When ────────────────────────────────────────────────────────────────

    /**
     * Placeholders in the body: {@code <routeNumber>}, {@code <secondRouteNumber>} (the created
     * routes' numbers) and {@code <newRouteNumber>} (a fresh unique number).
     */
    @When("I update the route with:")
    public void iUpdateTheRouteWith(String body) {
        ctx.response = ApiSession.authenticated().body(withPlaceholders(body)).put("/api/v1/routes/" + ctx.routeId);
    }

    @When("I update the second route with:")
    public void iUpdateTheSecondRouteWith(String body) {
        ctx.response = ApiSession.authenticated()
                .body(withPlaceholders(body))
                .put("/api/v1/routes/" + ctx.secondRouteId);
    }

    @When("I update the route without a token with:")
    public void iUpdateTheRouteWithoutATokenWith(String body) {
        ctx.response = ApiSession.anonymous().body(withPlaceholders(body)).put("/api/v1/routes/" + ctx.routeId);
    }

    @When("I update route {string} with:")
    public void iUpdateRouteWith(String rawId, String body) {
        ctx.response = ApiSession.authenticated().body(withPlaceholders(body)).put("/api/v1/routes/" + rawId);
    }

    // ─── Then ────────────────────────────────────────────────────────────────

    @Then("the response route number is the new route number")
    public void theResponseRouteNumberIsTheNewRouteNumber() {
        String returned = ctx.response.jsonPath().getString("data.routeNumber");
        assertThat(returned).startsWith("E2E-").isNotEqualTo(ctx.routeNumber);
        ctx.routeNumber = returned; // later steps compare against the stored value
    }

    @Then("the route is listed for its brand with display order {int}")
    public void theRouteIsListedWithDisplayOrder(int displayOrder) {
        Map<String, Object> route = listedRoute(ctx.routeId);
        assertThat(route).as("route %d in active routes of brand %d", ctx.routeId, ctx.brandId).isNotNull();
        assertThat(route.get("routeNumber")).isEqualTo(ctx.routeNumber);
        assertThat(route.get("displayOrder")).isEqualTo(displayOrder);
        assertThat(route.get("brandId")).isEqualTo(ctx.brandId);
    }

    @Then("the route is listed for its brand unchanged")
    public void theRouteIsListedUnchanged() {
        Map<String, Object> route = listedRoute(ctx.routeId);
        assertThat(route).as("route %d in active routes of brand %d", ctx.routeId, ctx.brandId).isNotNull();
        assertThat(route.get("routeNumber")).isEqualTo(ctx.routeNumber);
        assertThat(route.get("brandId")).isEqualTo(ctx.brandId);
    }

    @Then("the second route keeps its own route number")
    public void theSecondRouteKeepsItsOwnRouteNumber() {
        Map<String, Object> route = listedRoute(ctx.secondRouteId);
        assertThat(route).as("second route in active routes").isNotNull();
        assertThat(route.get("routeNumber")).isEqualTo(ctx.secondRouteNumber);
    }

    @Then("the route is not listed among its brand's active routes")
    public void theRouteIsNotListed() {
        assertThat(listedRoute(ctx.routeId)).as("route %d should be hidden once inactive", ctx.routeId).isNull();
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────────

    @After("@routes")
    public void deleteCreatedRoutes() {
        for (Integer id : ctx.createdRouteIds) {
            Response res = ApiSession.authenticated().delete("/api/v1/routes/" + id);
            if (res.statusCode() != 200 && res.statusCode() != 404) {
                throw new AssertionError("cleanup: could not delete route " + id + ": " + res.asString());
            }
        }
    }
}
