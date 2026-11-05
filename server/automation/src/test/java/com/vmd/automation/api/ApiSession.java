package com.vmd.automation.api;

import com.vmd.automation.core.ApiClient;
import com.vmd.automation.core.AuthManager;
import com.vmd.automation.core.Role;
import io.restassured.specification.RequestSpecification;

/**
 * Compatibility facade kept for the original route steps. New code should use {@link ApiClient} and
 * {@link AuthManager} directly.
 */
public final class ApiSession {

    private ApiSession() {}

    public static String accessToken() {
        return AuthManager.token(Role.ADMIN);
    }

    public static RequestSpecification anonymous() {
        return ApiClient.anonymous();
    }

    public static RequestSpecification authenticated() {
        return ApiClient.withToken(accessToken());
    }
}
