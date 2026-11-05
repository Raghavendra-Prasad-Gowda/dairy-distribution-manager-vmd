@api @reports @profit-loss @superadmin
Feature: Profit and loss report
  Revenue is what was billed to salespeople, cost is the dairy cost of the stock dispatched, resolved
  at the price in force on each day. Totals add up everyone's figures, so the scenarios that check
  totals use a day more than five years ago, where no real data can exist; the others look rows up
  by their own throwaway salesperson.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And a salesperson with a clean ledger "sp"

  Scenario: Profit is quantity times (billed price - cost price), with its margin
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the call succeeds
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.revenue" equals "220"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.cost" equals "100"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.profit" equals "120"
    And the JSON amount "data.totals.profit" equals "120"
    And the JSON amount "data.totals.marginPct" equals "54.55"

  Scenario: Selling below cost shows as a loss, not as zero
    Given admin dispatches 10 of "milk" at 8 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.profit" equals "-20"
    And the JSON amount "data.totals.profit" equals "-20"

  Scenario: A period with nothing dispatched has a margin of zero, not an error
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the call succeeds
    And the JSON amount "data.totals.revenue" equals "0"
    And the JSON amount "data.totals.marginPct" equals "0"
    And the JSON field "data.from" equals "${today-2000}"
    And the JSON field "data.to" equals "${today-2000}"

  Scenario: Totals add up every salesperson
    Given a salesperson with a clean ledger "other"
    And admin dispatches 10 of "milk" at 22 to "sp" on "${today-2000}"
    And admin dispatches 5 of "milk" at 22 to "other" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.totals.revenue" equals "330"
    And the JSON amount "data.totals.cost" equals "150"
    And the JSON amount "data.totals.profit" equals "180"

  Scenario: Every active salesperson is listed, even without dispatches
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.revenue" equals "0"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.marginPct" equals "0"

  Scenario: Each dispatch is costed at the price in force on its own day
    Given admin calls "PUT /api/v1/products/${milk.id}" with:
      """
      { "costPrice": 14, "effectiveFrom": "${today+1}" }
      """
    And admin dispatches 10 of "milk" at 22 to "sp" on "${today}"
    And admin dispatches 10 of "milk" at 22 to "sp" on "${today+1}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today}&to=${today+1}"
    Then the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.revenue" equals "440"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.cost" equals "240"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.profit" equals "200"

  Scenario: When no cost price is in force yet, the earliest scheduled one is used
    Given a throwaway product "scheduled" in brand "brand" with:
      """
      { "costPrice": 30, "effectiveFrom": "${today+3}" }
      """
    And admin calls "PUT /api/v1/products/${scheduled.id}" with:
      """
      { "costPrice": 50, "effectiveFrom": "${today+6}" }
      """
    And admin dispatches 2 of "scheduled" at 40 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.salespeople.find { it.salespersonId == ${sp.id} }.cost" equals "60"

  Scenario: A product that has no cost price at all is reported as unpriced, once
    Given a throwaway product "free" in brand "brand" with:
      """
      { "costPrice": 0, "sellingPrice": 0 }
      """
    And admin dispatches 1 of "free" at 5 to "sp" on "${today-2000}"
    And admin dispatches 1 of "free" at 5 to "sp" on "${today-1999}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-1999}"
    Then the JSON list "data.unpriced" has 1 item
    And the JSON field "data.unpriced[0].productName" equals "${free.name}"

  Scenario: Nothing is reported as unpriced when every cost resolves
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON list "data.unpriced" has 0 items

  Scenario: A deactivated salesperson appears only if they were dispatched to in the period
    Given a throwaway salesperson "withStock"
    And a throwaway salesperson "withoutStock"
    And admin dispatches 4 of "milk" at 22 to "withStock" on "${today-2000}"
    And admin calls "PUT /api/v1/salespeople/${withStock.id}" with:
      """
      { "isActive": false }
      """
    And admin calls "PUT /api/v1/salespeople/${withoutStock.id}" with:
      """
      { "isActive": false }
      """
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON field "data.salespeople.find { it.salespersonId == ${withStock.id} }.isActive" equals "false"
    And the JSON amount "data.salespeople.find { it.salespersonId == ${withStock.id} }.revenue" equals "88"
    And the JSON list "data.salespeople" has no item whose "salespersonId" is "${withoutStock.id}"

  Scenario: A salesperson's products merge repeat lines across days and follow the layout order
    Given a throwaway product "second" in brand "brand"
    And admin calls "PATCH /api/v1/products/reorder" with:
      """
      [ { "id": ${milk.id}, "displayOrder": 2 }, { "id": ${second.id}, "displayOrder": 1 } ]
      """
    And admin dispatches 5 of "milk" at 40 to "sp" on "${today-2000}"
    And admin dispatches 5 of "milk" at 40 to "sp" on "${today-1999}"
    And admin dispatches 1 of "second" at 12 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-1999}"
    Then the JSON list "data.salespeople.find { it.salespersonId == ${sp.id} }.products" has 2 items
    And the JSON list "data.salespeople.find { it.salespersonId == ${sp.id} }.products" is ordered by "productName" as "${second.name}, ${milk.name}"

  Scenario: The range view has one row per day, each with its own margin
    Given admin dispatches 10 of "milk" at 22 to "sp" on "${today-2000}"
    And admin dispatches 10 of "milk" at 20 to "sp" on "${today-1999}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-1999}"
    Then the JSON list "data.daily" has 2 items
    And the JSON amount "data.daily[0].profit" equals "120"
    And the JSON amount "data.daily[1].profit" equals "100"
    And the JSON amount "data.daily[1].marginPct" equals "50"

  Scenario: The bridge from the dairy bill to cost of goods dispatched
    Given admin receives 10 of "milk" at 10 into "brand" on "${today-2000}"
    And admin dispatches 4 of "milk" at 22 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.reconciliation.costOfGoodsDispatched" equals "40"
    And the JSON amount "data.reconciliation.dairyBill" equals "100"
    And the JSON amount "data.reconciliation.otherDifference" equals "60"

  Scenario: When everything received was dispatched the bridge has no difference
    Given admin receives 10 of "milk" at 10 into "brand" on "${today-2000}"
    And admin dispatches 10 of "milk" at 22 to "sp" on "${today-2000}"
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.reconciliation.otherDifference" equals "0"

  Scenario: A deactivated brand's dairy bill is left out of the bridge
    Given admin receives 10 of "milk" at 10 into "brand" on "${today-2000}"
    And superadmin calls "PUT /api/v1/brands/${brand.id}" with:
      """
      { "isActive": false }
      """
    When admin calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the JSON amount "data.reconciliation.dairyBill" equals "0"

  Scenario: Salesmen cannot read the report
    When salesman calls "GET /api/v1/reports/profit-loss?from=${today-2000}&to=${today-2000}"
    Then the response status is 403
