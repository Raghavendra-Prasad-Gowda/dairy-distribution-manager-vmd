@api @ledger @salesperson @superadmin
Feature: Salesperson ledger
  What each salesperson owes: opening balance + stock given + top-ups - collections = closing balance,
  carried forward day after day. Every scenario borrows a salesperson with an empty ledger, which is wiped
  again when the scenario ends.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And a salesperson with a clean ledger "sp"

  Scenario: Stock given to a salesperson is what they owe
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}",
        "items": [ { "productId": ${milk.id}, "quantity": 10, "unitPrice": 22 } ] }
      """
    Then the response status is 201
    And the JSON amount "data.totalAmount" equals "220"
    And the ledger of salesperson "sp" shows:
      | date       | opening | given | paid | closing |
      | ${today-2} | 0       | 220   | 0    | 220     |

  Scenario: A collection reduces what is owed
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "POST /api/v1/salesperson-payments" with:
      """
      { "salespersonId": ${sp.id}, "paymentDate": "${today-2}", "amount": 100, "paymentMode": "UPI", "reference": "E2E" }
      """
    Then the response status is 201
    And the JSON field "data.isTopUp" equals "false"
    And the ledger of salesperson "sp" shows:
      | date       | given | paid | closing |
      | ${today-2} | 220   | 100  | 120     |

  Scenario: Each day opens with the previous day's closing balance
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-3}"
    And admin collects 100 from "sp" on "${today-2}"
    Then the ledger of salesperson "sp" shows:
      | date       | opening | given | paid | closing |
      | ${today-3} | 0       | 220   | 0    | 220     |
      | ${today-2} | 220     | 0     | 100  | 120     |
      | ${today-1} | 120     | 0     | 0    | 120     |

  Scenario: A back-dated change ripples through every later day
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-3}"
    And admin collects 100 from "sp" on "${today-2}"
    And admin dispatches 5 of "milk" at 22 to "sp" on "${today-1}"
    When admin dispatches 20 of "milk" at 22 to "sp" on "${today-3}"
    Then the ledger of salesperson "sp" shows:
      | date       | opening | given | paid | closing |
      | ${today-3} | 0       | 440   | 0    | 440     |
      | ${today-2} | 440     | 0     | 100  | 340     |
      | ${today-1} | 340     | 110   | 0    | 450     |

  Scenario: Saving a day's stock again replaces it, and an empty save removes it
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}" remembered as "dispatch"
    When admin dispatches 4 of "milk" at 22 to "sp" on "${today-2}"
    Then the response status is 200
    And the ledger of salesperson "sp" shows:
      | date       | given | closing |
      | ${today-2} | 88    | 88      |
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}", "items": [] }
      """
    Then the response status is 200
    And the JSON field "data.message" equals "Stock entry cleared"
    And the ledger of salesperson "sp" shows:
      | date       | given | closing |
      | ${today-2} | 0     | 0       |
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}", "items": [] }
      """
    Then the JSON field "data.message" equals "Nothing to save"

  Scenario: Deleting a stock entry removes it from the ledger
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}" remembered as "dispatch"
    When admin calls "DELETE /api/v1/dispatches/${dispatch.id}"
    Then the response status is 200
    And the ledger of salesperson "sp" shows:
      | date       | given | closing |
      | ${today-2} | 0     | 0       |
    When admin calls "DELETE /api/v1/dispatches/${dispatch.id}"
    Then the response status is 404

  Scenario: Loading dues that were owed before the app adds to the balance
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "POST /api/v1/salesperson-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "notes": "opening dues", "entries": [ { "salespersonId": ${sp.id}, "amount": 500 } ] }
      """
    Then the response status is 201
    And the JSON field "data.count" equals "1"
    And the ledger of salesperson "sp" shows:
      | date       | given | topUp | paid | closing |
      | ${today-2} | 220   | 500   | 0    | 720     |
    When admin calls "GET /api/v1/salesperson-balance/${sp.id}/history"
    Then the call succeeds
    And the JSON amount "data.items.find { it.topUpAmount == 500 }.closingBalance" equals "720"
    And the JSON field "data.items.find { it.topUpAmount == 500 }.topUps[0].notes" equals "opening dues"

  Scenario Outline: Invalid dues loads are refused
    When admin calls "POST /api/v1/salesperson-payments/bulk-topup" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | body                                                                                                | status |
      | { "paymentDate": "2026-04-30", "entries": [] }                                                      | 400    |
      | { "paymentDate": "2026-04-30", "entries": [ { "salespersonId": 1, "amount": 0 } ] }                 | 400    |
      | { "paymentDate": "2026-04-30", "entries": [ { "salespersonId": 1, "amount": 5 }, { "salespersonId": 1, "amount": 5 } ] } | 400 |
      | { "paymentDate": "2026-04-30", "entries": [ { "salespersonId": 2147483647, "amount": 5 } ] }        | 404    |

  Scenario: Editing a collection re-balances both the old and the new day
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-3}"
    And admin collects 100 from "sp" on "${today-2}" remembered as "payment"
    When admin calls "PUT /api/v1/salesperson-payments/${payment.id}" with:
      """
      { "amount": 150, "paymentDate": "${today-1}", "paymentMode": "Cash" }
      """
    Then the response status is 200
    And the ledger of salesperson "sp" shows:
      | date       | opening | paid | closing |
      | ${today-2} | 220     | 0    | 220     |
      | ${today-1} | 220     | 150  | 70      |

  Scenario: Deleting a collection gives the money back to the balance
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    And admin collects 100 from "sp" on "${today-2}" remembered as "payment"
    When admin calls "DELETE /api/v1/salesperson-payments/${payment.id}"
    Then the response status is 200
    And the ledger of salesperson "sp" shows:
      | date       | paid | closing |
      | ${today-2} | 0    | 220     |
    When admin calls "DELETE /api/v1/salesperson-payments/${payment.id}"
    Then the response status is 404

  Scenario Outline: Invalid collections are refused
    When admin calls "POST /api/v1/salesperson-payments" with:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

    Examples:
      | body                                                                                       |
      | { "salespersonId": 1, "paymentDate": "2026-04-30", "amount": 0 }                           |
      | { "salespersonId": 1, "paymentDate": "2026-04-30", "amount": -5 }                          |
      | { "paymentDate": "2026-04-30", "amount": 5 }                                               |
      | { "salespersonId": 1, "amount": 5 }                                                        |
      | { "salespersonId": 1, "paymentDate": "2026-04-30", "amount": 5, "paymentMode": "Barter" }  |
      | { "salespersonId": 1, "paymentDate": "2026-04-30", "amount": 5, "reference": "${repeat:501}" } |

  Scenario Outline: Invalid collection edits are refused
    When admin calls "PUT /api/v1/salesperson-payments/<id>" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | id         | body                                             | status |
      | abc        | { "amount": 5, "paymentDate": "2026-04-30" }     | 400    |
      | 2147483647 | { "amount": 5, "paymentDate": "2026-04-30" }     | 404    |
      | 2147483647 | { "amount": -5, "paymentDate": "2026-04-30" }    | 400    |

  Scenario: Collections can be filtered by salesperson and date, and paged
    Given admin collects 10 from "sp" on "${today-3}"
    And admin collects 20 from "sp" on "${today-2}"
    When admin calls "GET /api/v1/salesperson-payments?salespersonId=${sp.id}"
    Then the JSON list "data" has 2 items
    When admin calls "GET /api/v1/salesperson-payments?salespersonId=${sp.id}&from=${today-2}&to=${today-2}"
    Then the JSON list "data" has 1 item
    And the JSON amount "data[0].amount" equals "20"
    When admin calls "GET /api/v1/salesperson-payments?salespersonId=${sp.id}&page=1&limit=1"
    Then the JSON list "data.items" has 1 item
    And the JSON field "data.pagination.total" equals "2"

  Scenario: Balance lookups validate the salesperson and the date
    When admin calls "GET /api/v1/salesperson-balance/${sp.id}"
    Then the response status is 400
    When admin calls "GET /api/v1/salesperson-balance/abc?date=${today}"
    Then the response status is 400
    When admin calls "GET /api/v1/salesperson-balance/2147483647?date=${today}"
    Then the response status is 404
    When admin calls "GET /api/v1/salesperson-balance"
    Then the response status is 400

  Scenario: Every active salesperson's balance is listed for a date
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "GET /api/v1/salesperson-balance?date=${today-2}"
    Then the call succeeds
    And the JSON amount "data.find { it.salespersonId == ${sp.id} }.closingBalance" equals "220"

  Scenario: A salesperson with transactions cannot be deleted
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "DELETE /api/v1/salespeople/${sp.id}"
    Then the response status is 400
    And the error message contains "existing transactions"

  Scenario: Resetting a ledger clears payments, stock entries and balances
    Given a throwaway salesperson "own"
    And admin dispatches 10 of "milk" at 22 to "own" on "${today-2}"
    And admin collects 100 from "own" on "${today-2}"
    When superadmin calls "POST /api/v1/salespeople/reset-ledger" with:
      """
      { "salespersonIds": [ ${own.id} ] }
      """
    Then the response status is 200
    And the JSON field "data.payments" equals "1"
    And the JSON field "data.dispatches" equals "1"
    And the ledger of salesperson "own" shows:
      | date       | given | paid | closing |
      | ${today-2} | 0     | 0    | 0       |
    When admin calls "DELETE /api/v1/salespeople/${own.id}"
    Then the response status is 200

  Scenario: A salesman can read only their own balance and history
    Given the run's salesman as "me"
    When salesman calls "GET /api/v1/salesperson-balance/${me.id}?date=${today}"
    Then the call succeeds
    When salesman calls "GET /api/v1/salesperson-balance/${me.id}/history"
    Then the call succeeds
    When salesman calls "GET /api/v1/salesperson-balance/${sp.id}?date=${today}"
    Then the response status is 403
    When salesman calls "GET /api/v1/salesperson-balance/${sp.id}/history"
    Then the response status is 403
    When salesman calls "GET /api/v1/salesperson-balance?date=${today}"
    Then the response status is 403

  Scenario: A salesman sees only their own collections
    Given admin collects 10 from "sp" on "${today-2}"
    When salesman calls "GET /api/v1/salesperson-payments?salespersonId=${sp.id}"
    Then the call succeeds
    And the JSON list "data" has no item whose "salespersonId" is "${sp.id}"

  Scenario: Salesmen cannot record, change or delete collections
    When salesman calls "POST /api/v1/salesperson-payments" with:
      """
      { "salespersonId": ${sp.id}, "paymentDate": "${today}", "amount": 5 }
      """
    Then the response status is 403
