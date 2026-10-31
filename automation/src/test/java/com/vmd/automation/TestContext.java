package com.vmd.automation;

import io.restassured.response.Response;
import java.util.ArrayList;
import java.util.List;

/**
 * Per-scenario state shared between step classes (PicoContainer creates one
 * instance per scenario and injects it into every step class that asks for it).
 */
public class TestContext {

    // API
    public Response response;

    // Routes (@routes scenarios)
    public Integer brandId;
    public Integer routeId;
    public String routeNumber;
    public Integer secondRouteId;
    public String secondRouteNumber;
    /** Every route a scenario created; RouteSteps deletes them all in an @After hook. */
    public final List<Integer> createdRouteIds = new ArrayList<>();
}
