@api @security
Feature: Transport and token hardening
  Forged or unsigned tokens are refused, browsers are told to be careful with responses, and error
  responses never reveal how the server is built.

  Scenario Outline: Tokens that were not signed with the server's key are refused
    When a caller with <kind> token for role <role> calls "GET /api/v1/routes"
    Then the response status is 401

    Examples:
      | kind             | role       |
      | an-unsigned      | admin      |
      | an-unsigned      | superadmin |
      | a-wrongly-signed | admin      |
      | a-wrongly-signed | superadmin |
      | a-not-yet-valid  | admin      |

  Scenario: A forged superadmin token cannot reach superadmin endpoints
    When a caller with a-wrongly-signed token for role superadmin calls "GET /api/v1/admin-users"
    Then the response status is 401

  Scenario: Responses carry the standard browser protections
    When anonymous calls "GET /health"
    Then the response status is 200
    And the response header "X-Content-Type-Options" equals "nosniff"
    And the response header "Strict-Transport-Security" is present
    And the response header "X-Frame-Options" is present
    And the response header "X-Powered-By" is absent

  Scenario: API responses report the rate limit that applies
    When admin calls "GET /api/v1/routes"
    Then the response status is 200
    And the response header "RateLimit-Limit" is present
    And the response header "RateLimit-Remaining" is present

  Scenario: Refusals do not reveal server internals
    When admin calls "GET /api/v1/routes/2147483647"
    Then the response does not leak internals
    When admin calls "PUT /api/v1/routes/abc" with:
      """
      { "routeNumber": "E2E-x" }
      """
    Then the response status is 400
    And the response does not leak internals
    And the JSON field "stack" is absent
    When anonymous calls "GET /api/v1/routes"
    Then the response does not leak internals

  Scenario: A record that disappeared or never existed is reported as not found, with a code
    When superadmin calls "PUT /api/v1/brands/2147483647" with:
      """
      { "depositEnabled": true }
      """
    Then the response status is 404
    And the error code is "NOT_FOUND"
    And the response does not leak internals

  Scenario: A value that already exists is reported as a duplicate, with a code and no database wording
    Given a throwaway admin user "user"
    When superadmin calls "POST /api/v1/admin-users" with:
      """
      { "username": "${user.username}", "password": "secret123" }
      """
    Then the response status is 409
    Given the existing brand "Nandini" as "brand"
    And a throwaway route "route" in brand "brand"
    When admin calls "POST /api/v1/routes" with:
      """
      { "brandId": ${brand.id}, "routeNumber": "${route.routeNumber}" }
      """
    Then the response status is 400
    And the error code is "DUPLICATE"
    And the response does not leak internals
