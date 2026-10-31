@api @routes
Feature: Update a delivery route (PUT /api/v1/routes/:id) against the real database
  Writes to the target environment: every route is a throwaway "E2E-..." record that is
  deleted after the scenario. Never tag @smoke — smoke runs against production.

  Background:
    Given the "Nandini" brand exists
    And I have created a throwaway route

  Scenario: Renaming a route and changing its display order is persisted
    When I update the route with:
      """
      { "routeNumber": "<newRouteNumber>", "displayOrder": 7 }
      """
    Then the response status is 200
    And the JSON field "success" equals "true"
    And the response route number is the new route number
    And the route is listed for its brand with display order 7

  Scenario: Deactivating a route hides it from the active route list
    When I update the route with:
      """
      { "isActive": false }
      """
    Then the response status is 200
    And the JSON field "data.isActive" equals "false"
    And the route is not listed among its brand's active routes

  Scenario: The database rejects a route number already used in the same brand
    Given I have created a second throwaway route
    When I update the second route with:
      """
      { "routeNumber": "<routeNumber>" }
      """
    Then the response status is 400
    And the JSON field "code" equals "DUPLICATE"
    And the second route keeps its own route number

  Scenario: A route cannot be moved to another brand through the update
    When I update the route with:
      """
      { "brandId": 2147483647 }
      """
    Then the response status is 200
    And the route is listed for its brand unchanged

  Scenario: Invalid input is rejected and nothing is saved
    When I update the route with:
      """
      { "routeNumber": "<newRouteNumber>", "displayOrder": -1 }
      """
    Then the response status is 400
    And the JSON field "success" equals "false"
    And the route is listed for its brand unchanged

  Scenario: Updating a route that does not exist returns 404
    When I update route "2147483647" with:
      """
      { "routeNumber": "<newRouteNumber>" }
      """
    Then the response status is 404
    And the JSON field "error" equals "Route not found"

  Scenario: Updating without a token is refused and nothing is saved
    When I update the route without a token with:
      """
      { "routeNumber": "<newRouteNumber>" }
      """
    Then the response status is 403
    And the route is listed for its brand unchanged
