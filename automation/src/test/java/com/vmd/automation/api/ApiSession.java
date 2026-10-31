package com.vmd.automation.api;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.vmd.automation.config.TestConfig;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.Map;

/**
 * Logs in once per test run as the E2E admin and reuses the JWT for every authenticated
 * scenario. Login is rate-limited (20/hour), so logging in per scenario would lock the
 * account out as the suite grows.
 */
public final class ApiSession {

    private static String accessToken;

    private ApiSession() {}

    public static synchronized String accessToken() {
        if (accessToken == null) {
            Response res = anonymous()
                    .body(Map.of(
                            "username", TestConfig.adminUsername(),
                            "password", TestConfig.adminPassword()))
                    .post("/api/v1/auth/login");
            assertThat(res.statusCode()).as("E2E admin login (body: %s)", res.asString()).isEqualTo(200);
            assertThat((Object) res.jsonPath().get("data.mfaVerifyRequired"))
                    .as("E2E admin must not have MFA enabled").isNotEqualTo(true);
            assertThat((Object) res.jsonPath().get("data.mfaSetupRequired"))
                    .as("E2E admin must not be marked MFA-required").isNotEqualTo(true);
            accessToken = res.jsonPath().getString("data.accessToken");
            assertThat(accessToken).as("accessToken in login response").isNotBlank();
        }
        return accessToken;
    }

    /** JSON request against the backend, no credentials. */
    public static RequestSpecification anonymous() {
        return given()
                .baseUri(TestConfig.apiBaseUrl())
                .contentType(ContentType.JSON)
                .accept(ContentType.JSON);
    }

    /** JSON request against the backend, as the E2E admin. */
    public static RequestSpecification authenticated() {
        return anonymous().header("Authorization", "Bearer " + accessToken());
    }
}
