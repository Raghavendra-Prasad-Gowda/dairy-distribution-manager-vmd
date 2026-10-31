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
