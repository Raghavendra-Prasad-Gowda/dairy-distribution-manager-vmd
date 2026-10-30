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

    /** Frontend origin, no trailing slash. */
    public static String webBaseUrl() {
        return stripTrailingSlash(required("WEB_BASE_URL", "http://localhost:5173"));
    }

    /** Full git SHA of the commit under test. Empty = skip the "deployed build" check. */
    public static String expectedCommit() {
        return optional("EXPECTED_COMMIT", "");
    }

    /** Vercel "Protection Bypass for Automation" secret. Empty = frontend is not protected. */
    public static String vercelBypassSecret() {
        return optional("VERCEL_BYPASS_SECRET", "");
    }

    public static String adminUsername() {
        return required("E2E_ADMIN_USERNAME", null);
    }

    public static String adminPassword() {
        return required("E2E_ADMIN_PASSWORD", null);
    }

    /** Local Chromium binary to use instead of Playwright's downloaded one. Optional. */
    public static String chromiumExecutablePath() {
        return optional("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "");
    }

    public static boolean headless() {
        return !"false".equalsIgnoreCase(optional("HEADLESS", "true"));
    }

    /** Render's free plan sleeps; the first request after a deploy can take ~1 min. */
    public static int uiTimeoutMs() {
        return Integer.parseInt(optional("UI_TIMEOUT_MS", "60000"));
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
