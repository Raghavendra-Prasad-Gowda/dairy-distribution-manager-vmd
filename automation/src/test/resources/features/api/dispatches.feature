@api @dispatch @superadmin
Feature: Stock entries (dispatches)
  A dispatch is the stock handed to a salesperson on a day. Admins can enter any day; a salesman can
  enter today or tomorrow and the server - not the client - decides the price. Entries lock when
  submitted and past days are locked unless an admin reopens them.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And the run's salesman as "me"

  Scenario: A salesman's stock entry is priced by the server, not by the client
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 3, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON amount "data.items[0].unitPrice" equals "22"
    And the JSON amount "data.totalAmount" equals "66"
    And the JSON field "data.isLocked" equals "false"

  Scenario: A custom price for the salesman wins over the global price
    Given admin enables "milk" for everyone at price 22
    And admin sets the price of "milk" for "me" to 30
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON amount "data.totalAmount" equals "60"

  Scenario: A salesman cannot take a product that is not enabled for them
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "not enabled"

  Scenario: A salesman's entry always belongs to the salesman, whatever the payload says
    Given admin enables "milk" for everyone at price 22
    And a salesperson with a clean ledger "other"
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${other.id}, "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 201
    And I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    And the JSON field "data.salespersonId" equals "${me.id}"

  Scenario: Submitting locks an entry until an admin unlocks it
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 3, "unitPrice": 1 } ] }
      """
    Then I remember the response data as "dispatch"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${dispatch.id}"
    When salesman calls "PATCH /api/v1/dispatches/${dispatch.id}/submit"
    Then the response status is 200
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 9, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "locked"
    When salesman calls "GET /api/v1/dispatches?date=${today}"
    Then the JSON field "data.find { it.id == ${dispatch.id} }.isLocked" equals "true"
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 200
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today}", "items": [ { "productId": ${milk.id}, "quantity": 4, "unitPrice": 1 } ] }
      """
    Then the response status is 200
    And the JSON amount "data.totalAmount" equals "88"
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 200
    When salesman calls "GET /api/v1/dispatches?date=${today}"
    Then the JSON field "data.find { it.id == ${dispatch.id} }.isLocked" equals "true"

  Scenario: A salesman cannot enter a past day until an admin opens it
    Given admin enables "milk" for everyone at price 22
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today-1}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 1 } ] }
      """
    Then the response status is 403
    And the error message contains "locked"
    When admin calls "POST /api/v1/dispatches/open-for-entry" with:
      """
      { "salespersonId": ${me.id}, "dispatchDate": "${today-1}" }
      """
    Then the response status is 200
    And I remember the JSON field "data.dispatchId" as "opened"
    And afterwards admin cleans up with "DELETE /api/v1/dispatches/${opened}"
    When salesman calls "POST /api/v1/dispatches" with:
      """
      { "dispatchDate": "${today-1}", "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 1 } ] }
      """
    Then the response status is 200
    And the JSON amount "data.totalAmount" equals "44"

  Scenario: Admins can enter stock for any salesperson on any day, with their own prices
    Given a salesperson with a clean ledger "sp"
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-4}", "notes": "E2E",
        "items": [ { "productId": ${milk.id}, "quantity": 2, "unitPrice": 17 } ] }
      """
    Then the response status is 201
    And the JSON amount "data.totalAmount" equals "34"

  Scenario Outline: Invalid stock entries are refused
    When admin calls "POST /api/v1/dispatches" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                                                                            |
      | { "dispatchDate": "${today}", "items": [] }                                                                     |
      | { "salespersonId": 1, "dispatchDate": "${today+2}", "items": [] }                                               |
      | { "salespersonId": 1, "dispatchDate": "bad", "items": [] }                                                      |
      | { "salespersonId": 1, "dispatchDate": "2026-04-30", "items": [ { "productId": 1, "quantity": -1, "unitPrice": 5 } ] } |
      | { "salespersonId": 1, "dispatchDate": "2026-04-30", "items": [ { "productId": 1, "quantity": 0, "unitPrice": 5 } ] }  |
      | { "salespersonId": 1, "dispatchDate": "2026-04-30", "items": [ { "productId": 1, "quantity": 1, "unitPrice": -5 } ] } |

  Scenario Outline: Stock entry ids are validated
    When admin calls "<method> /api/v1/dispatches/<id><suffix>"
    Then the response status is <status>

    Examples:
      | method | id         | suffix  | status |
      | DELETE | abc        |         | 400    |
      | DELETE | 2147483647 |         | 404    |
      | PATCH  | 2147483647 | /submit | 404    |
      | PATCH  | 2147483647 | /lock   | 404    |
      | PATCH  | 2147483647 | /unlock | 404    |

  Scenario: Entries are listed per salesperson and day, and a salesman sees only their own
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&date=${today-2}"
    Then the call succeeds
    And the JSON list "data" has 1 item
    And the JSON field "data[0].salesperson.name" equals "${other.name}"
    When salesman calls "GET /api/v1/dispatches?salespersonId=${other.id}"
    Then the call succeeds
    And the JSON list "data" has no item whose "salespersonId" is "${other.id}"

  Scenario: Entries can be paged
    Given a salesperson with a clean ledger "other"
    And admin dispatches 1 of "milk" at 22 to "other" on "${today-3}"
    And admin dispatches 1 of "milk" at 22 to "other" on "${today-2}"
    When admin calls "GET /api/v1/dispatches?salespersonId=${other.id}&page=1&limit=1"
    Then the JSON list "data.items" has 1 item
    And the JSON field "data.pagination.total" equals "2"

  Scenario: A day's summary lists who got what
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}"
    When admin calls "GET /api/v1/dispatches/summary?date=${today-2}"
    Then the call succeeds
    And the JSON field "data.find { it.salespersonId == ${other.id} }.salesperson.name" equals "${other.name}"
    When admin calls "GET /api/v1/dispatches/summary"
    Then the response status is 400
    When salesman calls "GET /api/v1/dispatches/summary?date=${today-2}"
    Then the response status is 403

  Scenario: A salesman cannot delete another salesperson's entry
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When salesman calls "DELETE /api/v1/dispatches/${dispatch.id}"
    Then the response status is 403

  @superadmin
  Scenario: A dispatcher cannot lock or unlock a past entry
    Given a salesperson with a clean ledger "other"
    And admin dispatches 2 of "milk" at 22 to "other" on "${today-2}" remembered as "dispatch"
    When dispatcher calls "PATCH /api/v1/dispatches/${dispatch.id}/lock"
    Then the response status is 403
    And the error message contains "today"
    When dispatcher calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    Then the response status is 403
