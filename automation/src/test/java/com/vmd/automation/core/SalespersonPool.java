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
 * wiping and deleting one salesperson per scenario costs four of them. Handing one back costs a single
 * ledger reset, which removes every payment, stock entry and balance, so the next scenario starts clean.
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

    /** Wipes whatever the scenario left on the salesperson. If that fails the salesperson stays lent out, never reused. */
    public static synchronized void release(Object id) {
        Response res = ApiClient.withToken(AuthManager.token(Role.SUPERADMIN))
                .body(Map.of("salespersonIds", List.of(id))).post("/api/v1/salespeople/reset-ledger");
        assertThat(res.statusCode()).as("reset pooled salesperson %s (%s)", id, res.asString()).isEqualTo(200);
        LENT.remove(id);
    }

    public static synchronized void shutdown() {
        for (Map<String, Object> person : ALL) SalespersonCleanup.remove(person.get("id"));
        ALL.clear();
        LENT.clear();
    }
}
