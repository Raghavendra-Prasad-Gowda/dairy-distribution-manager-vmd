package com.vmd.automation.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Builds tokens the backend must reject. The real signing secret is never known to the suite, so every
 * token produced here is either unsigned or signed with a key the server does not trust.
 */
public final class JwtForge {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private JwtForge() {}

    /** {@code alg: none} - the classic "skip signature verification" attack. */
    public static String unsigned(String role) {
        return b64(Map.of("alg", "none", "typ", "JWT")) + "." + b64(claims(role, 3600, 0)) + ".";
    }

    /** Correct structure and claims, wrong key. */
    public static String signedWithWrongSecret(String role) {
        return signed(role, 3600, 0, "not-the-servers-secret-not-the-servers-secret");
    }

    /** Signed with the wrong key and valid in the future only. */
    public static String notYetValid(String role) {
        return signed(role, 7200, 3600, "not-the-servers-secret-not-the-servers-secret");
    }

    /** Reads a claim from the unverified payload of a token the suite itself obtained. */
    public static Object claim(String token, String name) {
        try {
            String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
            return JSON.readValue(payload, Map.class).get(name);
        } catch (Exception e) {
            throw new IllegalStateException("cannot read claim " + name + " from token", e);
        }
    }

    private static Map<String, Object> claims(String role, long validForSeconds, long notBeforeInSeconds) {
        long now = Instant.now().getEpochSecond();
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("id", 1);
        claims.put("role", role);
        claims.put("adminUserId", 1);
        claims.put("iat", now);
        if (notBeforeInSeconds > 0) claims.put("nbf", now + notBeforeInSeconds);
        claims.put("exp", now + validForSeconds);
        return claims;
    }

    private static String signed(String role, long validForSeconds, long notBeforeInSeconds, String secret) {
        String unsignedPart = b64(Map.of("alg", "HS256", "typ", "JWT")) + "." + b64(claims(role, validForSeconds, notBeforeInSeconds));
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return unsignedPart + "." + B64.encodeToString(mac.doFinal(unsignedPart.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String b64(Object json) {
        try {
            return B64.encodeToString(JSON.writeValueAsBytes(json));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
