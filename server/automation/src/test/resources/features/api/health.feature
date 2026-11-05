@api @smoke
Feature: Backend health

  Scenario: Backend is live, on the expected build, and connected to its database
    When I call "GET /health"
    Then the response status is 200
    And the JSON field "status" equals "ok"
    And the deployed build matches the commit under test
    When I call "GET /health/ready"
    Then the response status is 200
    And the JSON field "status" equals "ready"

  Scenario: Health responses name the build and expose nothing secret
    When I call "GET /health"
    Then the response status is 200
    And the JSON field "version" is present
    And the JSON field "commit" is present
    And the JSON field "builtAt" is present
    And the response does not mention "password"
    And the response does not mention "secret"

  Scenario: The API root identifies the service
    When I call "GET /"
    Then the response status is 200
    And the JSON field "name" equals "Dairy Distribution Manager API"
    And the JSON field "status" equals "ok"
