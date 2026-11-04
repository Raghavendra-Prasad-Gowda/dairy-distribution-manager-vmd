package com.vmd.automation.core;

import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.config.TestConfig;
import io.restassured.response.Response;
import java.security.SecureRandom;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import org.opentest4j.TestAbortedException;

/**
 * Hands out bearer tokens per {@link Role}.
 *
 * <p>Login is rate-limited (20/hour per IP), so every role logs in at most once per run and the token
 * is reused. ADMIN and SUPERADMIN come from configured accounts. DISPATCHER and SALESMAN are created
 * on demand through the API as run-scoped users ({@code E2E-...}) and removed by {@link #shutdown()}.
 *
 * <p>A role that cannot be provided is a missing prerequisite, not a product failure: the scenario is
 * skipped, or fails when {@code E2E_STRICT=true}.
 */
public final class AuthManager {

    private record Session(String token, String role, long id) {}

    private static final Map<Role, Session> SESSIONS = new EnumMap<>(Role.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static String salesmanUsername;
    private static String salesmanPassword;
    private static Long salesmanId;
    private static String dispatcherUsername;
    private static String dispatcherPassword;
    private static Long dispatcherAdminUserId;

    private AuthManager() {}

    /** Token for the role, or a skip/failure when the environment cannot provide it. */
    public static synchronized String token(Role role) {
        if (role == Role.ANONYMOUS) throw new IllegalArgumentException("ANONYMOUS has no token");
        return tryToken(role).orElseThrow(() -> missing(role));
    }

    public static synchronized boolean available(Role role) {
        return role == Role.ANONYMOUS || tryToken(role).isPresent();
    }

    private static Optional<String> tryToken(Role role) {
        if (SESSIONS.containsKey(role)) return Optional.of(SESSIONS.get(role).token());
        Optional<Session> created = switch (role) {
            case ADMIN -> Optional.of(login(TestConfig.adminUsername(), TestConfig.adminPassword(), true));
            case SUPERADMIN -> superAdminSession();
            case DISPATCHER -> dispatcherSession();
            case SALESMAN -> salesmanSession();
            case ANONYMOUS -> Optional.empty();
        };
        created.ifPresent(s -> SESSIONS.put(role, s));
        return created.map(Session::token);
    }

    /** The id of the run-scoped salesman, for scenarios that check "my own data" scoping. */
    public static synchronized long salesmanId() {
        token(Role.SALESMAN);
        return salesmanId;
    }

    /** Credentials of a run-scoped user, for scenarios that change their own password. */
    public static synchronized java.util.Map<String, Object> credentials(Role role) {
        token(role);
        return switch (role) {
            case SALESMAN -> java.util.Map.of("id", salesmanId, "username", salesmanUsername, "password", salesmanPassword);
            case DISPATCHER -> java.util.Map.of("id", dispatcherAdminUserId, "username", dispatcherUsername, "password", dispatcherPassword);
            default -> throw new IllegalArgumentException(role + " has no run-scoped credentials");
        };
    }

    // ─── sessions ────────────────────────────────────────────────────────────

    private static Optional<Session> superAdminSession() {
        if (!TestConfig.superAdminUsername().isEmpty()) {
            return Optional.of(login(TestConfig.superAdminUsername(), TestConfig.superAdminPassword(), true, "superadmin"));
        }
        // No dedicated account: fine if the E2E admin account already is a superadmin.
        tryToken(Role.ADMIN);
        Session admin = SESSIONS.get(Role.ADMIN);
        return admin != null && "superadmin".equals(admin.role()) ? Optional.of(admin) : Optional.empty();
    }

    private static Optional<Session> dispatcherSession() {
        Optional<String> superToken = tryToken(Role.SUPERADMIN);
        if (superToken.isEmpty()) return Optional.empty();
        String username = "e2e-dsp-" + suffix();
        String password = "E2e!" + suffix() + "aA1";
        Response created = ApiClient.withToken(superToken.get())
                .body(Map.of("username", username, "password", password, "role", "dispatcher"))
                .post("/api/v1/admin-users");
        assertThat(created.statusCode()).as("create run-scoped dispatcher (%s)", created.asString()).isEqualTo(201);
        dispatcherAdminUserId = created.jsonPath().getLong("data.id");
        dispatcherUsername = username;
        dispatcherPassword = password;
        return Optional.of(login(username, password, false, "dispatcher"));
    }

    private static Optional<Session> salesmanSession() {
        salesmanUsername = "e2e-sm-" + suffix();
        salesmanPassword = "E2e!" + suffix() + "aA1";
        Response created = ApiClient.withToken(token(Role.ADMIN))
                .body(Map.of("name", "E2E Salesman " + suffix(), "username", salesmanUsername, "password", salesmanPassword))
                .post("/api/v1/salespeople");
        assertThat(created.statusCode()).as("create run-scoped salesman (%s)", created.asString()).isEqualTo(201);
        salesmanId = created.jsonPath().getLong("data.id");
        Session session = login(salesmanUsername, salesmanPassword, false, "salesman");
        return Optional.of(new Session(session.token(), session.role(), salesmanId));
    }

    private static Session login(String username, String password, boolean configuredAccount) {
        return login(username, password, configuredAccount, null);
    }

    /** Signs in and, when a role is expected, proves the account really signs in as that role. */
    private static Session login(String username, String password, boolean configuredAccount, String expectedRole) {
        Response res = ApiClient.anonymous()
                .body(Map.of("username", username, "password", password))
                .post("/api/v1/auth/login");
        assertThat(res.statusCode()).as("login as %s (body: %s)", username, res.asString()).isEqualTo(200);
        assertThat((Object) res.jsonPath().get("data.mfaVerifyRequired"))
                .as("%s must not have MFA enabled", username).isNotEqualTo(true);
        assertThat((Object) res.jsonPath().get("data.mfaSetupRequired"))
                .as("%s must not be marked MFA-required", username).isNotEqualTo(true);
        String token = res.jsonPath().getString("data.accessToken");
        assertThat(token).as("accessToken for %s", username).isNotBlank();
        String role = res.jsonPath().getString("data.role");
        if (expectedRole != null) assertThat(role).as("role %s signs in as", username).isEqualTo(expectedRole);
        return new Session(token, role, 0);
    }

    // ─── lifecycle ───────────────────────────────────────────────────────────

    /** Removes the run-scoped users. Called once after the whole run. */
    public static synchronized void shutdown() {
        if (SESSIONS.containsKey(Role.ADMIN)) SalespersonPool.shutdown();
        if (salesmanId != null && SESSIONS.containsKey(Role.ADMIN)) {
            SalespersonCleanup.remove(salesmanId);
        }
        if (dispatcherAdminUserId != null && SESSIONS.containsKey(Role.SUPERADMIN)) {
            ApiClient.withToken(SESSIONS.get(Role.SUPERADMIN).token()).delete("/api/v1/admin-users/" + dispatcherAdminUserId);
        }
        SESSIONS.clear();
        salesmanId = null;
        dispatcherAdminUserId = null;
    }

    private static Error missing(Role role) {
        String hint = switch (role) {
            case SUPERADMIN, DISPATCHER -> "set E2E_SUPERADMIN_USERNAME / E2E_SUPERADMIN_PASSWORD (an MFA-free superadmin)";
            default -> "check the E2E_* credentials";
        };
        String message = "Prerequisite missing: no " + role + " session available - " + hint;
        if (TestConfig.strict()) return new AssertionError(message + " [E2E_STRICT=true]");
        throw new TestAbortedException(message);
    }

    private static String suffix() {
        return Long.toString(System.currentTimeMillis(), 36) + Integer.toString(RANDOM.nextInt(1296), 36);
    }
}
