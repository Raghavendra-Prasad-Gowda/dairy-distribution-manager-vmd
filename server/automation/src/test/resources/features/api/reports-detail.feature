@api @reports @superadmin
Feature: Report details
  The finer points of the statements, the stock summary and the dispatch sheet: which fields each row
  carries, how rows are ordered and filtered. Everything belongs to throwaway records.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And a salesperson with a clean ledger "sp"

  Scenario: The dairy statement names the route a receipt came in on
    Given a throwaway route "north" in brand "brand"
    And admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "routeId": ${north.id},
        "items": [ { "productId": ${milk.id}, "quantity": 3, "unitPrice": 20 } ] }
      """
    And admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-1}", "items": [ { "productId": ${milk.id}, "quantity": 1, "unitPrice": 20 } ] }
      """
    When admin calls "GET /api/v1/reports/dairy-statement?brandId=${brand.id}&from=${today-3}&to=${today}"
    Then the JSON field "data.find { it.date.startsWith('${today-2}') }.receipts[0].routeNumber" equals "${north.routeNumber}"
    And the JSON field "data.find { it.date.startsWith('${today-1}') }.receipts[0].routeNumber" equals "null"

  Scenario: The dairy statement shows the deposit charged on a day
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And admin receives 24 of "crateMilk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/dairy-statement?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the JSON amount "data[0].depositValue" equals "24"
    And the JSON amount "data[0].closingBalance" equals "504"

  Scenario: Statement items carry the measures the screens need
    Given a throwaway product "crate" in brand "brand" with:
      """
      { "unitType": "ml", "unitSize": 500, "containerType": "crate", "unitsPerContainer": 12 }
      """
    And admin dispatches 12 of "crate" at 30 to "sp" on "${today-2}"
    When admin calls "GET /api/v1/reports/salesperson-statement?salespersonId=${sp.id}&from=${today-2}&to=${today-2}"
    Then the JSON field "data[0].items[0].unitType" equals "ml"
    And the JSON field "data[0].items[0].unitSize" is a number
    And the JSON amount "data[0].items[0].unitSize" equals "500"
    And the JSON amount "data[0].items[0].unitsPerContainer" equals "12"
    And the JSON field "data[0].items[0].containerType" equals "crate"
    And the JSON field "data[0].items[0].brandDisplayOrder" is present
    And the JSON field "data[0].items[0].displayOrder" is present

  Scenario: A product without a category or measures is listed with defaults, not an error
    Given admin dispatches 1 of "milk" at 30 to "sp" on "${today-2}"
    When admin calls "GET /api/v1/reports/salesperson-statement?salespersonId=${sp.id}&from=${today-2}&to=${today-2}"
    Then the call succeeds
    And the JSON field "data[0].items[0].category" equals "null"
    And the JSON field "data[0].items[0].categoryDisplayOrder" equals "999"
    And the JSON field "data[0].items[0].unitSize" equals "null"
    And the JSON field "data[0].items[0].containerType" equals "null"

  Scenario: Statement items follow brand order first, then category, then product order, then name
    Given a throwaway brand "later"
    And admin calls "PATCH /api/v1/brands/reorder" with:
      """
      [ { "id": ${brand.id}, "displayOrder": 9001 }, { "id": ${later.id}, "displayOrder": 9002 } ]
      """
    And a throwaway product "inLater" in brand "later"
    And a throwaway product "zebra" in brand "brand" with:
      """
      { "name": "${unique:tie}-Z" }
      """
    And a throwaway product "apple" in brand "brand" with:
      """
      { "name": "${unique:tie}-A" }
      """
    When admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}",
        "items": [ { "productId": ${inLater.id}, "quantity": 1, "unitPrice": 5 },
                   { "productId": ${zebra.id}, "quantity": 1, "unitPrice": 5 },
                   { "productId": ${apple.id}, "quantity": 1, "unitPrice": 5 } ] }
      """
    Then the response status is 201
    When admin calls "GET /api/v1/reports/salesperson-statement?salespersonId=${sp.id}&from=${today-2}&to=${today-2}"
    Then the JSON list "data[0].items" is ordered by "productName" as "${apple.name}, ${zebra.name}, ${inLater.name}"

  Scenario: The stock summary can cover a period and shows route, measure and cost on each receipt
    Given a throwaway route "north" in brand "brand"
    And a throwaway product "ghee" in brand "brand" with:
      """
      { "unitType": "gram", "unitSize": 500 }
      """
    And admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-3}", "routeId": ${north.id},
        "items": [ { "productId": ${milk.id}, "quantity": 5, "unitPrice": 20 }, { "productId": ${ghee.id}, "quantity": 2, "unitPrice": 100 } ] }
      """
    And admin receives 4 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/stock-summary?from=${today-3}&to=${today-2}&brandId=${brand.id}"
    Then the call succeeds
    And the JSON amount "data.grandTotalReceived" equals "380"
    And the JSON list "data.rows" has 2 items
    And the JSON field "data.rows[0].receipts.find { it.productName == '${milk.name}' }.routeNumber" equals "${north.routeNumber}"
    And the JSON amount "data.rows[0].receipts.find { it.productName == '${ghee.name}' }.unitSizeGrams" equals "500"
    And the JSON field "data.rows[1].receipts[0].routeNumber" equals "null"

  Scenario: The dispatch sheet shows whether each entry is locked
    Given admin dispatches 2 of "milk" at 22 to "sp" on "${today-2}" remembered as "dispatch"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the JSON field "data.rows.find { it.salespersonId == ${sp.id} }.isLocked" equals "true"
    When admin calls "PATCH /api/v1/dispatches/${dispatch.id}/unlock"
    And admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the JSON field "data.rows.find { it.salespersonId == ${sp.id} }.isLocked" equals "false"

  Scenario: The dispatch sheet shows each product's quantity per salesperson and per day, and keeps a product disabled since
    Given admin enables "milk" for everyone at price 22
    And a throwaway product "retired" in brand "brand"
    And admin enables "retired" for everyone at price 5
    And admin calls "POST /api/v1/dispatches" with:
      """
      { "salespersonId": ${sp.id}, "dispatchDate": "${today-2}",
        "items": [ { "productId": ${milk.id}, "quantity": 3, "unitPrice": 22 }, { "productId": ${retired.id}, "quantity": 2, "unitPrice": 5 } ] }
      """
    And admin calls "DELETE /api/v1/products/${retired.id}"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the JSON amount "data.rows.find { it.salespersonId == ${sp.id} }.items['${milk.id}'].qty" equals "3"
    And the JSON amount "data.rows.find { it.salespersonId == ${sp.id} }.items['${retired.id}'].qty" equals "2"
    And the JSON field "data.rows.find { it.salespersonId == ${sp.id} }.items.size()" equals "2"
    And the JSON amount "data.totals['${milk.id}']" equals "3"
    And the JSON amount "data.totals['${retired.id}']" equals "2"
    And the JSON amount "data.rows.find { it.salespersonId == ${sp.id} }.totalAmount" equals "76"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today}"
    Then the JSON field "data.brands.find { it.brandId == ${brand.id} }.products.find { it.productId == ${retired.id} }" is absent

  Scenario: A product added today is not a column on an earlier day's dispatch sheet
    Given admin enables "milk" for everyone at price 22
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the JSON list "data.brands" has no item whose "brandId" is "${brand.id}"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today}"
    Then the JSON list "data.brands" contains an item whose "brandId" is "${brand.id}"

  Scenario: The stock balance view keeps a product that was received on a day even after it is disabled
    Given admin receives 5 of "milk" at 20 into "brand" on "${today-2}"
    And admin calls "DELETE /api/v1/products/${milk.id}"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}&includeReceipts=1"
    Then the JSON list "data.brands" contains an item whose "brandId" is "${brand.id}"
    And the JSON list "data.brands.find { it.brandId == ${brand.id} }.products" contains an item whose "productId" is "${milk.id}"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today}&includeReceipts=1"
    Then the JSON list "data.brands" has no item whose "brandId" is "${brand.id}"

  Scenario: Stock availability keeps a product that was received on a day after it is disabled, and does not list it earlier than it existed
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today-2}"
    Then the JSON list "data" has no item whose "productId" is "${milk.id}"
    Given admin receives 5 of "milk" at 20 into "brand" on "${today-2}"
    And admin calls "DELETE /api/v1/products/${milk.id}"
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today-2}"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.received" equals "5"
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today}"
    Then the JSON list "data" has no item whose "productId" is "${milk.id}"

  Scenario: Stock availability keeps a product that was only dispatched on a day, after it is disabled
    Given admin dispatches 2 of "milk" at 22 to "sp" on "${today-2}"
    And admin calls "DELETE /api/v1/products/${milk.id}"
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today-2}"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.dispatched" equals "2"

  Scenario: Stock availability lists a product from the day it was created
    When admin calls "GET /api/v1/stock-receipts/availability?date=${today}"
    Then the JSON list "data" contains an item whose "productId" is "${milk.id}"

  Scenario: The stock balance view also lists products that were received but are not for salespeople
    Given admin receives 5 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the JSON list "data.brands" has no item whose "brandId" is "${brand.id}"
    When admin calls "GET /api/v1/reports/daily-dispatch?date=${today-2}&includeReceipts=1"
    Then the JSON list "data.brands" contains an item whose "brandId" is "${brand.id}"

  @superadmin
  Scenario: A dispatcher sees the same blank rows as an admin
    When dispatcher calls "GET /api/v1/reports/daily-dispatch?date=${today-2}"
    Then the call succeeds
    And the JSON field "data.rows.find { it.salespersonId == ${sp.id} }.dispatchId" equals "null"
