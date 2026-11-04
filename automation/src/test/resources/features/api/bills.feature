@api @bills @superadmin
Feature: Bills
  A bill freezes what was dispatched to a salesperson over a period, grouped by brand and product.
  Bills are numbered in sequence and every bill the scenario issues is deleted afterwards.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And a salesperson with a clean ledger "sp"
    And admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"

  Scenario: A preview shows what a bill would contain without issuing it
    When admin calls "GET /api/v1/bills/preview?salespersonId=${sp.id}&from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON amount "data.totalAmount" equals "220"
    And the JSON field "data.salespersonName" equals "${sp.name}"
    And the JSON field "data.lines[0].brandName" equals "${brand.name}"
    When admin calls "GET /api/v1/bills?salespersonId=${sp.id}"
    Then the JSON list "data" has 0 items

  Scenario: Issuing a bill numbers it, defaults the party name and lists it
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}", "poNumber": "PO-E2E" }
      """
    Then the response status is 201
    And I remember the response data as "bill"
    And afterwards admin cleans up with "DELETE /api/v1/bills/${bill.id}"
    And the JSON amount "data.totalAmount" equals "220"
    And the JSON field "data.partyName" equals "${sp.name}"
    And the JSON field "data.poNumber" equals "PO-E2E"
    When admin calls "GET /api/v1/bills/${bill.id}"
    Then the call succeeds
    And the JSON field "data.billNumber" equals "${bill.billNumber}"
    When admin calls "GET /api/v1/bills?salespersonId=${sp.id}"
    Then the JSON list "data" contains an item whose "id" is "${bill.id}"

  Scenario: Bill numbers run in sequence
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}" }
      """
    Then the response status is 201
    And I remember the response data as "first"
    And afterwards admin cleans up with "DELETE /api/v1/bills/${first.id}"
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}", "partyName": "E2E Traders" }
      """
    Then the response status is 201
    And I remember the response data as "second"
    And afterwards admin cleans up with "DELETE /api/v1/bills/${second.id}"
    And the JSON field "data.partyName" equals "E2E Traders"
    And the JSON amount "data.billNumber" is "${first.billNumber}" plus 1

  Scenario: A bill keeps the figures it was issued with, even if the stock entry changes later
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}" }
      """
    Then I remember the response data as "bill"
    And afterwards admin cleans up with "DELETE /api/v1/bills/${bill.id}"
    When admin dispatches 20 of "milk" at 22 to "sp" on "${today-2}"
    And admin calls "GET /api/v1/bills/${bill.id}"
    Then the JSON amount "data.totalAmount" equals "220"
    When admin calls "GET /api/v1/bills/preview?salespersonId=${sp.id}&from=${today-3}&to=${today-1}"
    Then the JSON amount "data.totalAmount" equals "440"

  Scenario: There is nothing to bill for a period without stock
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-20}", "to": "${today-19}" }
      """
    Then the response status is 400
    And the error message contains "nothing to bill"

  Scenario Outline: Invalid bills are refused
    When admin calls "POST /api/v1/bills" with:
      """
      <body>
      """
    Then the response status is <status>

    Examples:
      | body                                                                          | status |
      | { "from": "2026-04-01", "to": "2026-04-30" }                                  | 400    |
      | { "salespersonId": 1, "from": "01-04-2026", "to": "2026-04-30" }              | 400    |
      | { "salespersonId": 1, "from": "2026-04-30", "to": "2026-04-01" }              | 400    |
      | { "salespersonId": 1, "from": "2026-04-01", "to": "2026-04-30", "partyName": "${repeat:121}" } | 400 |
      | { "salespersonId": 2147483647, "from": "2026-04-01", "to": "2026-04-30" }     | 404    |

  Scenario Outline: Bill previews and lookups are validated
    When admin calls "GET <path>"
    Then the response status is <status>

    Examples:
      | path                                                                 | status |
      | /api/v1/bills/preview                                                | 400    |
      | /api/v1/bills/preview?salespersonId=1&from=bad&to=2026-04-30         | 400    |
      | /api/v1/bills/preview?salespersonId=1&from=2026-04-30&to=2026-04-01  | 400    |
      | /api/v1/bills/preview?salespersonId=2147483647&from=2026-04-01&to=2026-04-30 | 404 |
      | /api/v1/bills/abc                                                    | 400    |
      | /api/v1/bills/2147483647                                             | 404    |

  Scenario: A bill can be deleted once
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}" }
      """
    Then I remember the response data as "bill"
    When admin calls "DELETE /api/v1/bills/${bill.id}"
    Then the response status is 200
    When admin calls "GET /api/v1/bills/${bill.id}"
    Then the response status is 404
    When admin calls "DELETE /api/v1/bills/${bill.id}"
    Then the response status is 404

  Scenario: Each product is listed under its brand with the quantity, a derived rate and the amount
    When admin calls "GET /api/v1/bills/preview?salespersonId=${sp.id}&from=${today-3}&to=${today-1}"
    Then the JSON field "data.lines[0].products[0].productName" equals "${milk.name}"
    And the JSON field "data.lines[0].products[0].unit" equals "pcs"
    And the JSON amount "data.lines[0].products[0].quantity" equals "10"
    And the JSON amount "data.lines[0].products[0].rate" equals "22"
    And the JSON amount "data.lines[0].products[0].amount" equals "220"

  Scenario: A litre-priced and a kilogram-priced product in one brand are separate rows with their own rate
    Given a throwaway product "oil" in brand "brand" with:
      """
      { "unitType": "ml", "unitSize": 500 }
      """
    And a throwaway product "ghee" in brand "brand" with:
      """
      { "unitType": "gram", "unitSize": 500 }
      """
    And admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}",
        "items": [ { "productId": ${milk.id}, "quantity": 10, "unitPrice": 22 },
                   { "productId": ${oil.id}, "quantity": 4, "unitPrice": 30 },
                   { "productId": ${ghee.id}, "quantity": 2, "unitPrice": 100 } ] }
      """
    When admin calls "GET /api/v1/bills/preview?salespersonId=${sp.id}&from=${today-3}&to=${today-1}"
    Then the JSON list "data.lines[0].products" has 3 items
    And the JSON field "data.lines[0].products.find { it.productName == '${oil.name}' }.unit" equals "ltr"
    And the JSON amount "data.lines[0].products.find { it.productName == '${oil.name}' }.quantity" equals "2"
    And the JSON amount "data.lines[0].products.find { it.productName == '${oil.name}' }.rate" equals "60"
    And the JSON field "data.lines[0].products.find { it.productName == '${ghee.name}' }.unit" equals "kg"
    And the JSON amount "data.lines[0].products.find { it.productName == '${ghee.name}' }.rate" equals "200"

  Scenario: A period without stock previews as empty
    When admin calls "GET /api/v1/bills/preview?salespersonId=${sp.id}&from=${today-20}&to=${today-19}"
    Then the call succeeds
    And the JSON list "data.lines" has 0 items
    And the JSON amount "data.totalAmount" equals "0"

  Scenario: The bill register lists the newest bill first
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}" }
      """
    Then I remember the response data as "older"
    And afterwards admin cleans up with "DELETE /api/v1/bills/${older.id}"
    When admin calls "POST /api/v1/bills" with:
      """
      { "salespersonId": ${sp.id}, "from": "${today-3}", "to": "${today-1}" }
      """
    Then I remember the response data as "newer"
    And afterwards admin cleans up with "DELETE /api/v1/bills/${newer.id}"
    When admin calls "GET /api/v1/bills?salespersonId=${sp.id}"
    Then the JSON list "data" is ordered by "id" as "${newer.id}, ${older.id}"
