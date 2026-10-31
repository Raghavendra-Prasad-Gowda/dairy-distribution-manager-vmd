package com.vmd.automation.fixtures;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.TestContext;
import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.Placeholders;
import com.vmd.automation.core.Role;
import com.vmd.automation.core.SalespersonCleanup;
import com.vmd.automation.core.SalespersonPool;
import io.restassured.response.Response;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Builds the throwaway records scenarios depend on, through the public API only. Each builder
 * registers its own undo-action, so a scenario never has to remember what to delete. Everything is
 * named {@code E2E-...}; nothing touches the real brands, products or salespeople.
 *
 * <p>The API cannot hard-delete brands or products, so those are archived/deactivated: they disappear
 * from every list but their rows remain. That is why dairy ledger scenarios use a throwaway brand
 * rather than writing balances into a real one.
 */
public final class Fixtures {

    private final TestContext ctx;

    public Fixtures(TestContext ctx) {
        this.ctx = ctx;
    }

    /** Needs a superadmin: only superadmins may create brands. */
    public Map<String, Object> brand(String alias) {
        Map<String, Object> brand = create(Role.SUPERADMIN, "/api/v1/brands", Map.of("name", Placeholders.unique()), "brand");
        ctx.cleanup.register("archive brand " + brand.get("id"), () -> {
            Response res = ApiClient.withToken(AuthManager.token(Role.SUPERADMIN))
                    .body(Map.of("isArchived", true)).put("/api/v1/brands/" + brand.get("id"));
            assertThat(res.statusCode()).as("archive brand (%s)", res.asString()).isIn(200, 404);
        });
        return remember(alias, brand);
    }

    public Map<String, Object> category(String alias, Map<String, Object> brand) {
        Map<String, Object> category = create(Role.ADMIN, "/api/v1/categories",
                Map.of("brandId", brand.get("id"), "name", Placeholders.unique()), "category");
        registerDelete(Role.ADMIN, "/api/v1/categories/" + category.get("id"));
        return remember(alias, category);
    }

    /** {@code overrides} are merged over the defaults (piece, cost 10, selling 12). */
    public Map<String, Object> product(String alias, Map<String, Object> brand, Map<String, Object> overrides) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("brandId", brand.get("id"));
        body.put("name", Placeholders.unique());
        body.put("unitType", "piece");
        body.put("costPrice", 10);
        body.put("sellingPrice", 12);
        body.putAll(overrides);
        Map<String, Object> product = create(Role.ADMIN, "/api/v1/products", body, "product");
        registerDelete(Role.ADMIN, "/api/v1/products/" + product.get("id")); // soft delete: deactivates
        return remember(alias, product);
    }

    public Map<String, Object> route(String alias, Map<String, Object> brand) {
        Map<String, Object> route = create(Role.ADMIN, "/api/v1/routes",
                Map.of("brandId", brand.get("id"), "routeNumber", Placeholders.unique()), "route");
        registerDelete(Role.ADMIN, "/api/v1/routes/" + route.get("id"));
        return remember(alias, route);
    }

    /**
     * A salesperson with an empty ledger, borrowed from the run's pool and wiped when the scenario ends.
     * Falls back to a fresh record when no superadmin is available to wipe it.
     */
    public Map<String, Object> cleanSalesperson(String alias) {
        if (!AuthManager.available(Role.SUPERADMIN)) return salesperson(alias, false);
        Map<String, Object> person = SalespersonPool.acquire();
        Object id = person.get("id");
        ctx.cleanup.register("return pooled salesperson " + id, () -> SalespersonPool.release(id));
        return remember(alias, person);
    }

    public Map<String, Object> salesperson(String alias, boolean canLogIn) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "E2E " + Placeholders.unique());
        String password = null;
        if (canLogIn) {
            body.put("username", "e2e-" + Placeholders.unique().toLowerCase());
            password = "E2e!" + Long.toString(System.nanoTime(), 36) + "aA1";
            body.put("password", password);
        }
        Map<String, Object> salesperson = new LinkedHashMap<>(create(Role.ADMIN, "/api/v1/salespeople", body, "salesperson"));
        if (password != null) salesperson.put("password", password);
        Object id = salesperson.get("id");
        ctx.cleanup.register("remove salesperson " + id, () -> SalespersonCleanup.remove(id));
        return remember(alias, salesperson);
    }

    /** A throwaway admin-tier user (needs a superadmin); deleted afterwards. The generated password is kept on the entity. */
    public Map<String, Object> adminUser(String alias, String role) {
        String password = "E2e!" + Long.toString(System.nanoTime(), 36) + "aA1";
        Map<String, Object> user = new LinkedHashMap<>(create(Role.SUPERADMIN, "/api/v1/admin-users",
                Map.of("username", "e2e-" + Placeholders.unique().toLowerCase(), "password", password, "role", role), "admin user"));
        user.put("password", password);
        registerDelete(Role.SUPERADMIN, "/api/v1/admin-users/" + user.get("id"));
        return remember(alias, user);
    }

    // ─── internals ───────────────────────────────────────────────────────────

    private Map<String, Object> create(Role role, String path, Map<String, Object> body, String what) {
        Response res = ApiClient.withToken(AuthManager.token(role)).body(body).post(path);
        assertThat(res.statusCode()).as("fixture: create %s (body: %s)", what, res.asString()).isEqualTo(201);
        return res.jsonPath().getMap("data");
    }

    private void registerDelete(Role role, String path) {
        ctx.cleanup.register("DELETE " + path, () -> {
            Response res = ApiClient.withToken(AuthManager.token(role)).delete(path);
            assertThat(res.statusCode()).as("DELETE %s (%s)", path, res.asString()).isIn(200, 404);
        });
    }

    private Map<String, Object> remember(String alias, Map<String, Object> entity) {
        ctx.variables.put(alias, entity);
        return entity;
    }
}
