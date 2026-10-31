@api @salesman @superadmin
Feature: Salesman self-service statement
  A signed-in salesman sees their own statement and nobody else's. The run's salesman is used and every
  stock entry given to them is deleted again afterwards.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And the run's salesman as "me"

  Scenario: A salesman's statement shows their stock, collections and loaded dues apart
    Given admin dispatches 5 of "milk" at 22 to "me" on "${today-2}" remembered as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And admin collects 40 from "me" on "${today-2}" remembered as "payment"
    And afterwards admin cleans up with "DELETE /api/v1/salesperson-payments/${payment.id}"
    When salesman calls "GET /api/v1/salesperson-statement/me?from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON field "data.find { it.items.size() > 0 }.items[0].productName" equals "${milk.name}"
    And the JSON amount "data.find { it.items.size() > 0 }.items[0].totalAmount" equals "110"
    And the JSON amount "data.find { it.items.size() > 0 }.payments[0].amount" equals "40"
    And the JSON field "data.find { it.items.size() > 0 }.items[0].unitType" equals "piece"

  Scenario: A statement for a period without activity is empty
    When salesman calls "GET /api/v1/salesperson-statement/me?from=2020-01-01&to=2020-01-02"
    Then the call succeeds
    And the JSON list "data" has 0 items

  Scenario Outline: The statement endpoint is for salespeople who give a period
    When <caller> calls "GET /api/v1/salesperson-statement/me<query>"
    Then the response status is <status>

    Examples:
      | caller    | query                           | status |
      | salesman  | ?to=2026-04-30                  | 400    |
      | salesman  | ?from=2026-04-01                | 400    |
      | admin     | ?from=2026-04-01&to=2026-04-30  | 403    |
      | anonymous | ?from=2026-04-01&to=2026-04-30  | 403    |
