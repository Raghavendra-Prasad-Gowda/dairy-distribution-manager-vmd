package com.vmd.automation.core;

import io.restassured.filter.Filter;
import io.restassured.filter.FilterContext;
import io.restassured.response.Response;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.FilterableResponseSpecification;
import java.util.ArrayList;
import java.util.List;

/**
 * Records every HTTP exchange of the running scenario so a failing scenario can carry the exact
 * requests and responses in its report. Credentials are masked: this text ends up in CI artifacts.
 */
public final class ExchangeLog implements Filter {

    private static final int MAX_BODY = 4000;
    private static final ThreadLocal<List<String>> EXCHANGES = ThreadLocal.withInitial(ArrayList::new);

    @Override
    public Response filter(FilterableRequestSpecification req, FilterableResponseSpecification res, FilterContext ctx) {
        Response response = ctx.next(req, res);
        Object body = req.getBody(); // generic return type: bind to Object so String.valueOf(Object) is chosen
        EXCHANGES.get().add(String.format(
                "%s %s%n  request : %s%n  response: %d %s",
                req.getMethod(),
                req.getURI(),
                mask(String.valueOf(body)),
                response.statusCode(),
                mask(response.asString())));
        return response;
    }

    public static void clear() {
        EXCHANGES.get().clear();
    }

    /** Everything recorded since {@link #clear()}, oldest first. */
    public static String dump() {
        return String.join(System.lineSeparator() + System.lineSeparator(), EXCHANGES.get());
    }

    static String mask(String body) {
        String masked = body
                .replaceAll("(?i)(\"(?:password|currentPassword|newPassword|accessToken|mfaToken|token|pin|currentPin|newPin)\"\\s*:\\s*)\"[^\"]*\"", "$1\"***\"");
        return masked.length() > MAX_BODY ? masked.substring(0, MAX_BODY) + "…(truncated)" : masked;
    }
}
