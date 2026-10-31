@api @pricing @superadmin
Feature: Salesperson prices and product access
  What each salesman may sell, and at which price. A product's global setting applies to everyone;
  per-salesman exceptions and scheduled prices override it. Everything is set up on a throwaway brand.

  The salesman who signs in during the run is reused as the subject of these scenarios: every price
  and exception is keyed by the scenario's own throwaway product, so scenarios cannot affect each other,
  and the backend limits /salespeople traffic to 30 requests a minute.

  Background:
    Given a throwaway brand "brand"
    And a throwaway product "milk" in brand "brand"
    And the run's salesman as "sp"

  Scenario: A product is hidden from salespeople until it is switched on globally
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the call succeeds
    And the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "false"
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": true, "defaultPrice": 22 } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "true"
    And the JSON amount "data.find { it.productId == ${milk.id} }.sellingPrice" equals "22"

  Scenario: A custom price overrides the global default from its effective date
    Given admin enables "milk" for everyone at price 22
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/bulk" with:
      """
      { "effectiveFrom": "${today}", "prices": [ { "productId": ${milk.id}, "sellingPrice": 30 } ] }
      """
    Then the response status is 200
    And the JSON field "data.message" contains "1 prices saved"
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.sellingPrice" equals "30"
    And the JSON field "data.find { it.productId == ${milk.id} }.effectiveFrom" contains "${today}"

  Scenario: A price scheduled for the future is shown as upcoming and today's price stays
    Given admin enables "milk" for everyone at price 22
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/bulk" with:
      """
      { "effectiveFrom": "${today+5}", "prices": [ { "productId": ${milk.id}, "sellingPrice": 35 } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.sellingPrice" equals "22"
    And the JSON amount "data.find { it.productId == ${milk.id} }.upcomingSellingPrice" equals "35"

  Scenario: Scheduling a newer future price replaces the earlier scheduled one
    Given admin enables "milk" for everyone at price 22
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/bulk" with:
      """
      { "effectiveFrom": "${today+5}", "prices": [ { "productId": ${milk.id}, "sellingPrice": 35 } ] }
      """
    Then the response status is 200
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/bulk" with:
      """
      { "effectiveFrom": "${today+9}", "prices": [ { "productId": ${milk.id}, "sellingPrice": 38 } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.upcomingSellingPrice" equals "38"

  Scenario Outline: Invalid price saves are refused
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/bulk" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                                                        |
      | { "effectiveFrom": "2020-01-01", "prices": [ { "productId": 1, "sellingPrice": 10 } ] }     |
      | { "effectiveFrom": "2999-13-45x", "prices": [] }                                            |
      | { "effectiveFrom": "2999-01-01", "prices": [ { "productId": 1, "sellingPrice": -5 } ] }     |
      | { "prices": [ { "productId": 1, "sellingPrice": 10 } ] }                                    |

  Scenario: Prices can be copied from another salesperson
    Given admin enables "milk" for everyone at price 22
    And a salesperson with a clean ledger "other"
    And admin sets the price of "milk" for "other" to 41
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/copy-from/${other.id}?brandId=${brand.id}"
    Then the response status is 200
    And the JSON field "data.message" contains "1 prices copied"
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.sellingPrice" equals "41"

  Scenario: Copying prices needs two different salespeople and a brand
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/copy-from/${sp.id}?brandId=${brand.id}"
    Then the response status is 400
    When admin calls "POST /api/v1/salespeople/${sp.id}/prices/copy-from/2147483647"
    Then the response status is 400

  Scenario: The same price can be set for several salespeople at once
    Given admin enables "milk" for everyone at price 22
    And a salesperson with a clean ledger "other"
    When admin calls "POST /api/v1/salespeople/bulk-update" with:
      """
      { "salespersonIds": [ ${sp.id}, ${other.id} ], "effectiveFrom": "${today}",
        "productPrices": [ { "productId": ${milk.id}, "sellingPrice": 27 } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${other.id}/prices"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.sellingPrice" equals "27"

  Scenario: A per-salesman exception overrides a product that is switched off globally
    When admin calls "GET /api/v1/salespeople/${sp.id}/products"
    Then the call succeeds
    And the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "false"
    When admin calls "POST /api/v1/salespeople/${sp.id}/products/bulk" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": true } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "true"

  Scenario: A per-salesman exception can switch off a product that is on globally
    Given admin enables "milk" for everyone at price 22
    When admin calls "POST /api/v1/salespeople/${sp.id}/products/bulk" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": false } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "false"

  Scenario: Switching a product globally resets every exception
    Given admin enables "milk" for everyone at price 22
    And admin calls "POST /api/v1/salespeople/${sp.id}/products/bulk" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": false } ] }
      """
    When admin enables "milk" for everyone at price 25
    And admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "true"

  Scenario: Exceptions can be set for several salespeople at once
    Given a salesperson with a clean ledger "other"
    When admin calls "POST /api/v1/salespeople/products/bulk-update" with:
      """
      { "salespersonIds": [ ${sp.id}, ${other.id} ], "products": [ { "productId": ${milk.id}, "isEnabled": true } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/salespeople/${other.id}/products"
    Then the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "true"

  Scenario Outline: Invalid exception saves are refused
    When admin calls "POST /api/v1/salespeople/${sp.id}/products/bulk" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                          |
      | { "products": [] }                                            |
      | { }                                                           |
      | { "products": [ { "productId": 1, "isEnabled": "yes" } ] }    |

  Scenario: The exception list carries each product's category display order
    Given a throwaway category "cat" in brand "brand"
    And a throwaway product "inCat" in brand "brand" with:
      """
      { "category": "${cat.name}" }
      """
    When admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${cat.id}, "displayOrder": 4 } ]
      """
    And admin calls "GET /api/v1/salespeople/${sp.id}/products"
    Then the JSON field "data.find { it.productId == ${inCat.id} }.categoryDisplayOrder" equals "4"

  Scenario: A salesman sees only the products enabled for them, and only their own prices
    Given a salesperson with a clean ledger "other"
    And admin enables "milk" for everyone at price 22
    When salesman calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the call succeeds
    And the JSON field "data.find { it.productId == ${milk.id} }.isEnabled" equals "true"
    When salesman calls "GET /api/v1/salespeople/${other.id}/prices"
    Then the response status is 403
    When admin switches "milk" off for everyone
    And salesman calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON list "data" has no item whose "productId" is "${milk.id}"

  Scenario: Salesmen cannot change prices or exceptions
    When salesman calls "POST /api/v1/salespeople/${sp.id}/prices/bulk" with:
      """
      { "effectiveFrom": "${today}", "prices": [] }
      """
    Then the response status is 403
    When salesman calls "GET /api/v1/salespeople/${sp.id}/products"
    Then the response status is 403
