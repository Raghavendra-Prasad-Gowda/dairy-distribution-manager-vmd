@api @reports @deposit @superadmin
Feature: Deposit summary
  The crate deposit a brand charges on qualifying stock, day by day, with a running total and any
  deposit already held before the app was used. Each scenario has its own throwaway brand.

  Background:
    Given a throwaway brand "brand"

  Scenario: A brand without deposit reports none
    Given a throwaway product "milk" in brand "brand"
    And admin receives 10 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the call succeeds
    And the JSON field "data.depositEnabled" equals "false"
    And the JSON amount "data.totalDeposit" equals "0"

  Scenario: Deposit is charged per litre on qualifying crate stock, with a running total across days
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And admin receives 24 of "crateMilk" at 20 into "brand" on "${today-3}"
    And admin receives 12 of "crateMilk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-4}&to=${today-1}"
    Then the call succeeds
    And the JSON field "data.brandName" equals "${brand.name}"
    And the JSON field "data.depositEnabled" equals "true"
    And the JSON amount "data.depositPerLitre" equals "2"
    And the JSON list "data.rows" has 2 items
    And the JSON amount "data.rows[0].dailyDeposit" equals "24"
    And the JSON amount "data.rows[0].runningTotal" equals "24"
    And the JSON amount "data.rows[1].dailyDeposit" equals "12"
    And the JSON amount "data.rows[1].runningTotal" equals "36"
    And the JSON amount "data.totalDeposit" equals "36"

  Scenario: Products that are not crates carry no deposit
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And a throwaway product "bottle" in brand "brand" with:
      """
      { "category": "${crates.name}", "unitType": "ml", "unitSize": 500, "containerType": "box", "unitsPerContainer": 12 }
      """
    And admin enables deposit on product "bottle"
    And admin receives 24 of "bottle" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the JSON amount "data.totalDeposit" equals "0"

  Scenario: Products sold by weight are charged per kilogram
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And a throwaway product "ghee" in brand "brand" with:
      """
      { "category": "${crates.name}", "unitType": "gram", "unitSize": 500, "containerType": "crate", "unitsPerContainer": 12 }
      """
    And admin enables deposit on product "ghee"
    And admin receives 24 of "ghee" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the JSON amount "data.totalDeposit" equals "24"

  Scenario: The same product received on several routes is one deposit line
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And a throwaway route "north" in brand "brand"
    And a throwaway route "south" in brand "brand"
    When admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "routeId": ${north.id},
        "items": [ { "productId": ${crateMilk.id}, "quantity": 12, "unitPrice": 20 } ] }
      """
    And admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}", "routeId": ${south.id},
        "items": [ { "productId": ${crateMilk.id}, "quantity": 24, "unitPrice": 20 } ] }
      """
    And admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the JSON list "data.rows[0].items" has 1 item
    And the JSON amount "data.rows[0].items[0].depositAmount" equals "36"

  Scenario: Deposit loaded before the period is carried into the opening figure and every running total
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      { "topUpDate": "${today-10}", "entries": [ { "brandId": ${brand.id}, "amount": 300 } ] }
      """
    And admin receives 24 of "crateMilk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the JSON amount "data.openingDeposit" equals "300"
    And the JSON amount "data.rows[0].runningTotal" equals "324"
    And the JSON amount "data.totalDeposit" equals "324"

  Scenario: Deposit loaded on a day without stock gets its own row, and merges into a day that has stock
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And admin receives 24 of "crateMilk" at 20 into "brand" on "${today-2}"
    And superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      { "topUpDate": "${today-3}", "entries": [ { "brandId": ${brand.id}, "amount": 100 } ] }
      """
    And superadmin calls "POST /api/v1/dairy-deposit-topups/bulk" with:
      """
      { "topUpDate": "${today-2}", "entries": [ { "brandId": ${brand.id}, "amount": 50 } ] }
      """
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-4}&to=${today-1}"
    Then the JSON list "data.rows" has 2 items
    And the JSON amount "data.rows[0].dailyDeposit" equals "100"
    And the JSON amount "data.rows[1].dailyDeposit" equals "74"
    And the JSON amount "data.rows[1].runningTotal" equals "174"
    And the JSON list "data.rows[1].items" has 2 items

  Scenario: Deposit lines follow the category order, then the product order
    Given a brand charging deposit of 2 per litre on crates of "crateMilk" in category "crates" of "brand"
    And a throwaway category "first" in brand "brand"
    And admin marks category "first" as deposit-bearing
    And a throwaway product "inFirst" in brand "brand" with:
      """
      { "category": "${first.name}", "unitType": "ml", "unitSize": 500, "containerType": "crate", "unitsPerContainer": 12 }
      """
    And admin enables deposit on product "inFirst"
    And admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${first.id}, "displayOrder": 1 }, { "id": ${crates.id}, "displayOrder": 2 } ]
      """
    And admin calls "POST /api/v1/stock-receipts/bulk" with:
      """
      { "brandId": ${brand.id}, "date": "${today-2}",
        "items": [ { "productId": ${crateMilk.id}, "quantity": 12, "unitPrice": 20 },
                   { "productId": ${inFirst.id}, "quantity": 12, "unitPrice": 20 } ] }
      """
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=${brand.id}&from=${today-3}&to=${today-1}"
    Then the JSON list "data.rows[0].items" is ordered by "productName" as "${inFirst.name}, ${crateMilk.name}"

  Scenario Outline: Deposit summary lookups are validated
    When admin calls "GET /api/v1/reports/deposit-summary?brandId=<brand>&from=2026-04-01&to=2026-04-30"
    Then the response status is <status>

    Examples:
      | brand      | status |
      | abc        | 400    |
      | 2147483647 | 404    |
