@api @reports @superadmin
Feature: Reports
  Statements, summaries and the dispatch sheet read the ledgers back. Every figure checked here belongs
  to the scenario's own throwaway brand and salesperson, so real data on the same days cannot interfere.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And a salesperson with a clean ledger "sp"

  Scenario: The dairy statement lists a day's receipts, payments and top-ups separately
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    And admin pays 50 to "brand" on "${today-2}"
    And superadmin calls "POST /api/v1/dairy-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "notes": "opening dues", "entries": [ { "brandId": ${brand.id}, "amount": 1000 } ] }
      """
    When admin calls "GET /api/v1/reports/dairy-statement?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON list "data" has 1 item
    And the JSON field "data[0].receipts[0].productName" equals "${milk.name}"
    And the JSON amount "data[0].receipts[0].amount" equals "200"
    And the JSON list "data[0].payments" has 1 item
    And the JSON amount "data[0].payments[0].amount" equals "50"
    And the JSON list "data[0].topUps" has 1 item
    And the JSON amount "data[0].topUps[0].amount" equals "1000"
    And the JSON amount "data[0].closingBalance" equals "1150"

  Scenario: A statement only covers the dates asked for
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/dairy-statement?brandId=${brand.id}&from=${today-1}&to=${today}"
    Then the call succeeds
    And the JSON list "data" has 0 items

  Scenario Outline: Statements need their parameters
    When admin calls "GET <path>"
    Then the response status is 400

    Examples:
      | path                                                            |
      | /api/v1/reports/dairy-statement                                 |
      | /api/v1/reports/dairy-statement?brandId=1&from=2026-04-01       |
      | /api/v1/reports/dairy-statement?brandId=abc&from=2026-04-01&to=2026-04-30 |
      | /api/v1/reports/salesperson-statement                           |
      | /api/v1/reports/salesperson-statement?salespersonId=1&to=2026-04-30 |
      | /api/v1/reports/stock-summary                                   |
      | /api/v1/reports/deposit-summary                                 |
      | /api/v1/reports/profit-loss                                     |
      | /api/v1/reports/profit-loss?from=2026-04-01                     |
      | /api/v1/reports/daily-dispatch                                  |

  Scenario: The salesperson statement shows items, collections and loaded dues apart
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    And admin collects 100 from "sp" on "${today-2}"
    And admin calls "POST /api/v1/salesperson-payments/bulk-topup" with:
      """
      { "paymentDate": "${today-2}", "entries": [ { "salespersonId": ${sp.id}, "amount": 500 } ] }
      """
    When admin calls "GET /api/v1/reports/salesperson-statement?salespersonId=${sp.id}&from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON list "data" has 1 item
    And the JSON field "data[0].items[0].productName" equals "${milk.name}"
    And the JSON amount "data[0].items[0].unitPrice" equals "22"
    And the JSON amount "data[0].items[0].totalAmount" equals "220"
    And the JSON list "data[0].payments" has 1 item
    And the JSON amount "data[0].payments[0].amount" equals "100"
    And the JSON amount "data[0].topUps[0].amount" equals "500"
    And the JSON amount "data[0].closingBalance" equals "620"

  Scenario: Statement items follow the category display order
    Given a throwaway category "dairyFirst" in brand "brand"
    And a throwaway category "dairySecond" in brand "brand"
    And a throwaway product "inSecond" in brand "brand" with:
      """
      { "category": "${dairySecond.name}" }
      """
    And a throwaway product "inFirst" in brand "brand" with:
      """
      { "category": "${dairyFirst.name}" }
      """
    And admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${dairyFirst.id}, "displayOrder": 1 }, { "id": ${dairySecond.id}, "displayOrder": 2 } ]
      """
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}",
        "items": [ { "productId": ${inSecond.id}, "quantity": 1, "unitPrice": 10 },
                   { "productId": ${inFirst.id}, "quantity": 1, "unitPrice": 10 } ] }
      """
    Then the response status is 201
    When admin calls "GET /api/v1/reports/salesperson-statement?salespersonId=${sp.id}&from=${today-2}&to=${today-2}"
    Then the JSON list "data[0].items" is ordered by "productName" as "${inFirst.name}, ${inSecond.name}"
    And the JSON field "data[0].items[0].categoryDisplayOrder" equals "1"

  Scenario: The stock summary compares the value received with the value dispatched
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    And admin dispatches 4 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "GET /api/v1/reports/stock-summary?date=${today-2}&brandId=${brand.id}"
    Then the call succeeds
    And the JSON amount "data.grandTotalReceived" equals "200"
    And the JSON amount "data.grandTotalDispatched" equals "88"

  Scenario: Outstanding balances show the latest closing balance per brand and salesperson
    Given admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    And admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "GET /api/v1/reports/outstanding"
    Then the call succeeds
    And the JSON amount "data.dairy.find { it.brandId == ${brand.id} }.outstanding" equals "200"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.outstanding" equals "220"

  Scenario: The dispatch sheet shows each salesperson's total, and blank rows for those without an entry
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    And a salesperson with a clean ledger "idle"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the call succeeds
    And the JSON amount "data.rows.find { it.salespersonId == ${sp.id} }.totalAmount" equals "220"
    And the JSON field "data.rows.find { it.salespersonId == ${idle.id} }.dispatchId" equals "null"
    And the JSON field "data.isDayFinalized" equals "true"

  Scenario: The dispatch sheet lists a brand's products in category display order
    Given a throwaway category "dairyFirst" in brand "brand"
    And a throwaway category "dairySecond" in brand "brand"
    And a throwaway product "inSecond" in brand "brand" with:
      """
      { "category": "${dairySecond.name}" }
      """
    And a throwaway product "inFirst" in brand "brand" with:
      """
      { "category": "${dairyFirst.name}" }
      """
    And admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${dairyFirst.id}, "displayOrder": 1 }, { "id": ${dairySecond.id}, "displayOrder": 2 } ]
      """
    And admin enables "inFirst" for everyone at price 10
    And admin enables "inSecond" for everyone at price 10
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the JSON list "data.brands.find { it.brandId == ${brand.id} }.products" is ordered by "productName" as "${inFirst.name}, ${inSecond.name}"

  Scenario: The profit and loss report prices stock at cost for each salesperson
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2}&to=${today-2}"
    Then the call succeeds
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.revenue" equals "220"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.cost" equals "100"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.profit" equals "120"

  Scenario: The deposit summary reports a deposit-bearing brand's stock
    Given admin sets deposit of 2 per litre on "brand"
    And a throwaway category "crates" in brand "brand"
    And admin marks category "crates" as deposit-bearing
    And a throwaway product "crateMilk" in brand "brand" with:
      """
      { "category": "${crates.name}", "unitType": "ml", "unitSize": 500, "containerType": "crate", "unitsPerContainer": 12 }
      """
    And admin enables deposit on product "crateMilk"
    And admin receives 24 of "crateMilk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON field "data.rows" is present
