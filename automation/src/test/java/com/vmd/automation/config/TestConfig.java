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
