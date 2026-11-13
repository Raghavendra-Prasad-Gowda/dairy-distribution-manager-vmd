@api @products @superadmin
Feature: Product setup
  Products are created in a throwaway brand (the API can only deactivate, not delete, a product), so
  nothing lands in a real brand's setup screens.

  Background:
    Given a throwaway brand "brand"

  Scenario: A product is created with its prices and appears in its brand's list
    Given the scenario works with an identifier "name"
    When admin calls "POST /api/v1/products" with:
      """
      { "brandId": ${brand.id}, "name": "${name}", "unitType": "ml", "unitSize": 500, "costPrice": 20, "sellingPrice": 25 }
      """
    Then the response status is 201
    And I remember the response data as "product"
    And afterwards admin cleans up with "DELETE /api/v1/products/${product.id}"
    And the JSON amount "data.costPrice" equals "20"
    And the JSON amount "data.sellingPrice" equals "25"
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON list "data" contains an item whose "name" is "${name}"
    And the JSON amount "data.find { it.id == ${product.id} }.costPrice" equals "20"
    And the JSON field "data.find { it.id == ${product.id} }.brand.id" equals "${brand.id}"

  Scenario: A product name is unique within its brand
    Given a throwaway product "product" in brand "brand"
    When admin calls "POST /api/v1/products" with:
      """
      { "brandId": ${brand.id}, "name": "${product.name}" }
      """
    Then the response status is 400
    And the error code is "DUPLICATE"

  Scenario Outline: Invalid products are refused
    When admin calls "POST /api/v1/products" with:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"

    Examples:
      | body                                                                       |
      | { "name": "E2E-no-brand" }                                                 |
      | { "brandId": 1 }                                                           |
      | { "brandId": 1, "name": "E2E-x", "unitType": "litre" }                     |
      | { "brandId": 1, "name": "E2E-x", "costPrice": -1 }                         |
      | { "brandId": 1, "name": "E2E-x", "containerType": "barrel" }               |
      | { "brandId": 1, "name": "E2E-x", "costPrice": 5, "effectiveFrom": "2020-01-01" } |

  Scenario: A cost price scheduled for the future is held back until its date
    Given the scenario works with an identifier "name"
    When admin calls "POST /api/v1/products" with:
      """
      { "brandId": ${brand.id}, "name": "${name}", "costPrice": 30, "effectiveFrom": "${today+3}" }
      """
    Then the response status is 201
    And I remember the response data as "product"
    And afterwards admin cleans up with "DELETE /api/v1/products/${product.id}"
    And the JSON amount "data.costPrice" equals "0"
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON amount "data.find { it.id == ${product.id} }.upcomingCostPrice" equals "30"
    And the JSON field "data.find { it.id == ${product.id} }.upcomingCostPriceFrom" contains "${today+3}"

  Scenario: A selling price scheduled for the future is held back until its date
    Given the scenario works with an identifier "name"
    When admin calls "POST /api/v1/products" with:
      """
      { "brandId": ${brand.id}, "name": "${name}", "sellingPrice": 40, "sellingPriceEffectiveFrom": "${today+5}" }
      """
    Then the response status is 201
    And I remember the response data as "product"
    And afterwards admin cleans up with "DELETE /api/v1/products/${product.id}"
    And the JSON amount "data.sellingPrice" equals "0"
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON amount "data.find { it.id == ${product.id} }.upcomingSellingPrice" equals "40"

  Scenario: Changing a price today takes effect immediately
    Given a throwaway product "product" in brand "brand"
    When admin calls "PUT /api/v1/products/${product.id}" with:
      """
      { "costPrice": 15, "sellingPrice": 18 }
      """
    Then the response status is 200
    And the JSON amount "data.costPrice" equals "15"
    And the JSON amount "data.sellingPrice" equals "18"
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON amount "data.find { it.id == ${product.id} }.costPrice" equals "15"

  Scenario: A price change scheduled for the future leaves today's price alone
    Given a throwaway product "product" in brand "brand"
    When admin calls "PUT /api/v1/products/${product.id}" with:
      """
      { "costPrice": 99, "effectiveFrom": "${today+7}" }
      """
    Then the response status is 200
    And the JSON amount "data.costPrice" equals "10"
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON amount "data.find { it.id == ${product.id} }.upcomingCostPrice" equals "99"

  Scenario Outline: A price cannot be backdated
    Given a throwaway product "product" in brand "brand"
    When admin calls "PUT /api/v1/products/${product.id}" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                    |
      | { "costPrice": 5, "effectiveFrom": "2020-01-01" }       |
      | { "sellingPrice": 5, "sellingPriceEffectiveFrom": "2020-01-01" } |
      | { "name": "" }                                          |

  Scenario: Other product details can be edited
    Given a throwaway product "product" in brand "brand"
    And the scenario works with an identifier "newName"
    When admin calls "PUT /api/v1/products/${product.id}" with:
      """
      { "name": "${newName}", "showInStockReceipt": false, "depositEnabled": true }
      """
    Then the response status is 200
    And the JSON field "data.name" equals "${newName}"
    And the JSON field "data.showInStockReceipt" equals "false"
    And the JSON field "data.depositEnabled" equals "true"

  Scenario: A deactivated product leaves the default list but stays visible on request
    Given a throwaway product "product" in brand "brand"
    When admin calls "DELETE /api/v1/products/${product.id}"
    Then the response status is 200
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON list "data" has no item whose "id" is "${product.id}"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&all=true"
    Then the JSON list "data" contains an item whose "id" is "${product.id}"
    And the JSON field "data.find { it.id == ${product.id} }.isActive" equals "false"

  Scenario Outline: Product ids are validated
    When admin calls "<method> /api/v1/products/<id>" with:
      """
      { "name": "E2E-x" }
      """
    Then the response status is <status>

    Examples:
      | method | id         | status |
      | PUT    | abc        | 400    |
      | PUT    | 2147483647 | 404    |
      | DELETE | abc        | 400    |
      | DELETE | 2147483647 | 404    |

  Scenario: Products can be reordered
    Given a throwaway product "first" in brand "brand"
    And a throwaway product "second" in brand "brand"
    When admin calls "PATCH /api/v1/products/reorder" with:
      """
      [ { "id": ${first.id}, "displayOrder": 9002 }, { "id": ${second.id}, "displayOrder": 9001 } ]
      """
    Then the response status is 200
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON list "data" is ordered by "name" as "${second.name}, ${first.name}"

  Scenario: Products come back with their category's display order
    Given a throwaway category "early" in brand "brand"
    And a throwaway category "late" in brand "brand"
    And a throwaway product "inLate" in brand "brand" with:
      """
      { "category": "${late.name}" }
      """
    And a throwaway product "inEarly" in brand "brand" with:
      """
      { "category": "${early.name}" }
      """
    When admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${early.id}, "displayOrder": 1 }, { "id": ${late.id}, "displayOrder": 2 } ]
      """
    Then the response status is 200
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the call succeeds
    And the JSON field "data.find { it.productId == ${inEarly.id} }.categoryDisplayOrder" equals "1"
    And the JSON field "data.find { it.productId == ${inLate.id} }.categoryDisplayOrder" equals "2"

  Scenario: A product is switched on for all salespeople only with a positive default price
    Given a throwaway product "product" in brand "brand"
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${product.id}, "isEnabled": true, "defaultPrice": 0 } ] }
      """
    Then the response status is 400
    And the error message contains "Default price"
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${product.id}, "isEnabled": true, "defaultPrice": 22 } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the JSON field "data.find { it.productId == ${product.id} }.salespersonEnabled" equals "true"
    And the JSON amount "data.find { it.productId == ${product.id} }.salespersonDefaultPrice" equals "22"

  Scenario Outline: Invalid global salesperson settings are refused
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      <body>
      """
    Then the response status is 400

    Examples:
      | body                                                      |
      | { "products": [] }                                        |
      | { }                                                       |
      | { "products": [ { "isEnabled": true } ] }                 |

  Scenario: Clearing a product's custom salesperson prices
    Given a throwaway product "product" in brand "brand" with:
      """
      { "sellingPrice": 12 }
      """
    When admin calls "DELETE /api/v1/products/${product.id}/salesperson-prices"
    Then the response status is 200
    And the JSON field "data.clearedCount" equals "0"
    When admin calls "DELETE /api/v1/products/2147483647/salesperson-prices"
    Then the response status is 404
    When admin calls "DELETE /api/v1/products/abc/salesperson-prices"
    Then the response status is 400

  Scenario: Salesmen cannot read or change global salesperson settings
    When salesman calls "GET /api/v1/products/salesperson-global"
    Then the response status is 403

  Scenario: Asking for products as of a date shows the cost price that applies on that date
    Given the scenario works with an identifier "name"
    When admin calls "POST /api/v1/products" with:
      """
      { "brandId": ${brand.id}, "name": "${name}", "costPrice": 30, "effectiveFrom": "${today+3}" }
      """
    Then I remember the response data as "product"
    And afterwards admin cleans up with "DELETE /api/v1/products/${product.id}"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today+3}"
    Then the JSON amount "data.find { it.id == ${product.id} }.costPrice" equals "30"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today}"
    Then the JSON amount "data.find { it.id == ${product.id} }.costPrice" equals "0"

  Scenario: Clearing a product's custom prices puts every salesperson back on the global price
    Given a salesperson with a clean ledger "sp"
    And a throwaway product "milk" in brand "brand"
    And admin enables "milk" for everyone at price 22
    And admin sets the price of "milk" for "sp" to 31
    When admin calls "DELETE /api/v1/products/${milk.id}/salesperson-prices"
    Then the response status is 200
    And the JSON field "data.clearedCount" equals "1"
    And the JSON field "data.message" contains "22"
    And the JSON field "data.clearedSalespersonIds[0]" equals "${sp.id}"
    When admin calls "GET /api/v1/salespeople/${sp.id}/prices"
    Then the JSON amount "data.find { it.productId == ${milk.id} }.sellingPrice" equals "22"

  Scenario: The global settings list carries everything the screen needs
    Given a throwaway product "milk" in brand "brand"
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the call succeeds
    And the JSON field "data.find { it.productId == ${milk.id} }.productName" equals "${milk.name}"
    And the JSON field "data.find { it.productId == ${milk.id} }.brandId" equals "${brand.id}"
    And the JSON field "data.find { it.productId == ${milk.id} }.brandName" equals "${brand.name}"
    And the JSON field "data.find { it.productId == ${milk.id} }.salespersonEnabled" equals "false"
    And the JSON amount "data.find { it.productId == ${milk.id} }.dairyCostPrice" equals "10"
    And the JSON amount "data.find { it.productId == ${milk.id} }.dairySellingPrice" equals "12"
    And the JSON field "data.find { it.productId == ${milk.id} }.displayOrder" is present
    And the JSON field "data.find { it.productId == ${milk.id} }.categoryDisplayOrder" equals "999"

  Scenario: Category order is looked up per brand, so the same category name can rank differently
    Given a throwaway brand "other"
    And a throwaway category "mine" in brand "brand"
    And a throwaway category "theirs" in brand "other"
    And admin calls "PATCH /api/v1/categories/reorder" with:
      """
      [ { "id": ${mine.id}, "displayOrder": 3 }, { "id": ${theirs.id}, "displayOrder": 8 } ]
      """
    And a throwaway product "inMine" in brand "brand" with:
      """
      { "category": "${mine.name}" }
      """
    And a throwaway product "inTheirs" in brand "other" with:
      """
      { "category": "${mine.name}" }
      """
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the JSON field "data.find { it.productId == ${inMine.id} }.categoryDisplayOrder" equals "3"
    And the JSON field "data.find { it.productId == ${inTheirs.id} }.categoryDisplayOrder" equals "999"

  Scenario: Global settings can change the price alone, both settings together, or several products at once
    Given a throwaway product "first" in brand "brand"
    And a throwaway product "second" in brand "brand"
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${first.id}, "defaultPrice": 19 } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the JSON amount "data.find { it.productId == ${first.id} }.salespersonDefaultPrice" equals "19"
    And the JSON field "data.find { it.productId == ${first.id} }.salespersonEnabled" equals "false"
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${first.id}, "isEnabled": true, "defaultPrice": 21 },
                      { "productId": ${second.id}, "isEnabled": true, "defaultPrice": 23 } ] }
      """
    Then the response status is 200
    And the JSON field "data.message" contains "2 products updated"
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the JSON amount "data.find { it.productId == ${first.id} }.salespersonDefaultPrice" equals "21"
    And the JSON field "data.find { it.productId == ${second.id} }.salespersonEnabled" equals "true"

  Scenario: Switching a product off does not need a price, and a negative price is refused
    Given a throwaway product "milk" in brand "brand"
    And admin enables "milk" for everyone at price 22
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": false } ] }
      """
    Then the response status is 200
    When admin calls "GET /api/v1/products/salesperson-global"
    Then the JSON field "data.find { it.productId == ${milk.id} }.salespersonEnabled" equals "false"
    When admin calls "PATCH /api/v1/products/salesperson-global" with:
      """
      { "products": [ { "productId": ${milk.id}, "isEnabled": true, "defaultPrice": -5 } ] }
      """
    Then the response status is 400

  # --- The product list follows the date being viewed (stock receipt screen) -------------------------
  # isActive / showInStockReceipt only describe a product today. A past day must keep showing what was
  # bought on it, and a product created today must not appear on earlier dates.

  Scenario: A product disabled later is still listed on a date it was bought, but not afterwards
    Given a throwaway product "milk" in brand "brand"
    And admin receives 6 of "milk" at 20 into "brand" on "${today-1}"
    When admin calls "DELETE /api/v1/products/${milk.id}"
    Then the call succeeds
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today-1}"
    Then the JSON list "data" contains an item whose "name" is "${milk.name}"
    And the JSON field "data.find { it.id == ${milk.id} }.hasReceiptOnDate" equals "true"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today}"
    Then the JSON list "data" has no item whose "name" is "${milk.name}"

  Scenario: A product created today is not listed on an earlier date
    Given a throwaway product "milk" in brand "brand"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today-1}"
    Then the JSON list "data" has no item whose "name" is "${milk.name}"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today}"
    Then the JSON list "data" contains an item whose "name" is "${milk.name}"
    And the JSON field "data.find { it.id == ${milk.id} }.hasReceiptOnDate" equals "false"

  Scenario: A new product that was back-dated stock on an earlier date is listed on that date
    Given a throwaway product "milk" in brand "brand"
    And admin receives 4 of "milk" at 20 into "brand" on "${today-2}"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today-2}"
    Then the JSON list "data" contains an item whose "name" is "${milk.name}"
    And the JSON field "data.find { it.id == ${milk.id} }.hasReceiptOnDate" equals "true"
    When admin calls "GET /api/v1/products?brandId=${brand.id}&date=${today-1}"
    Then the JSON list "data" has no item whose "name" is "${milk.name}"

  Scenario: The setup list with all=true ignores the date and still shows disabled products
    Given a throwaway product "milk" in brand "brand"
    When admin calls "DELETE /api/v1/products/${milk.id}"
    Then the call succeeds
    When admin calls "GET /api/v1/products?brandId=${brand.id}&all=true&date=${today-5}"
    Then the JSON list "data" contains an item whose "name" is "${milk.name}"
    And the JSON field "data.find { it.id == ${milk.id} }.hasReceiptOnDate" is absent

  Scenario: Without a date the list is the active products, as before
    Given a throwaway product "milk" in brand "brand"
    When admin calls "GET /api/v1/products?brandId=${brand.id}"
    Then the JSON list "data" contains an item whose "name" is "${milk.name}"
    And the JSON field "data.find { it.id == ${milk.id} }.hasReceiptOnDate" is absent
