package com.vmd.automation.core;

import static org.assertj.core.api.Assertions.assertThat;

import io.restassured.response.Response;
import java.util.List;
import java.util.Map;

/**
 * Removes a salesperson the suite created, whatever history the scenarios gave them.
 *
 * <p>Delete first (one call when there is no history). If the backend refuses because of transactions,
 * wipe the ledger (superadmin only) and delete again. A salesperson that still cannot be deleted is
 * deactivated, which hides them from every list.
 */
public final class SalespersonCleanup {

    private SalespersonCleanup() {}

    public static void remove(Object id) {
        String admin = AuthManager.token(Role.ADMIN);
        Response del = ApiClient.withToken(admin).delete("/api/v1/salespeople/" + id);
        if (del.statusCode() == 400 && AuthManager.available(Role.SUPERADMIN)) {
            ApiClient.withToken(AuthManager.token(Role.SUPERADMIN))
                    .body(Map.of("salespersonIds", List.of(id))).post("/api/v1/salespeople/reset-ledger");
            del = ApiClient.withToken(admin).delete("/api/v1/salespeople/" + id);
        }
        if (del.statusCode() == 400) {
            ApiClient.withToken(admin).body(Map.of("isActive", false)).put("/api/v1/salespeople/" + id);
        } else {
            assertThat(del.statusCode()).as("delete salesperson %s (%s)", id, del.asString()).isIn(200, 404);
        }
    }
}
