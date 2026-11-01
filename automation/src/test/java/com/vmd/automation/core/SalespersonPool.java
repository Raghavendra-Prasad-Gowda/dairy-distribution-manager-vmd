package com.vmd.automation.core;

import static org.assertj.core.api.Assertions.assertThat;

import io.restassured.response.Response;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A few salespeople, created once per run and lent to scenarios that only need "a salesperson with
 * an empty ledger" (stock entries, collections, prices).
 *
 * <p>Why a pool: the backend rate-limits every {@code /salespeople} call to 30 per minute, and creating,
 * wiping and deleting one salesperson per scenario costs several of them. Handing one back uses only
 * endpoints without that limit (payments and stock entries are deleted one by one), so the next scenario
 * starts with an empty ledger.
 *
 * <p>Scenarios that edit or delete salespeople must not use the pool; they create their own.
 */
public final class SalespersonPool {

    private static final List<Map<String, Object>> ALL = new ArrayList<>();
    private static final Set<Object> LENT = new HashSet<>();

    private SalespersonPool() {}

    public static synchronized Map<String, Object> acquire() {
        for (Map<String, Object> person : ALL) {
            if (LENT.add(person.get("id"))) return new LinkedHashMap<>(person);
        }
        Response res = ApiClient.withToken(AuthManager.token(Role.ADMIN))
                .body(Map.of("name", "E2E Pool " + (ALL.size() + 1) + " " + Placeholders.unique()))
                .post("/api/v1/salespeople");
        assertThat(res.statusCode()).as("create pooled salesperson (%s)", res.asString()).isEqualTo(201);
        Map<String, Object> person = res.jsonPath().getMap("data");
        ALL.add(person);
        LENT.add(person.get("id"));
        return new LinkedHashMap<>(person);
    }

    /**
     * Takes back whatever the scenario left on the salesperson by deleting their payments and stock
     * entries through endpoints that are not rate-limited (each delete re-balances the ledger), then
     * proves every balance is back to zero. If it is not, the salesperson stays lent out and is never
     * reused, so one broken scenario cannot contaminate the next.
     */
    public static synchronized void release(Object id) {
        String admin = AuthManager.token(Role.ADMIN);
        deleteAll(admin, "/api/v1/salesperson-payments?salespersonId=" + id, "/api/v1/salesperson-payments/");
        deleteAll(admin, "/api/v1/dispatches?salespersonId=" + id, "/api/v1/dispatches/");
        Response history = ApiClient.withToken(admin)
                .get("/api/v1/salesperson-balance/" + id + "/history?from=2000-01-01&to=2100-01-01&limit=100");
        assertThat(history.statusCode()).as("balance history of pooled salesperson %s (%s)", id, history.asString()).isEqualTo(200);
        List<Map<String, Object>> rows = history.jsonPath().getList("data.items");
        assertThat(rows).as("balance rows of pooled salesperson %s", id)
                .allSatisfy(r -> assertThat(new java.math.BigDecimal(String.valueOf(r.get("closingBalance")))).isZero());
        LENT.remove(id);
    }

    private static void deleteAll(String admin, String listPath, String itemPath) {
        Response list = ApiClient.withToken(admin).get(listPath);
        assertThat(list.statusCode()).as("list %s (%s)", listPath, list.asString()).isEqualTo(200);
        List<Map<String, Object>> rows = list.jsonPath().getList("data");
        for (Map<String, Object> row : rows) {
            Response del = ApiClient.withToken(admin).delete(itemPath + row.get("id"));
            assertThat(del.statusCode()).as("delete %s%s (%s)", itemPath, row.get("id"), del.asString()).isIn(200, 404);
        }
    }

    public static synchronized void shutdown() {
        for (Map<String, Object> person : ALL) SalespersonCleanup.remove(person.get("id"));
        ALL.clear();
        LENT.clear();
    }
}
