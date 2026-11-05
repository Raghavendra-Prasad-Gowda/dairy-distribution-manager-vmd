package com.vmd.automation.config;

/**
 * All environment-specific settings come from environment variables so the same
 * suite runs locally, against testing (develop) and against production (smoke).
 * Nothing secret is ever hard-coded here.
 */
public final class TestConfig {

    private TestConfig() {}

    /** Backend origin, no trailing slash and no /api/v1 (health lives at the root). */
    public static String apiBaseUrl() {
        return stripTrailingSlash(required("API_BASE_URL", "http://localhost:3001"));
    }


    /** Commit the backend is expected to be running (full or 7-char SHA). Empty = skip the "deployed build" check. */
    public static String expectedCommit() {
        return optional("EXPECTED_COMMIT", "");
    }


    public static String adminUsername() {
        return required("E2E_ADMIN_USERNAME", null);
    }

    public static String adminPassword() {
        return required("E2E_ADMIN_PASSWORD", null);
    }

    /**
     * Optional second account with role superadmin and no MFA. Needed by scenarios that create brands,
     * admin users or dispatchers (tag {@code @superadmin}). Unset = the E2E admin is used if it already
     * is a superadmin; otherwise those scenarios are skipped (or fail when {@link #strict()}).
     */
    public static String superAdminUsername() {
        return optional("E2E_SUPERADMIN_USERNAME", "");
    }

    public static String superAdminPassword() {
        return optional("E2E_SUPERADMIN_PASSWORD", "");
    }

    /** E2E_STRICT=true turns "prerequisite missing, scenario skipped" into a failure (use it in the release gate). */
    public static boolean strict() {
        return "true".equalsIgnoreCase(optional("E2E_STRICT", "false"));
    }

    public static int connectTimeoutMs() {
        return Integer.parseInt(optional("HTTP_CONNECT_TIMEOUT_MS", "30000"));
    }

    /** Render's free plan can take ~1 min to wake, so the read timeout is generous. */
    public static int readTimeoutMs() {
        return Integer.parseInt(optional("HTTP_READ_TIMEOUT_MS", "90000"));
    }




    private static String optional(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String required(String name, String fallback) {
        String value = optional(name, fallback == null ? "" : fallback);
        if (value.isEmpty()) {
            throw new IllegalStateException("Environment variable " + name + " is required but not set");
        }
        return value;
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
