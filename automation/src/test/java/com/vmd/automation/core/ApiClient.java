package com.vmd.automation.core;

import static io.restassured.RestAssured.given;

import com.vmd.automation.config.TestConfig;
import io.restassured.config.HttpClientConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;

/**
 * The single place a request specification is built. Every client, fixture and step goes through
 * here, so base URL, timeouts, JSON headers, retry and exchange logging are configured exactly once.
 */
public final class ApiClient {

    private ApiClient() {}

    static RestAssuredConfig restAssuredConfig() {
        return RestAssuredConfig.config()
                .httpClient(HttpClientConfig.httpClientConfig()
                        .setParam("http.connection.timeout", TestConfig.connectTimeoutMs())
                        .setParam("http.socket.timeout", TestConfig.readTimeoutMs()));
    }

    /** JSON request with no credentials. */
    public static RequestSpecification anonymous() {
        return given()
                .config(restAssuredConfig())
                .baseUri(TestConfig.apiBaseUrl())
                .contentType(ContentType.JSON)
                .accept(ContentType.JSON)
                .filter(new ExchangeLog())          // outermost: records the final answer
                .filter(new RateLimitRetryFilter());
    }

    /** JSON request carrying a bearer token. */
    public static RequestSpecification withToken(String token) {
        return anonymous().header("Authorization", "Bearer " + token);
    }
}
