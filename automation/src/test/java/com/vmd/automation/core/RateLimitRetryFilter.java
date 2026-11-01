package com.vmd.automation.core;

import static io.restassured.RestAssured.given;

import io.restassured.filter.Filter;
import io.restassured.filter.FilterContext;
import io.restassured.response.Response;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.FilterableResponseSpecification;
import io.restassured.specification.RequestSpecification;
import java.util.Set;

/**
 * Makes the suite resilient to two environmental conditions that are not product defects:
 * <ul>
 *   <li><b>429</b> - the backend rate-limits bulk and /salespeople routes (30 requests/min). The request
 *       was rejected before it did anything, so it is safe to repeat for every method after the wait the
 *       server asks for.</li>
 *   <li><b>502/503/504 on GET</b> - Render's free plan answers these while a sleeping service wakes up.</li>
 * </ul>
 * Writes are never retried on 5xx: repeating a POST that may have succeeded would corrupt test data.
 */
public final class RateLimitRetryFilter implements Filter {

    private static final int MAX_RETRIES = 4;
    private static final long MAX_WAIT_MS = 65_000;
    private static final Set<Integer> COLD_START = Set.of(502, 503, 504);

    @Override
    public Response filter(FilterableRequestSpecification req, FilterableResponseSpecification res, FilterContext ctx) {
        Response response = ctx.next(req, res);
        for (int attempt = 1; attempt <= MAX_RETRIES && shouldRetry(req, response); attempt++) {
            sleep(waitMillis(response, attempt));
            response = replay(req);
        }
        return response;
    }

    /**
     * RestAssured's filter chain is single-use: calling {@code ctx.next} a second time returns null.
     * A retry therefore re-sends the very same request (method, URL, headers, body) on a fresh spec.
     */
    private static Response replay(FilterableRequestSpecification req) {
        RequestSpecification spec = given().config(ApiClient.restAssuredConfig()).headers(req.getHeaders());
        Object body = req.getBody();
        if (body != null) spec = spec.body(body);
        return spec.request(req.getMethod(), req.getURI());
    }

    private static boolean shouldRetry(FilterableRequestSpecification req, Response response) {
        int status = response.statusCode();
        // A limit that resets in an hour (login) is not worth waiting for: fail fast and say why.
        if (status == 429) return !longWait(response);
        return COLD_START.contains(status) && "GET".equalsIgnoreCase(req.getMethod());
    }

    private static boolean longWait(Response response) {
        String retryAfter = response.getHeader("Retry-After");
        return retryAfter != null && retryAfter.matches("\\d+") && Long.parseLong(retryAfter) * 1000 > MAX_WAIT_MS;
    }

    private static long waitMillis(Response response, int attempt) {
        String retryAfter = response.getHeader("Retry-After");
        if (retryAfter != null && retryAfter.matches("\\d+")) {
            return Math.min(Long.parseLong(retryAfter) * 1000 + 250, MAX_WAIT_MS);
        }
        return Math.min(2_000L * (1L << (attempt - 1)), MAX_WAIT_MS);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while waiting to retry", e);
        }
    }
}
