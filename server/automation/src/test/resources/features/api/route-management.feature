@api @routes
Feature: Route setup (list, create, delete)
  Delivery routes belong to a brand. Updating a route is covered in routes.feature.
  Every route is a throwaway "E2E-..." record under the existing Nandini brand.

  Background:
    Given the existing brand "Nandini" as "brand"

  Scenario: A route is created, listed under its brand only, and deleted
    Given the scenario works with an identifier "number"
    When admin calls "POST /api/v1/routes" with:
      """
      { "brandId": ${brand.id}, "routeNumber": "${number}" }
      """
    Then the response status is 201
    And I remember the response data as "route"
    And afterwards admin cleans up with "DELETE /api/v1/routes/${route.id}"
    And the JSON field "data.isActive" equals "true"
    When admin calls "GET /api/v1/routes?brandId=${brand.id}"
    Then the JSON list "data" contains an item whose "routeNumber" is "${number}"
    When admin calls "DELETE /api/v1/routes/${route.id}"
    Then the response status is 200
    When admin calls "GET /api/v1/routes?brandId=${brand.id}"
    Then the JSON list "data" has no item whose "routeNumber" is "${number}"
    When admin calls "DELETE /api/v1/routes/${route.id}"
    Then the response status is 404

  Scenario: The same route number is refused twice in one brand
    Given a throwaway route "route" in brand "brand"
    When admin calls "POST /api/v1/routes" with:
      """
      { "brandId": ${brand.id}, "routeNumber": "${route.routeNumber}" }
      """
    Then the response status is 400
    And the error code is "DUPLICATE"

  Scenario Outline: Creating a route needs a brand and a number
    When admin calls "POST /api/v1/routes" with:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

    Examples:
      | body                                       |
      | { "routeNumber": "E2E-no-brand" }          |
      | { "brandId": 1 }                           |
      | { "brandId": 1, "routeNumber": "" }        |
      | { "brandId": 1, "routeNumber": "E2E-x", "displayOrder": -1 } |

  Scenario Outline: Route ids are validated on update and delete
    When admin calls "<method> /api/v1/routes/<id>" with:
      """
      { "routeNumber": "E2E-x" }
      """
    Then the response status is <status>

    Examples:
      | method | id         | status |
      | PUT    | abc        | 400    |
      | PUT    | 0          | 400    |
      | PUT    | 2147483647 | 404    |
      | DELETE | abc        | 400    |
      | DELETE | 2147483647 | 404    |

  Scenario: Listing routes with an invalid brand id is refused
    When admin calls "GET /api/v1/routes?brandId=abc"
    Then the response status is 400
