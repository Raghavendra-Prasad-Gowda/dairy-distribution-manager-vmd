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

  Scenario: Several collections on one day appear together in that day's statement row
    Given admin dispatches 5 of "milk" at 22 to "me" on "${today-2}" remembered as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And admin collects 30 from "me" on "${today-2}" remembered as "first"
    And afterwards admin cleans up with "DELETE /api/v1/salesperson-payments/${first.id}"
    And admin collects 20 from "me" on "${today-2}" remembered as "second"
    And afterwards admin cleans up with "DELETE /api/v1/salesperson-payments/${second.id}"
    When salesman calls "GET /api/v1/salesperson-statement/me?from=${today-2}&to=${today-2}"
    Then the JSON list "data" has 1 item
    And the JSON list "data[0].payments" has 2 items
    And the JSON amount "data[0].amountPaid" equals "50"

  Scenario: Loaded dues are kept out of the collections and show who loaded them
    Given admin calls "POST /api/v1/salesperson-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "notes": "opening dues", "entries": [ { "salespersonId": ${me.id}, "amount": 500 } ] }
      """
    And I remember the item of "data.payments" whose "amount" is "500" as "topUp"
    And afterwards admin cleans up with "DELETE /api/v1/salesperson-payments/${topUp.id}"
    When salesman calls "GET /api/v1/salesperson-statement/me?from=${today-2}&to=${today-2}"
    Then the JSON list "data[0].payments" has 0 items
    And the JSON amount "data[0].topUps[0].amount" equals "500"
    And the JSON field "data[0].topUps[0].createdBy" is present

  Scenario: Statement items carry the measures and the layout order
    Given a throwaway product "crate" in brand "brand" with:
      """
      { "unitType": "ml", "unitSize": 500, "containerType": "crate", "unitsPerContainer": 12 }
      """
    And admin dispatches 12 of "crate" at 30 to "me" on "${today-2}" remembered as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    When salesman calls "GET /api/v1/salesperson-statement/me?from=${today-2}&to=${today-2}"
    Then the JSON field "data[0].items[0].unitSize" is a number
    And the JSON amount "data[0].items[0].unitSize" equals "500"
    And the JSON field "data[0].items[0].unitsPerContainer" equals "12"
    And the JSON field "data[0].items[0].containerType" equals "crate"
    And the JSON field "data[0].items[0].categoryDisplayOrder" equals "999"
    And the JSON field "data[0].items[0].brandDisplayOrder" is present
