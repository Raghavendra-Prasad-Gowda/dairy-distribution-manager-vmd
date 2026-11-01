package com.vmd.automation;

import com.vmd.automation.core.Cleanup;
import io.restassured.response.Response;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-scenario state shared between step classes (PicoContainer creates one
 * instance per scenario and injects it into every step class that asks for it).
 */
public class TestContext {

    /** The most recent API response. */
    public Response response;

    /** Entities and values remembered under an alias, addressable as {@code ${alias.field}}. */
    public final Map<String, Object> variables = new HashMap<>();

    /** Undo-actions for everything this scenario created; run after the scenario, newest first. */
    public final Cleanup cleanup = new Cleanup();

    /** The numeric id of a remembered entity, e.g. {@code idOf("milk")} for a product set up earlier. */
    public long idOf(String alias) {
        Object entity = variables.get(alias);
        if (!(entity instanceof Map<?, ?> map) || map.get("id") == null) {
            throw new IllegalStateException("No entity \"" + alias + "\" with an id was set up earlier in this scenario");
        }
        return ((Number) map.get("id")).longValue();
    }

    // Routes (@routes scenarios, RouteSteps)
    public Integer brandId;
    public Integer routeId;
    public String routeNumber;
    public Integer secondRouteId;
    public String secondRouteNumber;
    /** Every route a scenario created; RouteSteps deletes them all in an @After hook. */
    public final List<Integer> createdRouteIds = new ArrayList<>();
}
